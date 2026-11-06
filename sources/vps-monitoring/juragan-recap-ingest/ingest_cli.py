"""Run by the plugin through uv (needs google-api-python-client). Reads {"orders": [...]} on stdin,
reads the month tab, plans, writes (unless dry_run), verifies, prints a JSON summary. No LLM."""
import fcntl
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from core import month_tab, plan  # noqa: E402

cfg = json.loads((HERE / "config.json").read_text())
os.environ["HERMES_HOME"] = cfg["profile_dir"]
sys.path.insert(0, cfg["google_scripts"])
import google_api  # noqa: E402

SEEN = HERE / "ingested.json"


def load_seen():
    try:
        return set(json.loads(SEEN.read_text()))
    except Exception:
        return set()


def main():
    orders = json.load(sys.stdin)["orders"]
    # Test hooks: INGEST_SHEET_ID points at a COPY of the sheet, INGEST_FORCE_LIVE writes even when config says dry_run.
    dry = (bool(cfg.get("dry_run")) and not os.environ.get("INGEST_FORCE_LIVE")) or bool(os.environ.get("INGEST_FORCE_DRY"))
    out = {"dry_run": dry, "written": [], "marked": [], "skipped": [], "error": None}
    lock = open(HERE / "ingest.lock", "w")
    fcntl.flock(lock, fcntl.LOCK_EX)
    try:
        ssvc = google_api.build_service("sheets", "v4")
        svc = ssvc.spreadsheets().values()
        sid, tab = os.environ.get("INGEST_SHEET_ID") or cfg["sheet_id"], month_tab()
        rows = svc.get(spreadsheetId=sid, range=f"{tab}!A4:Q600").execute().get("values", [])
        seen = load_seen()
        writes, marks, skipped = plan(rows, orders, seen)
        out["skipped"] = skipped
        out["tab"] = tab
        if (writes or marks) and not dry:
            targets = [w["start"] for w in writes] + [m["row"] for m in marks]
            props = ssvc.spreadsheets().get(spreadsheetId=sid, fields="sheets.properties").execute()["sheets"]
            sheet_id = next(s["properties"]["sheetId"] for s in props if s["properties"]["title"] == tab)
            cell = lambda r0, r1, c0, c1: {"sheetId": sheet_id, "startRowIndex": r0, "endRowIndex": r1,
                                           "startColumnIndex": c0, "endColumnIndex": c1}
            # Rekap checkbox column (N): copy look and checkbox validation from the "Bayar" cell F6, then tick it.
            reqs = [{"copyPaste": {"source": cell(5, 6, 5, 6), "destination": cell(r - 1, r, 13, 14), "pasteType": pt}}
                    for r in targets for pt in ("PASTE_FORMAT", "PASTE_DATA_VALIDATION")]
            ssvc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": reqs}).execute()
            data = []
            for w in writes:
                end = w["start"] + len(w["values"]) - 1
                data.append({"range": f"{tab}!A{w['start']}:C{end}", "values": w["values"]})
                data.append({"range": f"{tab}!Q{w['start']}", "values": [["ya"]]})
            for m in marks:
                data.append({"range": f"{tab}!Q{m['row']}", "values": [["ya"]]})
            data += [{"range": f"{tab}!N{r}", "values": [[True]]} for r in targets]
            svc.batchUpdate(spreadsheetId=sid, body={"valueInputOption": "RAW", "data": data}).execute()
            for r in targets:
                got = svc.get(spreadsheetId=sid, range=f"{tab}!N{r}", valueRenderOption="UNFORMATTED_VALUE").execute().get("values", [[None]])[0][0]
                if got is not True:
                    out["error"] = f"checkbox mismatch at row {r}"
                    break
            for w in writes:  # read back every block before claiming success
                end = w["start"] + len(w["values"]) - 1
                got = svc.get(spreadsheetId=sid, range=f"{tab}!A{w['start']}:C{end}").execute().get("values", [])
                ok = [str(r[2]) if len(r) > 2 else "" for r in got] == [v[2] for v in w["values"]]
                q = svc.get(spreadsheetId=sid, range=f"{tab}!Q{w['start']}").execute().get("values", [[""]])[0][0]
                if not ok or q != "ya":
                    out["error"] = f"read-back mismatch at row {w['start']}"
                    break
            for m in marks:
                q = svc.get(spreadsheetId=sid, range=f"{tab}!Q{m['row']}").execute().get("values", [[""]])[0][0]
                if q != "ya":
                    out["error"] = f"read-back mismatch at row {m['row']}"
                    break
            if not out["error"]:
                seen.update(w["sig"] for w in writes)
                SEEN.write_text(json.dumps(sorted(seen)))
        out["written"] = [{"user": w["user"], "row": w["start"], "no": w["no"], "items": len(w["values"])} for w in writes]
        out["marked"] = [{"user": m["user"], "row": m["row"], "no": m["no"]} for m in marks]
    except Exception as e:  # report type only, never tokens
        out["error"] = type(e).__name__ + ": " + str(e)[:160]
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
