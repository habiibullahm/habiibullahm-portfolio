"""Juragan recap ingest: listen-only handling of the approved WhatsApp recap group.

pre_gateway_dispatch runs before the agent. For the configured group only:
  - recap-format text from the configured sender -> logged to the Sheet by ingest_cli.py in a worker
    thread, then the message is dropped (no agent turn, nothing posted in the group); the result is
    reported to the configured DM only
  - slash command, @mention of the bot, or reply to the bot -> normal dispatch (the agent answers)
  - everything else -> dropped silently
Any error inside the group path also drops the message, so a bug can never turn into group spam.
"""
import json
import logging
import subprocess
import threading
import time
from pathlib import Path

from .core import parse_recap

log = logging.getLogger("juragan_recap_ingest")
HERE = Path(__file__).resolve().parent
_cfg_cache = {}


def _cfg():
    p = HERE / "config.json"
    m = p.stat().st_mtime
    if _cfg_cache.get("m") != m:
        _cfg_cache["v"] = json.loads(p.read_text())
        _cfg_cache["m"] = m
    return _cfg_cache["v"]


def _plain(x):
    return getattr(x, "value", x)


def _norm_id(v):
    import re
    return re.sub(r":\d+(?=@)", "", str(v or "").strip())


def _sender_ok(event, cfg):
    from gateway.whatsapp_identity import expand_whatsapp_aliases, normalize_whatsapp_identifier
    raw = event.raw_message if isinstance(event.raw_message, dict) else {}
    cands = {str(getattr(event.source, "user_id", "") or ""), str(raw.get("senderId") or ""), str(raw.get("participant") or "")}
    aliases = set()
    for c in cands:
        if c:
            aliases |= expand_whatsapp_aliases(c)
    for entry in cfg["senders"]:
        if normalize_whatsapp_identifier(entry) in aliases or (expand_whatsapp_aliases(entry) & aliases):
            return True
    return False


def _addressed(event, text):
    raw = event.raw_message if isinstance(event.raw_message, dict) else {}
    if text.strip().startswith("/") or getattr(event, "reply_to_is_own_message", False):
        return True
    bots = {_norm_id(b) for b in (raw.get("botIds") or [])}
    mentioned = {_norm_id(m) for m in (raw.get("mentionedIds") or [])}
    return bool(bots & mentioned)


def _send(cfg, to, text):
    try:
        r = subprocess.run(["hermes", "-p", "juragan", "send", "-t", "whatsapp:" + to, "-q", text],
                           capture_output=True, text=True, timeout=90)
        _trace(f"send rc={r.returncode} to_tail={to[-8:]} len={len(text)}")
    except Exception as e:
        _trace("send failed " + type(e).__name__)


def _dm(cfg, text):
    _send(cfg, cfg["dm"], text)


def _work(orders, cfg):
    started = time.strftime("%F %T")
    try:
        cmd = [cfg["uv"], "run", "--quiet", "--with", "google-api-python-client", "--with", "google-auth-oauthlib",
               "--with", "google-auth-httplib2", "python", str(HERE / "ingest_cli.py")]
        r = subprocess.run(cmd, input=json.dumps({"orders": orders}), capture_output=True, text=True, timeout=240)
        out = json.loads(r.stdout.strip().splitlines()[-1]) if r.stdout.strip() else {"error": "no output: " + r.stderr[-120:]}
    except Exception as e:
        out = {"error": type(e).__name__}
    line = {"ts": started, "orders": [(o["user"], len(o["items"])) for o in orders], **{k: out.get(k) for k in ("dry_run", "written", "marked", "skipped", "error")}}
    with open(HERE / "ingest.log", "a") as f:
        f.write(json.dumps(line, ensure_ascii=False) + "\n")
    if out.get("dry_run"):
        return
    # One short message per paste, one line per order, usernames only. Only the "WA Rekapan" column (Q)
    # is ever touched; "WA Habib Jastip" (N) is intentionally ignored.
    why = {"exact duplicate": "isi sama persis dengan yang sudah ada, tidak dicatat dobel",
           "already posted": "sudah ditandai ya di WA Rekapan, tidak diproses ulang",
           "no free rows before footer": "tidak ada baris kosong sebelum TOTAL READY, sisipkan baris dulu"}
    lines = []
    for w in out.get("written") or []:
        lines.append(f"✅ Tercatat: {w['user']} (NO {w['no']}, {w['items']} item), WA Rekapan = ya")
    for m in out.get("marked") or []:
        lines.append(f"✅ Ditandai sudah direkap: {m['user']} (NO {m['no']}), WA Rekapan = ya")
    for s in out.get("skipped") or []:
        if s["reason"] != "already ingested":
            lines.append(f"⚠️ {s['user']}: {why.get(s['reason'], s['reason'])}")
    if out.get("error"):
        lines.append("⚠️ Gagal mencatat rekap ke Sheet: " + str(out["error"])[:160])
    if lines:
        # Everything is reported in Muhammad's DM; the group stays completely silent.
        _dm(cfg, "Rekap grup:\n" + "\n".join(lines))


def _trace(msg):
    """Tiny diagnostic trail (ids shortened, no message text). Remove once verified."""
    try:
        with open(HERE / "hook.log", "a") as f:
            f.write(time.strftime("%F %T ") + msg + "\n")
    except Exception:
        pass


def _hook(event, gateway=None, session_store=None, **kw):
    try:
        src = event.source
        plat = str(_plain(src.platform)).lower()
        cid = str(getattr(src, "chat_id", "") or "")
        cfg = _cfg()
        hit = "whatsapp" in plat and cfg["group"] in cid
        _trace(f"call plat={plat} chat_tail={cid[-10:]} group_match={hit}")
        if not hit:
            return None
    except Exception as e:
        _trace("pre-filter error " + type(e).__name__ + ": " + str(e)[:120])
        return None
    try:  # from here on: this is the recap group, so never fall through to the agent by accident
        text = event.text or ""
        addressed = _addressed(event, text)
        _trace(f"group msg addressed={addressed} text_len={len(text)}")
        if addressed:
            return None
        ok = _sender_ok(event, cfg)
        orders = parse_recap(text) if ok else []
        _trace(f"sender_ok={ok} orders={len(orders)}")
        if orders:
            threading.Thread(target=_work, args=(orders, cfg), daemon=True).start()
            return {"action": "skip", "reason": "recap-ingested"}
        return {"action": "skip", "reason": "recap-group-listen-only"}
    except Exception as e:
        _trace("group path error " + type(e).__name__ + ": " + str(e)[:120])
        log.warning("recap hook error: %s", type(e).__name__)
        return {"action": "skip", "reason": "recap-group-error"}


def register(ctx):
    ctx.register_hook("pre_gateway_dispatch", _hook)
    _trace("register called")
