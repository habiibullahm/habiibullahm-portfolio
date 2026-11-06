import unittest
from core import parse_recap, plan, analyze, month_tab, norm
from datetime import datetime, timezone, timedelta


def sheet(*blocks):
    """Build rows from row 4: header, subheader, then blocks of (no,user,[items])."""
    rows = [["NO", "Nama", "Pesanan"], ["", "", ""]]
    for no, user, items in blocks:
        rows.append([str(no), user, items[0]])
        for it in items[1:]:
            rows.append(["", "", it])
    return rows


class T(unittest.TestCase):
    def test_parse_multiline(self):
        t = "userone\nkonfirmasi pesanan:\n\npin a\npin b x2\n\nusertwo\nkonfirmasi pesanan:\n\nkemeja c, L"
        o = parse_recap(t)
        self.assertEqual([x["user"] for x in o], ["userone", "usertwo"])
        self.assertEqual(o[0]["items"], ["pin a", "pin b x2"])
        self.assertEqual(o[1]["items"], ["kemeja c, L"])

    def test_parse_same_line_header(self):
        o = parse_recap("userone konfirmasi pesanan:\n\npin a")
        self.assertEqual(o, [{"user": "userone", "items": ["pin a"]}])

    def test_not_a_recap(self):
        self.assertEqual(parse_recap("halo juragan tolong cek"), [])
        self.assertEqual(parse_recap("userone konfirmasi pesanan:"), [])

    def test_bullets_stripped(self):
        o = parse_recap("userone\nkonfirmasi pesanan:\n- pin a\n• pin b")
        self.assertEqual(o[0]["items"], ["pin a", "pin b"])

    def test_plan_appends_after_last_block(self):
        rows = sheet((1, "old", ["x", "y"]), (2, "old2", ["z"]))
        w, m, s = plan(rows, parse_recap("newuser\nkonfirmasi pesanan:\n\npin a\npin b"))
        self.assertEqual((m, s), ([], []))
        self.assertEqual(w[0]["no"], 3)
        self.assertEqual(w[0]["start"], 6 + 3)  # rows 6,7 / 8 used, so 9
        self.assertEqual(w[0]["values"], [[3, "newuser", "pin a"], ["", "", "pin b"]])

    def test_exact_duplicate_is_skipped(self):
        rows = sheet((1, "olduser", ["pin a"]))
        w, m, s = plan(rows, parse_recap("OldUser\nkonfirmasi pesanan:\n\npin a"))
        self.assertEqual((w, m), ([], []))
        self.assertEqual(s[0]["reason"], "exact duplicate")

    def test_different_items_mark_q_on_existing_block(self):
        rows = sheet((1, "olduser", ["Paket X + Box"]))
        w, m, s = plan(rows, parse_recap("olduser\nkonfirmasi pesanan:\n\npin a\npin b"))
        self.assertEqual((w, s), ([], []))
        self.assertEqual(m, [{"user": "olduser", "row": 6, "no": "1"}])

    def test_marks_latest_block_without_ya(self):
        rows = sheet((1, "uu", ["a"]), (2, "uu", ["b"]))
        rows[2] = (rows[2] + [""] * 17)[:17]
        rows[2][16] = "ya"  # first block (row 6) already posted
        w, m, s = plan(rows, parse_recap("uu\nkonfirmasi pesanan:\n\nzzz"))
        self.assertEqual(m, [{"user": "uu", "row": 7, "no": "2"}])

    def test_all_blocks_posted_is_reported(self):
        rows = sheet((1, "uu", ["a"]))
        rows[2] = (rows[2] + [""] * 17)[:17]
        rows[2][16] = " Ya "
        w, m, s = plan(rows, parse_recap("uu\nkonfirmasi pesanan:\n\nzzz"))
        self.assertEqual((w, m), ([], []))
        self.assertEqual(s[0]["reason"], "already posted")

    def test_new_username_is_written(self):
        w, m, s = plan(sheet((1, "old", ["x"])), parse_recap("fresh\nkonfirmasi pesanan:\n\npin a"))
        self.assertEqual((m, s), ([], []))
        self.assertEqual(w[0]["values"], [[2, "fresh", "pin a"]])

    def test_plan_seen_signature(self):
        rows = sheet()
        o = parse_recap("u1\nkonfirmasi pesanan:\n\npin a")
        w, _, _ = plan(rows, o)
        w2, _, s2 = plan(rows, o, seen=[w[0]["sig"]])
        self.assertEqual(w2, [])
        self.assertEqual(s2[0]["reason"], "already ingested")

    def test_two_orders_in_one_message_stack(self):
        rows = sheet((1, "old", ["x"]))
        o = parse_recap("u1\nkonfirmasi pesanan:\n\na\nb\n\nu2\nkonfirmasi pesanan:\n\nc")
        w, m, s = plan(rows, o)
        self.assertEqual([(x["no"], x["start"]) for x in w], [(2, 7), (3, 9)])

    def test_template_rows_are_free(self):
        rows = sheet((1, "old", ["x"]))
        rows += [["", "", "", "FALSE", " Rp - "]] * 5  # template rows: only formulas in D..
        w, _, _ = plan(rows, parse_recap("u1\nkonfirmasi pesanan:\n\na"))
        self.assertEqual(w[0]["start"], 7)

    def test_blocks_stop_at_blank(self):
        rows = sheet((1, "old", ["x"]))
        rows += [["", "", ""], ["", "", "stray text"]]
        blocks, nxt, last, footer = analyze(rows)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["items"], ["x"])
        self.assertIsNone(footer)

    def _with_footer(self, free):
        rows = sheet((1, "old", ["x"]), (2, "old2", ["y"]))
        rows += [["", "", "", "FALSE", " Rp - "]] * free
        rows.append(["20", "", "TOTAL READY", "", " Rp 13,585"])  # footer row: A holds a number
        rows.append(["Total Pesanan", "", "", "", ""])
        return rows

    def test_footer_is_not_an_order_block(self):
        blocks, nxt, last, footer = analyze(self._with_footer(5))
        self.assertEqual(len(blocks), 2)
        self.assertEqual(nxt, 3)
        self.assertEqual(footer, 6 + 2 + 5)

    def test_writes_before_footer_not_below(self):
        rows = self._with_footer(5)  # free rows 8..12, footer at 13
        w, m, s = plan(rows, parse_recap("fresh\nkonfirmasi pesanan:\n\na\nb\nc"))
        self.assertEqual(w[0]["start"], 8)
        self.assertEqual(w[0]["no"], 3)

    def test_no_space_before_footer_is_reported(self):
        rows = self._with_footer(2)  # free rows 8..9, footer at 10
        w, m, s = plan(rows, parse_recap("fresh\nkonfirmasi pesanan:\n\na\nb\nc"))
        self.assertEqual(w, [])
        self.assertEqual(s[0]["reason"], "no free rows before footer")

    def test_exact_fit_before_footer(self):
        rows = self._with_footer(3)  # free 8..10, footer 11
        w, m, s = plan(rows, parse_recap("fresh\nkonfirmasi pesanan:\n\na\nb\nc"))
        self.assertEqual((w[0]["start"], s), (8, []))

    def test_month_tab(self):
        self.assertEqual(month_tab(datetime(2026, 11, 5, tzinfo=timezone(timedelta(hours=7)))), "Nov 2026")
        self.assertEqual(month_tab(datetime(2026, 5, 1, tzinfo=timezone(timedelta(hours=7)))), "Mei 2026")

    def test_norm_drops_qty(self):
        self.assertEqual(norm("Pin A  x1"), "pin a")


if __name__ == "__main__":
    unittest.main()
