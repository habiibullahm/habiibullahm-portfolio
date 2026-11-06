#!/usr/bin/env python3
"""Private VPS monitor. Python stdlib only, no external calls.

Binds 127.0.0.1 only (view it through an SSH tunnel). Reads /proc, a few
systemd/port checks and Hermes status files. It never reads .env files,
tokens, prompts, message content or process command lines.
"""
import json
import os
import re
import socket
import sqlite3
import subprocess
import threading
import time
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

PORT = int(os.environ.get("VPSMON_PORT", "19999"))
BIND = "127.0.0.1"
HERE = Path(__file__).resolve().parent
HOME = Path.home()
SAMPLE_S = 5
SLOW_S = 15
HISTORY_N = 720  # 1 hour at 5 s
PAGE = os.sysconf("SC_PAGE_SIZE")
TICKS = os.sysconf("SC_CLK_TCK")
CORES = os.cpu_count() or 1

# (warn, crit). Edit here only; the UI reads levels from the API.
TH = {
    "cpu": (70, 90),            # % averaged over the last minute
    "load": (1.0, 2.0),         # 5 min load per core
    "ram_avail_low": (20, 10),  # % available, lower is worse
    "disk": (80, 90),           # % used on /
    "swap": (40, 80),           # % used
}

SERVICES = [
    {"name": "Hermes gateway", "user_unit": "hermes-gateway.service", "pidfile": "gateway"},
    {"name": "Hermes API forward", "user_unit": "hermes-api-fwd.service"},
    {"name": "9Router", "unit": "9router", "port": 20128},
    {"name": "WhatsApp bridge (Juragan)", "port": 3001},
    {"name": "Docker", "unit": "docker"},
    {"name": "docex", "port": 7860},
    {"name": "SSH", "unit": "ssh"},
    {"name": "Coolify", "port": 8000, "optional": True},
]

# Platforms that are switched off on purpose (profile, platform): shown as "off", never alerted.
EXPECTED_OFF = {("default", "whatsapp")}
CRON_ALERT_WINDOW_S = 48 * 3600  # only alert on failures from the last 2 days

lock = threading.Lock()
hist = deque(maxlen=HISTORY_N)
slow = {"services": [], "platforms": [], "cron": [], "procs": []}
active = {}
alog = deque(maxlen=40)
started = time.time()


def read(path):
    with open(path) as f:
        return f.read()


def safe(fn, default):
    try:
        return fn()
    except Exception:
        return default


# ---------- fast sampling (/proc) ----------
def cpu_times():
    v = [int(x) for x in read("/proc/stat").split("\n", 1)[0].split()[1:9]]
    return sum(v), v[3] + v[4]


def meminfo():
    d = {}
    for line in read("/proc/meminfo").splitlines():
        k, _, rest = line.partition(":")
        d[k] = int(rest.split()[0]) * 1024
    return d


def net_bytes():
    rx = tx = 0
    for line in read("/proc/net/dev").splitlines()[2:]:
        name, _, rest = line.partition(":")
        name = name.strip()
        if name == "lo" or name.startswith(("docker", "br-", "veth")):
            continue
        f = rest.split()
        rx += int(f[0])
        tx += int(f[8])
    return rx, tx


_DISK_RE = re.compile(r"^(vd[a-z]|sd[a-z]|xvd[a-z]|nvme\d+n\d+)$")


def disk_sectors():
    r = w = 0
    for line in read("/proc/diskstats").splitlines():
        f = line.split()
        if _DISK_RE.match(f[2]):
            r += int(f[5])
            w += int(f[9])
    return r * 512, w * 512


def raw():
    return {"t": time.time(), "cpu": cpu_times(), "net": net_bytes(), "disk": disk_sectors()}


def make_point(prev, cur):
    dt = max(cur["t"] - prev["t"], 0.001)
    dtot = cur["cpu"][0] - prev["cpu"][0]
    didle = cur["cpu"][1] - prev["cpu"][1]
    cpu = 100.0 * (dtot - didle) / dtot if dtot > 0 else 0.0
    rate = lambda a, b: max(0.0, (b - a) / dt)
    m = meminfo()
    st = os.statvfs("/")
    disk_total = st.f_blocks * st.f_frsize
    disk_used = (st.f_blocks - st.f_bfree) * st.f_frsize
    return {
        "t": round(cur["t"], 1),
        "cpu": round(cpu, 1),
        "load": [round(x, 2) for x in os.getloadavg()],
        "ram_total": m["MemTotal"],
        "ram_avail": m["MemAvailable"],
        "swap_total": m["SwapTotal"],
        "swap_used": m["SwapTotal"] - m["SwapFree"],
        "disk_total": disk_total,
        "disk_used": disk_used,
        "rx": rate(prev["net"][0], cur["net"][0]),
        "tx": rate(prev["net"][1], cur["net"][1]),
        "dr": rate(prev["disk"][0], cur["disk"][0]),
        "dw": rate(prev["disk"][1], cur["disk"][1]),
    }


def sampler(prev):
    while True:
        time.sleep(SAMPLE_S)
        cur = safe(raw, None)
        if cur is None:
            continue
        p = safe(lambda: make_point(prev, cur), None)
        if p:
            with lock:
                hist.append(p)
        prev = cur


# ---------- slow checks ----------
def tcp_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.6):
            return True
    except OSError:
        return False


def unit_active(unit, user=False):
    cmd = ["systemctl"] + (["--user"] if user else []) + ["is-active", unit]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=4)
    return r.stdout.strip() == "active"


def pid_uptime(pid):
    start = int(read(f"/proc/{pid}/stat").rsplit(")", 1)[1].split()[19]) / TICKS
    return float(read("/proc/uptime").split()[0]) - start


def hermes_state_files():
    files = [("default", HOME / ".hermes" / "gateway_state.json")]
    for p in sorted((HOME / ".hermes" / "profiles").glob("*/gateway_state.json")):
        files.append((p.parent.name, p))
    return files


def check_services():
    out = []
    gw_pid = None
    try:
        gw_pid = int(json.loads((HOME / ".hermes" / "gateway_state.json").read_text()).get("pid"))
    except Exception:
        pass
    for s in SERVICES:
        checks, notes = [], []
        if "user_unit" in s:
            checks.append(safe(lambda: unit_active(s["user_unit"], True), False))
            notes.append("systemd user")
        if "unit" in s:
            checks.append(safe(lambda: unit_active(s["unit"]), False))
            notes.append("systemd")
        if "port" in s:
            checks.append(tcp_open(s["port"]))
            notes.append("port " + str(s["port"]))
        up = bool(checks) and all(checks)
        extra = ""
        if s.get("pidfile") and up and gw_pid:
            up_s = safe(lambda: pid_uptime(gw_pid), None)
            if up_s is not None:
                extra = f"PID {gw_pid}, up {int(up_s)} s"
        if up:
            status = "ok"
        else:
            status = "off" if s.get("optional") else "down"
        out.append({"name": s["name"], "status": status, "detail": ", ".join(notes), "extra": extra,
                    "optional": bool(s.get("optional"))})
    return out


SCREEN_DIR = HOME / ".hermes" / "profiles" / "juragan" / "bot-desktop"
ROUTER_STATE = HERE / "router_state.json"


def check_router():
    """9Router live model health, written by router_probe.py."""
    try:
        d = json.loads(ROUTER_STATE.read_text())
    except Exception:
        return {"available": False, "models": [], "providers": [], "combos": [],
                "usage": {}, "updated_at": None}
    models = d.get("models") or []
    ok = sum(1 for m in models if m.get("ok"))
    return {
        "available": True,
        "updated_at": d.get("updated_at"),
        "models": models,
        "providers": d.get("providers") or [],
        "combos": d.get("combos") or [],
        "usage": d.get("usage") or {},
        "total": len(models),
        "ok": ok,
        "failed": len(models) - ok,
    }


def check_shopee():
    """Juragan Screen and Seller Centre login state. Reads only tab host and path, never cookies, titles or queries."""
    rows = []
    up = False
    try:
        s = socket.socket(socket.AF_UNIX)
        s.settimeout(0.6)
        s.connect(str(SCREEN_DIR / "rfb.sock"))
        s.close()
        up = True
    except OSError:
        pass
    rows.append({"name": "Juragan Screen", "status": "ok" if up else "off",
                 "label": "running" if up else "stopped, starts on demand",
                 "detail": "bot desktop", "extra": "", "optional": True})
    status, label, alert = "off", "browser not open", None
    try:
        port = int((SCREEN_DIR / "browser-profile" / "DevToolsActivePort").read_text().split()[0])
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=1.5) as r:
            tabs = [urlparse(t.get("url", "")) for t in json.load(r) if t.get("type") == "page"]
        if any(u.netloc == "seller.shopee.co.id" and "login" not in u.path for u in tabs):
            status, label = "ok", "logged in"
        elif any("shopee" in u.netloc and "login" in u.path for u in tabs):
            status, label, alert = "down", "logged out", "Shopee Seller Centre is logged out"
        else:
            label = "browser open, no Shopee tab"
    except Exception:
        pass
    rows.append({"name": "Shopee Seller Centre session", "status": status, "label": label,
                 "alert": alert, "detail": "Screen browser tab", "extra": "", "optional": True})
    return rows


def check_platforms():
    out = []
    for label, p in hermes_state_files():
        try:
            d = json.loads(p.read_text())
        except Exception:
            continue
        for name, v in (d.get("platforms") or {}).items():
            off = (label, name) in EXPECTED_OFF
            out.append({
                "profile": label,
                "platform": name,
                "state": "off (intentional)" if off else str(v.get("state")),
                "attention": bool(v.get("needs_attention")),
                "updated": v.get("updated_at"),
            })
    return out


def is_recent(iso):
    try:
        return time.time() - datetime.fromisoformat(iso).timestamp() <= CRON_ALERT_WINDOW_S
    except Exception:
        return False


def check_cron():
    rows = []
    bases = [("default", HOME / ".hermes")] + [(p.name, p) for p in sorted((HOME / ".hermes" / "profiles").glob("*")) if p.is_dir()]
    for label, base in bases:
        f = base / "cron" / "jobs.json"
        if not f.exists():
            continue
        try:
            d = json.loads(f.read_text())
        except Exception:
            rows.append({"profile": label, "total": None, "enabled": None, "paused": None, "failing": None, "error": True})
            continue
        jobs = d.get("jobs", []) if isinstance(d, dict) else d
        enabled = [j for j in jobs if j.get("enabled") and j.get("state") != "paused"]
        failing = [j for j in enabled if (j.get("failure_streak") or 0) > 0]
        recent = [j for j in failing if is_recent(j.get("last_run_at"))]
        rows.append({"profile": label, "total": len(jobs), "enabled": len(enabled),
                     "paused": len(jobs) - len(enabled), "failing": len(failing),
                     "recent_failing": len(recent),
                     "failing_names": [str(j.get("name"))[:60] for j in recent][:5]})
    return rows


def top_procs(n=6):
    agg = {}
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        try:
            rss = int(read(f"/proc/{d}/statm").split()[1]) * PAGE
            comm = read(f"/proc/{d}/comm").strip().split(" (")[0]
        except Exception:
            continue
        a = agg.setdefault(comm, [0, 0])
        a[0] += rss
        a[1] += 1
    top = sorted(agg.items(), key=lambda kv: kv[1][0], reverse=True)[:n]
    return [{"name": k, "rss": v[0], "count": v[1]} for k, v in top]


# ---------- levels and alerts ----------
def level_hi(v, th):
    return "crit" if v >= th[1] else "warn" if v >= th[0] else "ok"


def level_lo(v, th):
    return "crit" if v <= th[1] else "warn" if v <= th[0] else "ok"


def levels(p, recent):
    cpu_avg = sum(x["cpu"] for x in recent) / len(recent) if recent else p["cpu"]
    return {
        "cpu": level_hi(cpu_avg, TH["cpu"]),
        "load": level_hi(p["load"][1] / CORES, TH["load"]),
        "ram": level_lo(100.0 * p["ram_avail"] / p["ram_total"], TH["ram_avail_low"]),
        "disk": level_hi(100.0 * p["disk_used"] / p["disk_total"], TH["disk"]),
        "swap": level_hi(100.0 * p["swap_used"] / p["swap_total"], TH["swap"]) if p["swap_total"] else "ok",
        "cpu_avg": round(cpu_avg, 1),
    }


def evaluate(p, lv, services, platforms, cron, router=None):
    found = {}
    pct = lambda a, b: 100.0 * a / b if b else 0.0
    if lv["cpu"] != "ok":
        found["cpu"] = (lv["cpu"], "High CPU", f"{lv['cpu_avg']}% average over the last minute")
    if lv["load"] != "ok":
        found["load"] = (lv["load"], "High load", f"5 min load {p['load'][1]} on {CORES} cores")
    if lv["ram"] != "ok":
        found["ram"] = (lv["ram"], "Low available memory", f"{pct(p['ram_avail'], p['ram_total']):.0f}% of RAM available")
    if lv["disk"] != "ok":
        found["disk"] = (lv["disk"], "Disk filling up", f"{pct(p['disk_used'], p['disk_total']):.0f}% of / used")
    if lv["swap"] != "ok":
        found["swap"] = (lv["swap"], "Swap in heavy use", f"{pct(p['swap_used'], p['swap_total']):.0f}% of swap used, check memory-heavy processes")
    for s in services:
        if s["status"] == "down":
            if s.get("alert"):
                found["svc:" + s["name"]] = ("warn", s["alert"], "needs a manual sign-in via Take over on the Screen")
            else:
                found["svc:" + s["name"]] = ("crit", s["name"] + " is down", s["detail"])
    for pl in platforms:
        st = pl["state"].lower()
        if st in ("connected", "running", "disabled", "none") or st.startswith("off"):
            if pl["attention"]:
                found[f"pl:{pl['profile']}:{pl['platform']}"] = ("warn", f"{pl['profile']}:{pl['platform']} needs attention", f"state {pl['state']}")
            continue
        found[f"pl:{pl['profile']}:{pl['platform']}"] = ("crit" if pl["attention"] else "warn",
                                                         f"{pl['profile']}:{pl['platform']} is {pl['state']}", "from gateway_state.json")
    for c in cron:
        if c.get("recent_failing"):
            found["cron:" + c["profile"]] = ("warn", f"Cron failed in the last 2 days ({c['profile']})", ", ".join(c["failing_names"]))
    if router and router.get("available"):
        # A provider's own testStatus can be stale, so only raise a provider
        # alert when a model routed through that provider also failed the probe.
        prefix_provider = {
            "ag": "antigravity", "cbai": "codebuddy-intl", "cf": "cloudflare-ai",
            "groq": "groq", "kgw": "kilo-gateway", "nous": "nous",
            "openrouter": "openrouter", "deepseek-web": "deepseek-web", "nvidia": "nvidia",
        }
        failed_prefixes = set()
        for m in router.get("models") or []:
            if not m.get("ok"):
                pre = (m.get("model") or "").split("/")[0]
                if pre in prefix_provider:
                    failed_prefixes.add(prefix_provider[pre])
        for pr in router.get("providers") or []:
            if not pr.get("active"):
                continue
            if pr["provider"] not in failed_prefixes:
                continue
            if pr.get("status") in ("active", "available", None):
                continue
            found["rp:" + pr["provider"]] = (
                "warn",
                f"9Router provider {pr['provider']} is {pr.get('status')}",
                (pr.get("last_error") or "")[:140],
            )
        failed = [m for m in (router.get("models") or []) if not m.get("ok")]
        if failed and len(failed) == router.get("total"):
            found["rp:all"] = ("crit", "All 9Router models failed the live probe", ", ".join(m["model"] for m in failed[:4]))
    now = time.time()
    with lock:
        for k, (sev, title, detail) in found.items():
            cur = active.get(k)
            if cur is None:
                active[k] = {"id": k, "sev": sev, "title": title, "detail": detail, "since": now}
                alog.appendleft({"ts": now, "event": "raised", "sev": sev, "title": title})
            else:
                cur.update(sev=sev, title=title, detail=detail)
        for k in list(active):
            if k not in found:
                a = active.pop(k)
                alog.appendleft({"ts": now, "event": "resolved", "sev": a["sev"], "title": a["title"]})


def slow_loop():
    while True:
        try:
            refresh_slow()
        except Exception:
            pass
        time.sleep(SLOW_S)


def refresh_slow():
    services = safe(check_services, []) + safe(check_shopee, [])
    platforms = safe(check_platforms, [])
    cron = safe(check_cron, [])
    procs = safe(top_procs, [])
    router = safe(check_router, {"available": False, "models": [], "providers": []})
    with lock:
        slow.update(services=services, platforms=platforms, cron=cron, procs=procs, router=router)
        p = hist[-1] if hist else None
        recent = list(hist)[-12:]
    if p:
        evaluate(p, levels(p, recent), services, platforms, cron, router)


# ---------- HTTP ----------
HEADERS = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
}
STATIC = {"/": ("index.html", "text/html; charset=utf-8"),
          "/app.css": ("app.css", "text/css; charset=utf-8"),
          "/app.js": ("app.js", "application/javascript; charset=utf-8")}
LOCAL_HOSTS = {"127.0.0.1", "localhost", "[::1]"}


def snapshot():
    with lock:
        p = hist[-1] if hist else None
        recent = list(hist)[-12:]
        data = {k: list(v) if isinstance(v, list) else v for k, v in slow.items()}
        act = sorted(active.values(), key=lambda a: (a["sev"] != "crit", a["since"]))
        log = list(alog)
    if not p:
        return {"ready": False}
    up = float(read("/proc/uptime").split()[0])
    return {
        "ready": True, "now": time.time(), "point": p, "host": socket.gethostname(), "cores": CORES,
        "uptime_s": up, "monitor_up_s": time.time() - started, "levels": levels(p, recent),
        "services": data["services"], "platforms": data["platforms"], "cron": data["cron"],
        "procs": data["procs"], "alerts": act, "events": log,
        "router": data.get("router") or {"available": False},
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "vpsmon"
    sys_version = ""

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0] if not (self.headers.get("Host") or "").startswith("[") else "[::1]"
        if host not in LOCAL_HOSTS:
            return self._send(403, b"forbidden", "text/plain")
        path = self.path.split("?", 1)[0]
        if path in STATIC:
            name, ctype = STATIC[path]
            return self._send(200, (HERE / name).read_bytes(), ctype)
        if path == "/api/snapshot":
            return self._send(200, json.dumps(snapshot()).encode(), "application/json")
        if path == "/api/history":
            with lock:
                pts = list(hist)
            return self._send(200, json.dumps(pts).encode(), "application/json")
        if path == "/healthz":
            return self._send(200, b"ok", "text/plain")
        self._send(404, b"not found", "text/plain")


def main():
    prev = raw()
    time.sleep(0.6)
    cur = raw()
    hist.append(make_point(prev, cur))
    refresh_slow()
    threading.Thread(target=sampler, args=(cur,), daemon=True).start()
    threading.Thread(target=slow_loop, daemon=True).start()
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
