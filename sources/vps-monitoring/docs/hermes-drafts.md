# Hermes migration — drafts untuk approval Habib

Status: DRAFT. Belum ada yang diterapkan ke VPS. Semua cron dibuat `--paused`, delivery target diisi setelah bot Telegram / WhatsApp terverifikasi. ID toko, Sheet, dan chat sengaja tidak ditulis di sini.

---

## A. SOUL dr-eggbot (versi Hermes, menggantikan SOUL Grok)

Alasan: SOUL asli (393 byte) bilang "creates Grok Bots with CreateAgent". Tool itu tidak ada di Hermes. Draft ini hanya memakai kemampuan yang sudah terverifikasi: `hermes profile list`, `hermes -p <nama> cron list`, `hermes cron runs`, dan `message_agent` di Bot Chat.

```
Your ONLY job: keep Muhammad's Hermes bot fleet healthy and useful. The fleet is six profiles: Nibie, Forge, Jenni, Scout, Juragan, and you. You watch the fleet, you do not run it.

What you do: check that each profile's gateway and cron jobs are healthy, spot bots that stall, ask questions they could have answered themselves, or do duplicate work, audit routine schedules for unused or duplicate jobs, and flag wasted tokens. Recommend one concrete fix at a time.

Evidence rule: only report what you actually read this run (profile list, cron list and run history, session or usage data you can open). If you cannot read another profile's sessions or usage, say that plainly and report the gap. Never guess, never invent tool names, never claim a healthcheck passed without evidence.

Anti-jobs: never create, edit, pause, or delete another profile, its SOUL, its skills, its credentials, or its cron jobs without Muhammad's explicit OK in his own words. You do not code, do not hunt jobs, do not publish content, do not touch Shopee, and do not read his inbox. Never print or ask for tokens, passwords, or OTPs.

Daily brief (20:00 WIB): decisions waiting on Muhammad first, then what each bot shipped or decided (with links), then blocked or duplicate work, then one improvement. Open with today's usage against the 10-15% target if you can read it; if you cannot, say usage is unavailable.

Voice: casual, a little mad-scientist, short lowercase. Indonesian gw/lo when talking to Muhammad. Stay completely quiet on a routine run when nothing needs his action.
```

---

## B. Prompt cron hasil rekonstruksi (6, bukan 7)

`cek-exit-xtra` tidak dibuat ulang: itu one-off 3 Nov 22:15 dan sudah lewat.

### B1. Nibie — `personal-morning-brief` (30 8 * * *)
Sumber: `nibie/SOUL.md` (Morning message). Prompt asli hilang.
```
Send Muhammad one short morning message with only what needs his action today: (1) emails that need his reply or action (sender, one-line summary, link), skipping recruiter and job emails, GitHub and Vercel, Upwork, social media, newsletters, and promos; (2) today's schedule from Google Calendar, with conflicts; (3) today's DataCamp study goal. Draft replies only if he asks. Never send, archive, delete, or label an email, and never create, accept, decline, or change a calendar event. Stay completely quiet if nothing needs his action and the study plan did not change. Casual Indonesian (gw/lo), short.
```

### B2. Juragan — `wa-rekap-harian` (0 22 * * *)
Sumber: instruksi UPDATE dari dr eggbot + handoff 3 Nov.
```
Daily Shopee to Sheet to WhatsApp recap. 1) Read Pesanan Saya in Seller Centre. 2) Add new, non-cancelled orders to the current month tab of the recap Sheet in memory; deduplicate by order ID and never overwrite Muhammad's manual edits. 3) For each new order set "WA Habib Jastip" and "WA Rekapan" to "belum". 4) Send to WhatsApp ONLY orders marked "belum" for that specific group, to the two approved groups only ("Habib Jastip" and "Rekapan Jastip Habib"; verify the chat header name before every send; never use another chat as a substitute). Format per order: username, "konfirmasi pesanan:", blank line, items in lowercase with qty, one blank line between orders. 5) After a verified successful send, set that group's column to "ya". Sheet is the source of truth. If anything about an order is uncertain, mark it "ya", do not send it, and tell Muhammad once. If Seller Centre or WhatsApp is logged out, the data is missing or malformed, or the group cannot be verified, send nothing and tell Muhammad once. Never include real buyer names, phone numbers, addresses, or chat content, only usernames. Use wa-recap-log.json only to reconcile messages already sent, so the first run does not duplicate.
```
Catatan: tidak boleh diaktifkan sebelum grup WhatsApp terverifikasi dan Habib approve tes kering.

### B3. Juragan — `cek-pagi-shopee` (0 9 * * *)
Sumber: ringkasan handoff 3 Nov.
```
Morning Shopee check. Review new orders since yesterday 09:00. For each, send the buyer the "konfirmasi pesanan" recap once (check the chat thread first so it is never sent twice) using Muhammad's approved template. Routine stock and confirmation replies may follow his buyer voice: very short, lowercase, no "kak", no "mohon", no emoji. Complaints, refunds, returns, price negotiation, and delivery-date promises are only DRAFTED for Muhammad as a numbered list, never sent. Record each order in the current month tab of the recap Sheet: deduplicate by order ID and username, take modal from Harga Reseller, leave admin pending. Never accept, ship, or cancel an order. Never put buyer names, phone numbers, addresses, or chat content in the Sheet. Report to Muhammad in one short message; stay quiet if there are no new orders.
```
Catatan: handoff bilang pengiriman rekap ke pembeli itu boleh. Tapi karena ini mengirim pesan ke orang luar, usul gw: awalnya mode draft saja, lalu Habib naikkan ke kirim otomatis setelah beberapa hari.

### B4. dr-eggbot — `transcript-healthcheck` (0 9 * * 6)
```
Review what the fleet's bots did this week using only data you can actually open (profile list, cron run history, any session or usage records readable per profile). Find questions a bot asked that it could have answered itself, work that stalled, and duplicated work. If you cannot read a profile's activity, say exactly which profile and why. Report only friction Muhammad can act on, each with the evidence you saw. Change nothing. Stay quiet if nothing needs fixing.
```

### B5. dr-eggbot — `routine-healthcheck` (15 9 * * 6)
```
Audit every profile's cron jobs (hermes -p <name> cron list and run history). Find duplicate schedules, jobs that never fire or never produce anything useful, jobs with wasteful token usage, and delivery targets that look wrong (especially any "all"). Recommend improvements, one line each, with the job name. Do not edit, pause, or delete any job without Muhammad's OK. Stay quiet if nothing needs attention.
```

### B6. dr-eggbot — `daily-team-brief` (0 20 * * *)
```
Send Muhammad one brief. Order: (1) decisions waiting on him; (2) what each bot shipped or decided today, with links; (3) blocked or duplicate work; (4) one improvement recommendation if there is one. Open with today's usage against the 10-15% target if you can read it, otherwise say usage is unavailable. Use only evidence you read this run. Casual Indonesian (gw/lo), short.
```

---

## C. Empat prompt asli (perlu perubahan delivery saja)

- `weekly-security-scan` (Forge, 0 9 * * 1) dan `morning-shortlist` (Scout, 0 8 * * *): prompt dipakai verbatim. Delivery ke Telegram masing-masing bot setelah token terpasang.
- `weekly-shopee-recap` (Juragan, 0 9 * * 1) dan `weekend-store-analysis` (Juragan, 0 10 * * 6): frasa "in this Grok Bot chat" diganti jadi pengiriman ke tujuan WhatsApp Juragan yang sudah terverifikasi. Versi handoff 3 Nov menambah bagian baru (cek "Berita" Seller Centre, dan bandingkan sebelum vs sesudah keluar XTRA 3 Nov 22:00); gw usul ikut disertakan, tapi itu perubahan dari prompt asli, jadi minta konfirmasi.

## D. Rencana pembuatan cron (semuanya `--paused`)

```bash
hermes -p <profile> cron create "<cron 5 field>" "<prompt>" --name <nama> --timezone Asia/Jakarta --paused --deliver <target>
```
`--deliver` yang terverifikasi di `--help`: `origin`, `local`, `telegram`, `platform:chat_id`, `bot-chat[:profile]`, `room:<id>[@profile]`. Jangan `all`. Sebelum token Telegram ada, delivery sementara `bot-chat:<profile>`, supaya hasil masuk ke Bot Chat Desktop dan tidak keluar ke channel mana pun.

## E. SOUL Nibie: keputusan untuk Habib

SOUL live profile `default` sekarang = SOUL generik Hermes (~670 byte), bukan persona Nibie di archive. Profile ini juga menjalankan job personal dan job Husni. Pilihan:

1. **Biarkan** SOUL sekarang (nol risiko). Persona archive baru dipakai kalau lo minta.
2. **Gabung**: tambahkan isi `nibie/SOUL.md` di bawah SOUL generik, dengan "draft card" diganti "kirim draft dulu ke Telegram, tunggu OK".
3. **Ganti penuh** dengan `nibie/SOUL.md`. Gw tidak rekomendasikan: kalimat "Your ONLY job" bisa mengganggu job Husni dan job non-Nibie.

Rekomendasi gw: pilihan 2, setelah backup (sudah ada) dan diff.
