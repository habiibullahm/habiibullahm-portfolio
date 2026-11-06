"""Pure logic for the Juragan recap ingest: parse a pasted recap, plan Sheet rows. Stdlib only."""
import hashlib
import re
from datetime import datetime, timedelta, timezone

MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
WIB = timezone(timedelta(hours=7))

_HDR = re.compile(
    r"^[ \t]*(?P<user>[A-Za-z0-9_.]{2,40})[ \t]*(?:\r?\n[ \t]*)?konfirmasi pesanan[ \t]*:?[ \t]*$",
    re.I | re.M,
)
_QTY_TAIL = re.compile(r"\s*(?:x|×)\s*\d+\s*$", re.I)


def month_tab(now=None):
    now = now or datetime.now(WIB)
    return f"{MONTHS[now.month - 1]} {now.year}"


def clean_item(line):
    return re.sub(r"^[\s\-•*·]+", "", line).strip()


def norm(text):
    t = _QTY_TAIL.sub("", str(text).lower())
    return re.sub(r"\s+", " ", t).strip(" .,;:")


def parse_recap(text):
    """[{user, items}] from a pasted recap; [] when the text is not a recap."""
    text = text or ""
    matches = list(_HDR.finditer(text))
    orders = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        items = [clean_item(ln) for ln in text[m.end():end].splitlines()]
        items = [it for it in items if it]
        if items:
            orders.append({"user": m.group("user"), "items": items})
    return orders


def signature(user, items):
    key = user.lower() + "|" + "|".join(sorted(norm(i) for i in items))
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _pad(r):
    return (list(r) + [""] * 17)[:17]


_FOOTER = re.compile(r"^\s*total\b", re.I)


def analyze(rows):
    """rows start at sheet row 4 (header). Returns blocks, next_no, last_content_row, footer_row.

    The ledger ends with a footer ("TOTAL READY" in C, "Total Pesanan" in A). Its A cell can hold a number,
    so it must never be read as an order block, and nothing may be written at or below it."""
    blocks, cur, last_no, last_row, footer = [], None, 0, 5, None
    for i, raw in enumerate(rows):
        row = 4 + i
        if i < 2:
            continue
        r = _pad(raw)
        a, b, c = str(r[0]).strip(), str(r[1]).strip(), str(r[2]).strip()
        if _FOOTER.match(c) or _FOOTER.match(a):
            footer = row
            break
        if re.fullmatch(r"\d+", a):
            cur = {"user": b, "items": [c] if c else [], "row": row, "no": a, "q": str(r[16]).strip().lower()}
            blocks.append(cur)
            last_no = max(last_no, int(a))
            last_row = row
        elif cur is not None and not b and c:
            cur["items"].append(c)
            last_row = row
        else:
            cur = None
    return blocks, last_no + 1, last_row, footer


def _free_start(rows, after_row, need, footer=None):
    """First row with `need` consecutive empty B/C cells; None when it would reach the footer."""
    row = after_row + 1
    while True:
        if footer is not None and row + need - 1 >= footer:
            return None
        ok = True
        for k in range(need):
            idx = row + k - 4
            r = _pad(rows[idx]) if 0 <= idx < len(rows) else [""] * 17
            if str(r[1]).strip() or str(r[2]).strip():
                ok = False
                row = row + k + 1
                break
        if ok:
            return row


def plan(rows, orders, seen=()):
    """Decide what to do for each pasted order. Returns (writes, marks, skipped).

    - username not in the sheet this month: write a new block (NO, username, one item per row), Q='ya'
    - username exists and the pasted items are all already in one of its blocks: exact duplicate (skipped)
    - username exists, items differ: the paste is the recap of the order already logged (the ledger may hold a
      package label while the recap lists components), so only mark Q='ya' on the latest block whose Q is not
      'ya'; no new rows. If every block is already 'ya', nothing to do (skipped, reported)."""
    blocks, next_no, last_row, footer = analyze(rows)
    seen = set(seen)
    writes, marks, skipped = [], [], []
    cursor = last_row
    for o in orders:
        sig = signature(o["user"], o["items"])
        if sig in seen:
            skipped.append({"user": o["user"], "reason": "already ingested"})
            continue
        same = [b for b in blocks if b["user"].lower() == o["user"].lower()]
        if same:
            mine = {norm(i) for i in o["items"]}
            if any(mine <= {norm(i) for i in b["items"]} for b in same):
                skipped.append({"user": o["user"], "reason": "exact duplicate"})
                continue
            pending = [b for b in same if b["q"] != "ya"]
            if pending:
                b = pending[-1]
                marks.append({"user": o["user"], "row": b["row"], "no": b["no"]})
                b["q"] = "ya"
            else:
                skipped.append({"user": o["user"], "reason": "already posted"})
            continue
        start = _free_start(rows, cursor, len(o["items"]), footer)
        if start is None:
            skipped.append({"user": o["user"], "reason": "no free rows before footer"})
            continue
        values = [[next_no, o["user"], o["items"][0]]] + [["", "", it] for it in o["items"][1:]]
        writes.append({"user": o["user"], "sig": sig, "start": start, "no": next_no, "values": values})
        cursor = start + len(o["items"]) - 1
        next_no += 1
    return writes, marks, skipped
