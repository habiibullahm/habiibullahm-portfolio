# Hermes lanjutan (4-5 Nov 2026): dokumentasi pembelajaran

Lanjutan dari `hermes-learnings.md`. Isi: apa yang dibangun, apa yang salah, dan aturan yang terbukti.
Tanpa rahasia: ID toko, Sheet, grup, nomor telepon, token, dan username pembeli sengaja tidak ditulis.

## 1. Kondisi akhir sesi ini

| Area | Kondisi |
|---|---|
| Coolify | Dihapus (backup tersimpan). RAM available naik dari sekitar 1,4 ke 1,6 GB. |
| Dashboard monitor | Jalan di VPS sebagai service user `vps-monitor`, hanya listen di `127.0.0.1:19999`, dilihat lewat SSH tunnel. |
| Cron Nibie (default) | 11 job yang terkunci ke provider Qwen/Sumopod dipindah ke 9router (`free-tier`). |
| Juragan, Screen | Desktop Screen menyala, browser dikunci lokal (`browser.cloud_provider: local`), login Seller Centre dilakukan manual. |
| Juragan, rekap grup | Plugin listen-only `juragan-recap-ingest` aktif, mode tulis. Grup tidak dibalas, hanya emoji tanda. |
| Gmail Juragan | Sudah terotorisasi (token punya scope luas), terverifikasi baca label. |
| GitHub Forge | Token fine-grained baca saja di `.env` Forge, terverifikasi. |
| Cron Juragan (4 job) | Semua tetap paused (keputusan pemilik). |

## 2. Coolify: audit dan penghapusan

Temuan:
- Stack Coolify (coolify, db, redis, sentinel, proxy) hanya sekitar 215 MB RAM. Bukan penyebab utama RAM penuh. Penghabis terbesar: dua proses `hermes` (sekitar 960 MB), 9Router (proses `next-server`, sekitar 176 MB), dockerd.
- Hanya satu aplikasi di Coolify, status exited, tanpa domain. Container `docex` ternyata tidak dikelola Coolify (container Docker biasa dengan volume sendiri), jadi penghapusan Coolify tidak menyentuhnya.
- Port 8000 (dashboard), 6001, 6002 terbuka ke internet dan `ufw` mati. Dashboard hanya dilindungi password.
- `ubuntu` punya `sudo` tanpa password dan `sudo docker` jalan. Agent dengan tool terminal (mis. Juragan) praktis punya akses root ke VPS. Profile bukan sandbox.

Cara menghapus (skrip `coolify-remove.sh`, modenya `backup`, `plan`, `remove --yes`):
1. `backup`: `pg_dump` database + arsip `/data/coolify` + salinan `authorized_keys` root, di folder izin 700. Isinya berisi kunci Coolify, jangan dibagikan.
2. `remove --yes` menolak jalan tanpa backup dalam 24 jam, menghapus container, volume (`coolify-db`, `coolify-redis`, bukan `docex-data`), network, image, `/data/coolify`, dan baris kunci Coolify di `authorized_keys` root.
3. Hasil: port 8000/6001/6002/80/443 tertutup, `docex` tetap sehat.

Pelajaran:
- Ukur dulu sebelum menyimpulkan "Coolify penyebab RAM penuh". Angkanya kecil.
- Hapus layanan yang tidak dipakai sekaligus menutup port publik dan kunci akses root yang tidak perlu.

## 3. Dashboard monitoring (`vps-monitor`)

Desain: Python stdlib saja, tanpa panggilan keluar. Membaca `/proc`, systemd, cek port, dan file status Hermes. Tidak pernah membaca `.env`, token, prompt, isi pesan, atau command line proses.

Keamanan:
- Bind `127.0.0.1`. Header `Host` selain localhost/127.0.0.1 ditolak (403), melawan DNS rebinding.
- CSP ketat (`default-src 'none'`, skrip dan gaya hanya dari `self`). Teks dari data dimasukkan lewat `textContent`, bukan `innerHTML`.
- Service user systemd dengan `MemoryMax=80M`, memakai `python3 -I`. Butuh `loginctl` linger (sudah aktif).

Aturan yang terbukti:
- Ambang ada satu tempat (`TH` di `monitor.py`) dan UI membaca level dari API, bukan menghitung sendiri.
- Hindari alert permanen: swap warn 40%, crit 80% (swap 50% di VPS ini tampil WARN, bukan merah terus). Alert kegagalan cron hanya untuk 48 jam terakhir, karena `failure_streak` bertahan sampai job jalan lagi.
- Layanan yang sengaja mati ditandai (`EXPECTED_OFF`, mis. WhatsApp Nibie). Layanan opsional (Coolify) tidak memicu alert saat turun.
- Satuan: pakai GiB agar cocok dengan `df -h` dan `free`. GB desimal membuat angka disk tampak berbeda (63 vs 59).
- Cek sesi Shopee membaca hanya host dan path tab browser lewat port DevTools (`DevToolsActivePort`), tidak membaca cookie atau judul halaman.
- Grafik harus menyesuaikan jendela dengan data yang ada, kalau tidak, grafik tampak menumpuk di tepi kanan saat service baru jalan. Riwayat hanya di memori, hilang saat restart.

Hasil berguna: dashboard langsung menemukan kegagalan cron yang tidak terlihat (bagian 4).

## 4. Cron yang gagal diam-diam

Gejala: Vocab English harian gagal dengan `HTTP 403: model qwen3.7-flash-2026-07-15 not available for this API key`. Error lama 29-31 Okt: `HTTP 401: LiteLLM Virtual Key expected`.

Akar masalah: **11 job aktif** terkunci ke provider `qwen-backup` (Sumopod langsung, model Qwen), jalur yang sudah tidak punya akses (key ditolak). Tujuh job lain tidak terkunci dan sukses karena memakai model default.

Perbaikan: `hermes cron edit <id> --provider custom:9router --model free-tier`, setelah backup `jobs.json`. Jadwal dan tujuan Telegram tidak berubah.

Pelajaran:
- Cek field `provider` dan `model` per job. Job yang dikunci tidak mengikuti perubahan default.
- Jangan menjalankan job untuk mengetes bila job mengirim pesan ke orang lain (Zoom dan job Husni). Bukti perbaikan menunggu jadwal berikutnya.
- Entri `fallback_providers` di config Nibie memakai model Qwen dan key Sumopod yang sama (belum diubah, keputusan pemilik). Kalau model utama gagal, cadangannya ikut 403.

## 5. Juragan: Screen, browser, dan Shopee

- Screen (TigerVNC + Xfce) ternyata sudah terpasang. Yang menghalangi hanyalah gerbang RAM: `bot_desktop.min_free_memory_mb` (default 1536). `hermes -p <nama> computer-use screen status` menunjukkan angkanya.
- Dokumentasi Hermes: sekitar 1,1-1,5 GB per screen dengan browser, VPS 4 GB hanya cukup untuk desktop, 8 GB baru nyaman untuk takeover dengan browser.
- **Browser cloud tersembunyi:** profile yang belum punya `browser.cloud_provider` mengautodeteksi browser cloud pihak ketiga (di log: 14 sesi `*.cdp.browser-use.com`). Login Shopee dan data pesanan bisa lewat server luar. Perbaikan: `hermes -p juragan config set browser.cloud_provider local`. Profile `dr-eggbot`, `forge`, `jenni`, `scout` belum diset.
- Login Seller Centre tidak boleh dilakukan agent. Alurnya: Take over di Screen, login (OTP dan CAPTCHA manual), Hand back. Dashboard menunjukkan `logged in`, `logged out`, atau `browser not open`.
- Uji baca pesanan lewat agent (`hermes -p juragan -z "..."`) berhasil setelah prompt dipersempit: gunakan tab yang sudah login, jangan cari file, hanya baca, satu blok per pesanan. Prompt yang menyuruh mengambil URL "dari memori" membuat agent menjelajah file dan habis waktu.
- Model `glm-5.3-flash` lambat (5-12 detik per langkah). Beri batas waktu besar (840-1200 detik) dan jalankan di latar belakang.
- File hasil uji berisi username pembeli: hapus dari VPS setelah dibaca.

## 6. Akses: Gmail Juragan dan GitHub Forge

Gmail Juragan:
- Token Google Juragan ternyata sudah bukan Sheets-only: scope-nya Gmail baca, ubah, kirim, plus Drive, Calendar, Docs, Contacts. Itu terjadi karena proses otorisasi ulang memakai set scope bawaan skill. Keputusan pemilik: dibiarkan. Catatan risiko: agent dengan terminal praktis punya akses ke seluruh akun Google itu.
- Python sistem tidak punya library Google. Pakai `uv` bawaan Hermes: `uv run --with google-api-python-client --with google-auth-oauthlib --with google-auth-httplib2 python google_api.py ...`.

GitHub Forge:
- Skrip `set-secret.sh <profile> <VAR>` (di `~/hermes-migration-backups/tools/`) menerima token lewat prompt tersembunyi dan menulisnya ke `.env` profile itu saja (izin 600, backup dulu). Token tidak pernah lewat chat.
- `GH_TOKEN` dibaca oleh CLI `gh` dan oleh Hermes. Jenis token: fine-grained, semua repo, izin baca saja.
- Dependabot alerts 403 (izin belum dipasang atau fitur mati), code scanning 404 (belum aktif), secret scanning 200.
- **Kesalahan uji:** uji "tulis harus gagal" gw (POST issue) malah berhasil membuat issue di repo publik. Di repo publik siapa pun yang login boleh membuat issue, bahkan dengan token baca saja, jadi POST bukan uji izin. Uji izin yang benar: coba operasi yang butuh izin tulis sungguhan pada objek yang sudah ada (mis. PATCH, yang ditolak 403), atau baca `permissions`. Issue uji harus ditutup manual oleh pemilik (token tidak bisa menutupnya).

## 7. WhatsApp: grup berisik dan plugin listen-only

Gejala: satu rekap yang lo paste di grup membuat Juragan mengirim 6 pesan (progres, error, permintaan persetujuan) ke grup dalam 40 menit, padahal tidak ada cron aktif.

Penyebab (dugaan kuat dari log, tidak diuji terpisah): `WHATSAPP_REQUIRE_MENTION=true` di `.env` baru tertulis setelah gateway menyala, dan gateway tetap memproses pesan tanpa mention. Perubahan env pada gateway yang sedang jalan tidak boleh diasumsikan berlaku.

Fakta tentang adaptor WhatsApp Hermes:
- Tidak ada mode diam atau listen-only bawaan. Pesan yang diproses pasti memicu balasan agent. Tidak ada reaction (emoji reaksi) di adaptor maupun bridge.
- Gate grup ada di `_should_process_message`: pesan diproses kalau chat ada di `free_response_chats`, atau `require_mention` mati, atau diawali `/`, reply ke bot, mention bot, atau cocok pola.

Solusi yang bekerja: plugin dengan hook `pre_gateway_dispatch` yang mengembalikan `{"action": "skip"}` (pesan di-drop sebelum agent, plugin dianggap sudah menangani). Syarat: pesan harus sampai ke hook, jadi grup itu dimasukkan ke `WHATSAPP_FREE_RESPONSE_CHATS`, dan plugin sendiri yang menyaring.

Jebakan yang memakan waktu:
1. **Plugin per profile.** Plugin yang ditaruh di `~/.hermes/plugins/` dan di-enable lewat `hermes plugins enable` hanya terlihat oleh profile default. Pesan grup Juragan dirutekan lewat profile Juragan. Taruh di `~/.hermes/profiles/<nama>/plugins/` dan enable dengan `hermes -p <nama> plugins enable`. Gejala: `hook.log` tidak pernah mencatat panggilan.
2. **Reload panas cukup.** Setelah di-enable di profile yang benar, hook langsung terpanggil di gateway yang berjalan (`plugins disable` lalu `enable`). Restart tidak wajib.
3. Pesan "capability ... deny" di log (`tools.override`, `llm.*`) hanya bawaan untuk semua plugin, bukan penyebab hook gagal.
4. Tambahkan jejak diagnostik (`hook.log`: platform, ekor ID chat, hasil cek) sebelum menebak. Tanpa itu penyebabnya tidak terlihat.
5. Setiap error di jalur grup harus berujung `skip`, bukan jatuh ke agent, supaya bug tidak berubah jadi spam.

Rancangan pencatat (tanpa LLM):
- Parser: header `<username>` lalu `konfirmasi pesanan:`, lalu baris item. Satu pesan bisa banyak order.
- Pencatat berjalan lewat `uv` dengan lock file. Membaca tab bulan ini, mencari NO berikutnya dan baris kosong pertama (baris template berisi rumus di kolom D ke atas dianggap kosong), menulis kolom A, B, C dan Q (`ya`), membaca ulang, lalu mengirim emoji.
- Hanya nilai teks yang ditulis (`RAW`, NO sebagai angka) supaya teks item tidak diubah jadi tanggal. Kolom uang tidak diisi.
- Peluncuran dua tahap: `dry_run: true` dulu (hanya mencatat rencana di `ingest.log`), baru `false` setelah hook terbukti.
- Tanda di grup berupa satu pesan emoji: ✅ sukses terbaca ulang, ⚠️ masalah (rincian ke DM). Notifikasi masalah selalu ke DM, tidak pernah rincian di grup.
- 12 tes unit pada logika murni (`core.py`) jalan di laptop tanpa VPS.

Batas yang diketahui:
- Aturan duplikat versi pertama (username sudah ada = skip + ⚠️) terlalu kasar. Kolom Q adalah penanda "sudah diposting ke grup", dan order yang dicatat manual sebagai nama paket (1 baris, Q kosong) lalu direkap per komponen dianggap beda.
- Aturan sekarang (diterapkan atas keputusan pemilik, 16 tes unit lolos): username tidak ada = tulis blok baru dengan Q=`ya`; username ada dan semua item rekap sudah ada di salah satu bloknya = duplikat persis (⚠️); username ada tapi item beda = tandai Q=`ya` di blok terakhir yang Q-nya belum `ya`, tanpa baris baru (✅); semua blok sudah `ya` = "sudah ditandai" (⚠️, rincian ke DM).
- **Footer ledger (bug yang tertangkap sebelum penulisan pertama):** tab bulan berakhir dengan baris footer ("TOTAL READY" di C, kolom A berisi angka, lalu "Total Pesanan" di bawahnya). Karena A berisi angka, footer terbaca sebagai blok order dan rencana penulisan jatuh ke baris di bawah footer. Perbaikan: baca baris sampai footer lalu berhenti, jangan pernah menulis di atau setelah footer, dan laporkan "tidak ada baris kosong sebelum TOTAL READY" bila blok tidak muat (20 tes). Pelajaran: sebelum mode tulis, baca bentuk akhir ledger (bukan hanya baris data), dan uji perencanaan terhadap Sheet asli dengan `INGEST_FORCE_DRY=1`. Ruang kosong ada terbatas (baris di antara blok terakhir dan footer), jadi sisipkan baris di atas footer bila hampir penuh.
- Kegagalan tes yang berguna diingat: parser menolak username 1 karakter (pola minimal 2), dan data tes yang pendek bisa membuat tes tampak gagal padahal logikanya benar.
- Sheet tidak punya kolom ID pesanan atau tanggal, jadi dedupe lain tidak aman.
- Opsi `INGEST_FORCE_DRY=1` pada `ingest_cli.py` memaksa mode baca saja untuk uji ke Sheet asli tanpa mengubah `config.json`.

### 7b. Kolom checklist "Rekap" di Sheet

- Permintaan: satu kolom checklist rekap, rapi, mengikuti format yang ada, di samping Profit. Yang mengerjakan saya (bukan Juragan): wrapper Sheets Juragan hanya baca/tulis nilai, sedangkan checkbox, merge header, dan lebar kolom butuh `batchUpdate` struktur.
- Sebelum memilih tempat, baca ulang header: Sheet berubah sejak bacaan awal (header WA Habib Jastip di N4 sudah kosong, Q4 kini rumus ringkasan). Jangan mengandalkan peta kolom lama.
- Keputusan: **pakai kolom N** (bekas WA Habib Jastip, sudah dilewati) alih-alih menyisipkan kolom. Tidak ada kolom bergeser, jadi rumus ringkasan, tab lain, dan plugin (kolom Q) tetap aman. Nilai lama N diganti checkbox (TRUE bila Q = `ya`), hanya di baris awal order.
- Urutan aman: plugin dikembalikan ke `dry_run`, backup salinan penuh Sheet di Drive, salin format dan validasi dari sel Bayar (`copyPaste` PASTE_FORMAT dan PASTE_DATA_VALIDATION, header digabung N4:N5), isi nilai, baca ulang (tidak ada nilai nyasar, footer utuh).
- Plugin kini mencentang N bersama Q=`ya` untuk blok baru maupun blok yang ditandai, dan menyalin format dan validasi checkbox ke sel barunya.
- **Uji penulisan di salinan Sheet, bukan di data asli:** `INGEST_SHEET_ID` menunjuk salinan dan `INGEST_FORCE_LIVE=1` memaksa tulis walau config `dry_run`. Hasil: blok baru masuk dengan N tercentang (validasi BOOLEAN, rata tengah), Q=`ya`, baris lanjutan kosong, footer tidak tersentuh, jalur "tandai" juga benar. Salinan uji dipindah ke Trash Drive (bukan dihapus permanen).
- Catatan Juragan (skill, referensi Sheet, memori) diperbarui supaya N dianggap kolom Rekap, bukan WA Habib Jastip.

## 8. Pelajaran kerja (berlaku umum)

1. **Jangan klaim selesai tanpa bukti.** Tiga hal yang sering terlewat: login (hanya manusia), uji tulis nyata, dan job yang benar-benar jalan sendiri. Pause tetap pause tanpa izin eksplisit. "Tidak ada preferensi" bukan persetujuan.
2. **Uji yang tidak mengubah apa pun.** Uji "harus gagal" yang memakai operasi tulis bisa berhasil dan meninggalkan sampah (kasus issue GitHub).
3. **Perubahan env pada proses yang sedang jalan tidak berlaku.** Verifikasi lewat perilaku nyata, bukan hanya `.env`.
4. **Satu sumber kebenaran untuk ambang dan status**, dan tandai kondisi yang sengaja mati supaya tidak menjadi alarm palsu.
5. **Kunci cakupan akses sekecil mungkin**, tapi periksa scope token yang sebenarnya: scope bisa melebar tanpa terasa.
6. **Rahasia lewat prompt tersembunyi**, tidak lewat chat. Backup file `.env` berisi rahasia lain juga: perlakukan sama.
7. Tool shell di Windows: kirim skrip ke VPS lewat base64 stdin ke `bash -l`. Hati-hati `set -e` dengan `grep -c` (kode keluar 1 saat hasilnya 0) dan kutipan ganda yang hilang di PowerShell 5.1 saat memanggil `ssh`.
8. Hapus file hasil uji yang berisi data pembeli dari VPS setelah dibaca.

## 9. Yang masih terbuka

- Verifikasi tulis nyata ke Sheet dan ✅ pada rekap asli pertama dengan username baru. Bersihkan jejak diagnostik `hook.log` setelah terbukti.
- Tutup issue uji di repo publik (token tidak bisa).
- Tambah izin Dependabot alerts (baca) pada token GitHub Forge bila scan dependensi diinginkan.
- Cron Juragan masih paused (rekap 22:00 dan cek pagi). Tempelkan skill `shopee-whatsapp-recap` dan `google-workspace` ke cron Juragan sebelum diaktifkan.
- GitHub (Forge) dan Google plus Upwork (Scout) butuh kredensial dari pemilik untuk job mingguan mereka.
- Kunci `browser.cloud_provider: local` untuk `dr-eggbot`, `forge`, `jenni`, `scout`.
- Entri fallback Qwen di config Nibie dan port 7860 (`docex`) yang publik.
- SSH password login (rename drop-in menjadi `00-hardening.conf`), file sisa Bitwarden, dan folder profile sisa `coach`.
- Sesi Shopee bisa habis: login ulang manual. Token Google (mode Testing) perlu otorisasi ulang tiap sekitar 7 hari.

## 10. Lokasi (tanpa rahasia)

| Apa | Di mana |
|---|---|
| Dashboard (laptop) | `Training Project\vps-monitoring\` (`monitor.py`, `index.html`, `app.css`, `app.js`) |
| Dashboard (VPS) | `~/vps-monitor/`, service user `vps-monitor` |
| Plugin rekap (laptop) | `Training Project\vps-monitoring\juragan-recap-ingest\` |
| Plugin rekap (VPS) | `~/.hermes/profiles/juragan/plugins/juragan-recap-ingest/` (`config.json` izin 600, `ingest.log`, `hook.log`) |
| Skrip bantu (VPS) | `~/hermes-migration-backups/tools/` (`coolify-remove.sh`, `set-secret.sh`, dan lainnya) |
| Backup Coolify | `~/hermes-migration-backups/coolify-<waktu>/` (berisi kunci, jangan dibagikan) |
| Backup config | `*.bak-before-*` di tiap folder profile |
| Dokumen | `Training Project\vps-monitoring\docs\` |

## 11. 6 Nov 2026 — profile `aci`, WA, dan router

Tanpa nilai rahasia (nomor, key, markup uang). **[teruji]** = diuji di `bot-vps` pada sesi itu.

### 11.1 Provider 9router dan `.env` per profile

- Error gateway (WhatsApp): `No API key for custom provider '9router' … HERMES_CUSTOM_127_0_0_1_20128_API_KEY … not set for this profile` — key ada di environment server global, **tidak cukup**. Hermes membaca key itu dari **`~/.hermes/profiles/<profile>/.env`** untuk profile yang jalan.
- Perbaikan: set variabel di `.env` profile atau `hermes -p <profile> config set HERMES_CUSTOM_127_0_0_1_20128_API_KEY '…'` (input rahasia di terminal VPS, bukan chat).
- Profile lain yang sudah punya baris key yang sama bisa dipakai sebagai acuan bahwa **format variabel** benar; menyamakan nilai artinya **satu key dipakai beberapa profile** (trade-off: revoke tidak terpisah).
- Setelah mengubah `.env` profile, **`systemctl --user restart hermes-gateway.service`** dipakai agar konfigurasi terbaca.

### 11.2 Mematikan reasoning di UI dan terminal di WA (profile `aci`)

- Untuk menyembunyikan blok *thinking/reasoning* di Hermes: key yang dikenali adalah **`display.show_reasoning`**, bukan `display.reasoning` (itu ditolak sebagai key resmi; yang benar disarankan CLI).
- Mematikan tool **Terminal** **hanya untuk WhatsApp**: `hermes -p aci tools disable terminal --platform whatsapp`. Default subcommand `tools` tanpa `--platform` mengarah ke **`cli`**, jadi tidak menyentuh WA.
- Verifikasi: `hermes -p aci tools list --platform whatsapp` harus menunjukkan `terminal` **disabled**; `cli` boleh tetap punya terminal jika masih terdaftar di `platform_toolsets.cli`.

### 11.3 Hermes CLI dari SSH non-interaktif

- Di VPS, `hermes` sering **tidak di PATH** shell non-login; pakai **`bash -lc 'hermes …'`** (sudah terdokumentasi di `hermes-learnings.md` §2.1, tetap berlaku).

### 11.4 Reseller / markup di UI router (ingatan operasional)

- Rumus umum di UI: **harga jual = harga modal × (1 + markup%)** untuk input, output, dan cache read; model tanpa data modal dilewati.
- Opsi **hanya model yang belum punya harga jual** = jangan timpa harga manual yang sudah diset.
- Markup **tidak mengurangi** kebutuhan saldo di upstream: upstream tetap menagih pemakaian; buffer saldo dan alarm terpisah dari persentase markup.
