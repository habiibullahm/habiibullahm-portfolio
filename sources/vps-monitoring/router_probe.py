#!/usr/bin/env python3
"""9Router live model probe for the VPS Monitor.

Reads the 9Router SQLite database (read-only) to learn which providers are
active and which models the chat combos use, then sends a tiny "ping" chat
completion per model through the local 9Router endpoint and records latency
and status.

The API key is read from the 9Router key table and is never written to the
output file. Only model names, status, latency and error text are published.

Writes /home/ubuntu/vps-monitor/router_state.json for monitor.py to serve.
"""
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB = Path.home() / ".9router" / "db" / "data.sqlite"
OUT = HERE / "router_state.json"
API = "http://127.0.0.1:20128/v1/chat/completions"
PROBE_TIMEOUT = 25
MAX_PROBE_CONCURRENCY = 6


def db_conn():
    return sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=5)


def read_key(con):
    rows = con.execute(
        "SELECT name, key FROM apiKeys WHERE isActive=1 ORDER BY CASE WHEN name='Hermes local' THEN 0 ELSE 1 END"
    ).fetchall()
    for _, key in rows:
        if key:
            return key
    return ""


def read_combos(con):
    out = []
    for name, models in con.execute("SELECT name, models FROM combos"):
        try:
            lst = json.loads(models)
        except Exception:
            continue
        if not isinstance(lst, list):
            continue
        out.append({"name": name, "count": len(lst), "models": lst})
    out.sort(key=lambda c: c["name"])
    return out


def read_providers(con):
    """Only fields that are safe to publish. Credentials stay inside 'data'."""
    out = []
    for prov, name, is_active, data in con.execute(
        "SELECT provider, name, isActive, data FROM providerConnections ORDER BY provider"
    ):
        try:
            d = json.loads(data) if data else {}
        except Exception:
            d = {}
        psd = d.get("providerSpecificData") or {}
        out.append({
            "provider": prov,
            "name": name or prov,
            "active": bool(is_active),
            "status": d.get("testStatus"),
            "error_code": d.get("errorCode"),
            "last_error": (str(d.get("lastError"))[:160] if d.get("lastError") else None),
            "last_error_at": d.get("lastErrorAt"),
            "backoff_level": d.get("backoffLevel") or 0,
            "rate_limited_until": d.get("rateLimitedUntil"),
            "proxy": bool(psd.get("connectionProxyEnabled")),
            "proxy_url": psd.get("connectionProxyUrl") or None,
        })
    return out


def read_usage(con):
    now = datetime_utc()
    rows = con.execute(
        "SELECT provider, COUNT(*), COALESCE(SUM(cost),0) FROM usageHistory WHERE timestamp >= ? GROUP BY provider",
        (now["h1"],),
    ).fetchall()
    hour = {p: {"requests": n, "cost": round(c, 6)} for p, n, c in rows}
    rows = con.execute(
        "SELECT provider, COUNT(*), COALESCE(SUM(cost),0) FROM usageHistory WHERE timestamp >= ? GROUP BY provider",
        (now["h24"],),
    ).fetchall()
    day = {p: {"requests": n, "cost": round(c, 6)} for p, n, c in rows}
    total = con.execute("SELECT COUNT(*), COALESCE(SUM(cost),0) FROM usageHistory WHERE timestamp >= ?", (now["h24"],)).fetchone()
    return {"hour": hour, "day": day, "day_total": {"requests": total[0], "cost": round(total[1], 4)}}


def datetime_utc():
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    return {
        "h1": (now - datetime.timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "h24": (now - datetime.timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }


def probe(model, key):
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 5,
    }).encode()
    req = urllib.request.Request(
        API, data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=PROBE_TIMEOUT) as r:
            r.read(64)
            return {"model": model, "ok": True, "status": r.status,
                    "latency_ms": int((time.time() - t0) * 1000), "error": None,
                    "checked_at": time.time()}
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "ignore")[:140]
        except Exception:
            pass
        return {"model": model, "ok": False, "status": e.code,
                "latency_ms": int((time.time() - t0) * 1000), "error": detail or str(e),
                "checked_at": time.time()}
    except Exception as e:
        return {"model": model, "ok": False, "status": None,
                "latency_ms": int((time.time() - t0) * 1000), "error": str(e)[:140],
                "checked_at": time.time()}


def run_probe(model, key):
    try:
        return probe(model, key)
    except Exception as e:
        return {"model": model, "ok": False, "status": None, "latency_ms": 0,
                "error": str(e)[:140], "checked_at": time.time()}


def main():
    if not DB.exists():
        print("no 9router database")
        return 1
    con = db_conn()
    try:
        key = read_key(con)
        combos = read_combos(con)
        providers = read_providers(con)
        usage = read_usage(con)
    finally:
        con.close()

    # Probe every model used by the chat combos. Duplicates are removed.
    models = []
    for c in combos:
        for m in c["models"]:
            if isinstance(m, str) and m and m not in models:
                models.append(m)

    results = []
    if key and models:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=MAX_PROBE_CONCURRENCY) as pool:
            results = list(pool.map(lambda m: run_probe(m, key), models))

    state = {
        "updated_at": time.time(),
        "probe_count": len(results),
        "models": sorted(results, key=lambda r: (not r["ok"], r["latency_ms"])),
        "providers": providers,
        "combos": combos,
        "usage": usage,
        "combos_total": len(combos),
    }
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1))
    os.replace(tmp, OUT)
    ok = sum(1 for r in results if r["ok"])
    print(f"probed {len(results)} models, {ok} ok -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
