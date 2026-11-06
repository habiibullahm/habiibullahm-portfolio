# Hermes: dokumentasi pembelajaran (migrasi 6 agent Grok ke Hermes)

Ditulis 4 Nov 2026 dari sesi kerja nyata. Tidak berisi rahasia, ID, nomor, atau nama grup.
Tanda: **[teruji]** = dicek langsung. **[docs]** = dari dokumentasi resmi. **[belum teruji]** = dugaan.

---

## 1. Arsitektur akhir

```
Laptop Windows                              VPS (bot-vps, Ubuntu)
├─ Hermes Desktop (UI)                      ├─ 1 instalasi Hermes (~/.hermes)
│  ├─ backend lokal "This device" (C:\hh)   │  ├─ 6 profile: default=Nibie, forge, jenni,
│  └─ gateway SSH ke VPS ───────────────────┤  │   scout, juragan, dr-eggbot
├─ ssh -N -L 20128 ─────────────────────────┤  ├─ 1 gateway systemd (multiplex, semua profile)
└─ Chrome asli (tidak disentuh Hermes)      │  ├─ Telegram: 5 bot, WhatsApp: Juragan saja
                                            │  └─ 9router (127.0.0.1:20128), model free-tier
```
- **Desktop hanya UI.** Ada dua backend terpisah: lokal (`C:\hh`) dan VPS. Config, memori, sesi, tool, dan browser mereka tidak dibagi. **[teruji]**
- Enam agent berjalan di VPS. Browser mereka milik VPS, bukan Chrome laptop. **[docs]**

## 2. Pelajaran teknis, per area

### 2.1 Mengoperasikan VPS dari laptop
- `ssh bot-vps "hermes ..."` gagal (`hermes: command not found`): shell non-interaktif tidak memuat `~/.local/bin`. Pakai `bash -lc '...'` atau path penuh. **[teruji]**
- Quoting PowerShell ke SSH ke bash rawan rusak. Cara yang stabil: kirim skrip lewat base64 (`echo B64 | base64 -d | bash -l`). Menyalurkan teks lewat pipa membawa BOM dan CRLF yang merusak baris pertama dan terakhir. **[teruji]**
- Tool Terminal panel menolak pipa, `$var`, dan variabel di dalam `cmd rmdir`. Tulis path eksplisit atau pakai file skrip.

### 2.2 Profile dan Bot Mode
- Profile baru: `hermes profile create <nama> --description "..."`. Data di `~/.hermes/profiles/<nama>/`, tiap profile punya `.env`, config, SOUL, memori, sesi, dan cron sendiri. **[teruji]**
- **Kunci API provider (mis. custom / 9router) per profile:** variabel seperti `HERMES_CUSTOM_127_0_0_1_20128_API_KEY` harus ada di **`~/.hermes/profiles/<nama>/.env`**. Nilai yang sama hanya di environment shell global **tidak dipakai** untuk request agent profile itu; gateway melaporkan error jelas jika hanya global yang ter-set. **[teruji]** Lihat juga §11 di `hermes-learnings-lanjutan-2026-11-05.md`.
- `default` tidak bisa diganti nama. `hermes profile rename default Nibie` hanya mengatur *display name*. Desktop tetap menampilkannya dengan nama host ("bot-vps"). **[teruji]**
- Profile **bukan sandbox**: di backend `local`, agent punya akses file yang sama dengan akun `ubuntu`. **[docs]**
- Satu gateway melayani semua profile (multiplex). Profile baru ikut dilayani tanpa restart. **[teruji]**
- Folder profile bisa tersisa kosong setelah `profile delete` (mis. `runtime/`); abaikan, bukan profile.

### 2.3 Telegram
- Setup per profile: `<nama> gateway setup`, pilih Telegram, tempel token BotFather di prompt (bukan di chat). Bot tersambung otomatis dalam sekitar satu menit, tanpa restart. **[teruji]**
- Token ganda ditolak (token lock). Allowlist = satu ID pemilik.
- **`/start` sengaja diabaikan** Hermes (log: `Ignoring /start platform ping`), jadi bot terlihat mati. Kirim teks biasa. **[teruji]**

### 2.4 WhatsApp (jalur paling banyak jebakan)
- Hermes memakai bridge **Baileys** (tidak resmi, ada risiko ban). Mode `bot` = nomor terpisah. **[docs]**
- **Memindahkan nomor antar profile:** matikan di profile lama, restart gateway (mematikan flag `.env` tidak melepas adapter yang sedang terhubung), salin folder sesi *setelah* bridge lama mati, lalu nyalakan di profile baru dengan port bridge berbeda (3001). Jangan pernah dua bridge memegang nomor yang sama. **[teruji]**
- Restart bridge saja: kirim `SIGTERM` ke prosesnya; adapter menjalankannya lagi dalam beberapa detik. Tanpa restart gateway. **[teruji]**
- `WHATSAPP_REQUIRE_MENTION` berlaku **tanpa restart** (dibaca ulang saat profile di-scan). **[teruji]**
- Bridge hanya meneruskan pesan dari pengirim di `WHATSAPP_ALLOWED_USERS`. Pesan peserta lain di grup **tidak pernah sampai**. **[teruji]**
- **Tidak ada mode "baca saja"** untuk WhatsApp (hanya Telegram punya `observe_unmentioned_group_messages`). Token diam `[SILENT]` tidak berlaku di WhatsApp: setiap pesan yang diproses menghasilkan balasan. Riwayat grup tidak bisa ditarik. **[docs]**
- Nama yang tampil di WhatsApp berasal dari **profil WhatsApp nomor itu** (`me.name` di sesi), bukan dari Hermes. Ganti dari HP. **[teruji]**
- Log gateway menyimpan **pratinjau isi pesan**. Anggap log sebagai data sensitif.

### 2.5 Sesi, memori, SOUL
- Percakapan dipisah **per chat**: DM, grup, dan Desktop adalah sesi berbeda. Yang dibagi antar sesi hanya SOUL, memori (`MEMORY.md`, `USER.md`), dan skill. **[teruji]**
- SOUL dibaca saat sesi mulai. Ubah SOUL, lalu kirim `/new` agar berlaku. `/new` dikenali, bahkan di grup. **[teruji]**
- **SOUL dari archive Grok membawa kebiasaan Grok** yang harus disesuaikan: WhatsApp Web lewat browser dan QR, kartu persetujuan, `CreateAgent`, path `/workspace/...`. Menyalin verbatim tanpa meninjau menyebabkan Juragan mencoba login WhatsApp Web dan mengirim QR. **Pelajaran: baca dan sesuaikan tiap SOUL sebelum dipasang.** **[teruji]**
- Aturan yang sama bisa tertulis di beberapa tempat (SOUL baris yang berbeda dan memori). Perubahan harus mencakup semuanya.
- `hermes logs` (per profile dengan `-p`) menampilkan agent, errors, dan gateway log. Pesan masuk dan balasan tercatat sebagai metadata plus pratinjau.

### 2.6 Skill
- Empat skill Jenni dari archive hanya "pembungkus" yang menunjuk file di box Grok (`/workspace/content/skills/...`) yang tidak ada. Dipasang dari sumber aslinya: `hermes skills inspect` lalu `skills install`. Pemindai bawaan menandai `sudo_usage` dan `unpinned_npm_install` di skill hyperframes (peringatan, bukan blokir). **[teruji]**
- Pagar dari pembungkus (mis. "jangan keluarkan uang untuk tool berbayar") hilang saat memakai versi asli: pindahkan ke SOUL.

### 2.7 Google OAuth (Sheets Juragan)
- Skill `google-workspace` meminta **semua scope** (Gmail kirim dan ubah, Drive, Calendar, Sheets, dan lainnya) dan tidak punya opsi mempersempit. Dipersempit lewat wrapper yang mengganti `SCOPES` jadi `spreadsheets` saja, tanpa mengubah file skill. Token diterima skill. **[teruji]**
- Kode persetujuan Google dianggap kredensial: ditempel di prompt terminal (input tersembunyi), tidak lewat chat.
- Aplikasi OAuth berstatus **Testing**: akun harus ditambahkan sebagai *Test user* (jika tidak: "Access blocked"), dan refresh token kemungkinan kedaluwarsa sekitar 7 hari. **[docs/Google]**
- Scope `spreadsheets` mencakup semua Sheet akun, bukan satu file. Pembatas satu Sheet hanya SOUL. Alternatif lebih sempit: service account, dengan Sheet dibagikan ke emailnya. **[belum teruji]**
- File token dibuat dengan izin `664`: **selalu `chmod 600`** setelahnya. **[teruji]**

### 2.8 9router dan model
- `/v1/models` terbuka tanpa key, tapi `/v1/chat/completions` butuh key asli (401 dengan key palsu). HTTP 200 di daftar model bukan bukti key benar. **[teruji]**
- Balasan completion berformat stream (`...}data: [DONE]`): parser JSON biasa gagal. Potong penutupnya.
- Model reasoning (mis. `glm-5.3-flash`) menghabiskan token untuk "berpikir": batas token kecil menghasilkan jawaban kosong. **[teruji]**
- Prompt dasar sekitar 800 token tiap panggilan, bahkan untuk pesan satu kalimat. **[teruji]**
- Profile baru mewarisi `model` dan blok `providers` dari default, tapi `.env`-nya kosong: tambahkan variabel key 9router. Jangan salin key fallback berbayar.

### 2.9 Tunnel
- Selalu pakai `-N`. Tanpa itu `ssh` membuka shell di VPS. `ExitOnForwardFailure=yes` membuat gagal cepat kalau port terpakai.
- `Connection refused` pada `-L` artinya **tidak ada layanan di port VPS itu** (port 9119 tidak berjalan). `Permission denied` saat bind artinya port laptop sudah terpakai tunnel lain.
- Desktop membuat tunnel dan backend sendiri di port acak lewat gateway SSH. Jangan di-tunnel manual.
- Detail dan tabel port: `hermes-tunneling.md`.

### 2.10 Hermes lokal dan browser (insiden terbesar)
- Hermes lokal butuh login model sendiri. Dihubungkan ke 9router lewat tunnel. Provider kustom tidak muncul di Settings, Providers (pool kredensial berbeda dengan blok `providers:`).
- **Cookie Chrome modern (`v20`, enkripsi terikat aplikasi) tidak ikut saat profil disalin** ke folder lain: login Google hilang. `use_real_profile` (mode salin) karenanya tidak membawa login di Chrome 157. **[teruji]**
- **Insiden:** dengan `free-tier`, agent lokal berimprovisasi saat satu jalur gagal: `taskkill /F` pada semua Chrome, menyalin profil asli (±3,3 GB), menjalankan Chrome dengan port debugging pada profil asli, dan `grep -r` ke seluruh drive. Persetujuan `smart` mengizinkannya. **[teruji]**
- Pagar yang dipasang: `approvals.deny` (mis. `taskkill*`, `*remote-debugging-port*`, `grep -r* /c*`). Mode `-z` menolak perintah yang butuh persetujuan. Setelah itu agent berhenti dan melapor sesuai instruksi. **[teruji]**
- Prompt untuk agent yang menyentuh browser: batasi tegas ("hanya tool browser, jangan menjalankan atau menghentikan chrome.exe, jangan membuka port debugging, berhenti dan lapor jika gagal").
- Mematikan Chrome paksa memunculkan prompt **Restore**. Tutup normal. Sisa proses Chrome tanpa window bisa tetap mengunci profil.

## 3. Keamanan: temuan dan perbaikan

| Temuan | Perbaikan | Status |
|---|---|---|
| SSH: password dan login root aktif, tanpa firewall | Drop-in sshd; **file harus dibaca lebih dulu (`00-`)**, karena nilai pertama menang dan `50-cloud-init.conf` membaca duluan. Root sudah ditolak. Password **belum** ditutup | **terbuka** |
| Token Google dan sesi WhatsApp lama terbaca user lain (664, 775) | `chmod 600` dan `go-rwx` | selesai |
| `C:\hh` terbaca `Users` dan `Authenticated Users` (warisan `C:\`) | `icacls`: hanya pemilik, SYSTEM, Administrators | selesai |
| Agent punya terminal, computer_use, cronjob, code_execution | `hermes tools disable --platform <p> ...` per agent | selesai |
| Sheet rekap terbuka untuk siapa pun dengan link | Diubah ke Dibatasi (diverifikasi 401 tanpa login) | selesai |
| Log memuat pratinjau pesan | Batasi akses VPS (SSH) | terbuka lewat SSH |

Prinsip: **agent yang menerima pesan dari luar (grup) tidak boleh punya hak lebih dari yang perlu.**

## 4. Cron
- Dibuat dengan `--paused --catch-up off --deliver <target> --timezone Asia/Jakarta`. Target yang valid: `telegram`, `whatsapp`, `bot-chat:<profile>`, `platform:chat_id`. Jangan `all`. **[teruji]**
- Sepuluh job dibuat dan semuanya paused. Job pribadi lama di profile default tidak disentuh.
- Prompt hasil rekonstruksi ada di `hermes-drafts.md`.

## 5. Pemantauan
- `~/hermes-migration-backups/tools/status.sh`: papan status (gateway, platform, bridge, cron, error, resource), hanya baca, tanpa isi pesan.
- `~/hermes-migration-backups/tools/work.sh`: aktivitas kerja agent (giliran terakhir, tool, durasi), metadata saja.
- Dijalankan dengan `watch -n 15` di tab Terminal panel.

## 6. Prinsip kerja yang terbukti
1. **Baca dan verifikasi dulu**, jangan mengklaim dari ingatan. Banyak asumsi awal salah (mis. "9router tidak butuh key").
2. **Backup sebelum mengubah**, dan sebut nama backupnya.
3. Tes dengan **hitungan atau metadata**, bukan isi (jumlah baris, kode HTTP, nama cookie).
4. **Urutan untuk sumber daya tunggal** (satu bridge per nomor): matikan lama, lalu nyalakan baru.
5. Tindakan yang terlihat orang lain (kirim ke grup) atau mengubah akun: minta persetujuan eksplisit.
6. Kredensial: pengguna yang mengetik dan menempel, bukan lewat chat.
7. Agent berotak kecil berimprovisasi saat gagal: beri batas tegas dan pagar `deny`.

## 7. Runbook singkat jika mengulang dari nol
1. Backup config, `.env`, DB, dan folder penting ke folder `700`.
2. Pasang Hermes, perbarui, dan **tunggu** update selesai sebelum mengubah apa pun.
3. Buat profile fresh, salin SOUL **setelah ditinjau dan disesuaikan** dari Grok.
4. Provider model: pastikan `.env` tiap profile punya key.
5. Telegram per profile, lalu verifikasi `connected` di status.
6. WhatsApp: pindah dengan urutan di 2.4.
7. Konektor satu per satu dengan scope minimal.
8. Cron dibuat paused, dites kering, lalu diaktifkan satu per satu.
9. Kunci SSH, izin file, dan toolset sebelum membuka agent ke grup.

## 8. Yang masih terbuka
- Tutup login password SSH (ganti nama drop-in jadi `00-`).
- Hapus `C:\hermes` lama (3,1 GB) dan salah satu proses `ssh` kembar untuk 20128.
- Tes tulis Sheets (tab khusus tes) dan tes kirim ke grup; perbarui prompt `wa-rekap-harian`.
- Ganti nama profil WhatsApp nomor bot.
- Keputusan `use_real_profile` di laptop (disarankan mati kalau tidak dipakai).
- Persetujuan ulang token Sheets sekitar tiap 7 hari.
- Konektor lain (GitHub, Notion, Upwork, Tebar) belum disambung.

## 9. Lokasi (tanpa rahasia)
- VPS: backup pra-migrasi `~/hermes-migration-backups/<timestamp>-pre-profiles`, skrip `~/hermes-migration-backups/tools/`.
- Backup per perubahan: file `*.bak-before-*` di samping file aslinya (config, `.env`, SOUL, memori).
- Laptop: Hermes `C:\hh` (config, `.env`, cache). Dokumen: `hermes-drafts.md`, `hermes-tunneling.md`, dan file ini.
