# Tunneling laptop ke VPS (bot-vps)

Dicek langsung di VPS pada 4 Nov 2026. Tidak ada rahasia di file ini.

## Prinsip
- `ssh -L <port-laptop>:127.0.0.1:<port-vps> bot-vps` membuat port di **laptop** yang meneruskan ke port di **VPS**.
- Layanan di VPS sengaja hanya mendengarkan di `127.0.0.1`, jadi satu-satunya jalur dari luar adalah tunnel SSH ini. `sshd` mengizinkan forwarding (`AllowTcpForwarding yes`) dan tidak membuka port tunnel ke luar (`GatewayPorts no`).
- Tunnel hanya hidup selama proses `ssh` jalan. Tutup tab-nya, tunnel mati.

## Peta port (terverifikasi)

| Port VPS | Isinya | Perlu tunnel? |
|---|---|---|
| 20128 | 9router (service sistem `9router.service`) | **Ya**, kalau Hermes lokal memakai 9router |
| 8642 | Hermes API server (butuh key) | Hanya kalau lo memang memakai API-nya |
| 9119 | Port **bawaan** `hermes serve` | **Tidak berjalan** di VPS, jadi tunnel ke sini pasti ditolak |
| 45163 dan sejenisnya | Backend yang dijalankan **Hermes Desktop** lewat gateway SSH (port acak, berubah) | **Jangan di-tunnel manual**, Desktop mengurusnya sendiri |
| 3001 | Bridge WhatsApp Juragan | **Jangan pernah** di-tunnel |

## Perintah yang benar

### 9router (untuk Hermes lokal)
Satu perintah, jalankan di tab Terminal panel yang dibiarkan terbuka:
```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 20128:127.0.0.1:20128 bot-vps
```
- `-N` wajib: tanpa itu `ssh` membuka shell interaktif di VPS (itu beda dengan baris kedua di catatan lo).
- `ExitOnForwardFailure=yes`: langsung gagal kalau port sudah terpakai, tidak diam-diam jalan tanpa tunnel.
- `ServerAlive...`: memutus dan memberi tahu kalau koneksi mati.
- Hermes lokal sudah dikonfigurasi ke `http://127.0.0.1:20128/v1`.

### Dashboard Hermes (port 9119)
**Tidak perlu tunnel manual.** Di Hermes Desktop, gateway SSH (Settings, Gateways, Add connection, SSH) membuka tunnel dan menjalankan backend sendiri di port acak, dengan token yang diambil lewat tunnel itu.
Kalau lo tetap ingin tunnel manual ke 9119 (belum gw uji, ada autentikasi), cek dulu apakah ada backend yang jalan:
```bash
ssh bot-vps "bash -lc 'hermes serve --status'"
```
Hanya kalau backend itu ada di port 9119, buka tunnel `-L 9119:127.0.0.1:9119`. `hermes serve` juga punya `--port` (untuk menjalankan) dan `--stop`.

**Penting: `hermes` tidak ketemu lewat `ssh bot-vps "hermes ..."`.** Shell non-interaktif tidak memuat `~/.local/bin`, jadi muncul `bash: hermes: command not found`. Bungkus dengan `bash -lc '...'`, atau pakai path penuh `/home/ubuntu/.local/bin/hermes`. Kalau masuk interaktif dulu (`ssh bot-vps`), tidak ada masalah.

## Cek sebelum dan sesudah

**Di VPS** (`ssh bot-vps`):
```bash
ss -ltn | grep ':20128 '
```
```bash
systemctl is-active 9router.service
```

**Di laptop** (PowerShell):
```powershell
Get-NetTCPConnection -LocalPort 20128 -State Listen
```
Siapa pemiliknya:
```powershell
(Get-CimInstance Win32_Process -Filter "ProcessId=<PID>").CommandLine
```
Hentikan tunnel lama:
```powershell
Stop-Process -Id <PID>
```
Tes jalan (hanya daftar model, tidak memakai token):
```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:20128/v1/models | Select-Object StatusCode
```

## Pesan error dan artinya

| Pesan | Penyebab | Perbaikan |
|---|---|---|
| `channel N: open failed: connect failed: Connection refused` | Tunnel jadi, tapi **tidak ada layanan** di port itu di VPS (kasus 9119) | Cek `ss -ltn` di VPS. Jangan tunnel ke port yang tidak jalan |
| `bind [127.0.0.1]:20128: Permission denied` atau `Address already in use` | Port itu **sudah terpakai di laptop**, biasanya tunnel yang sudah ada | Pakai tunnel yang ada, atau hentikan lalu buat baru, atau pakai port lain |
| `Permission denied (publickey)` | Key SSH tidak terbaca | Pastikan `ssh bot-vps` biasa masih bisa masuk |
| HTTP 401 dari `/v1/chat/completions` | Key 9router salah atau masih placeholder | Perbaiki di `C:\hh\.env` atau Settings, Providers |
| Timeout di Hermes lokal | Tunnel mati | Jalankan lagi perintah di atas |

Catatan: `/v1/models` terbuka tanpa key, tapi **panggilan model butuh key asli**. HTTP 200 di daftar model bukan bukti key benar.

## Port laptop lain
Kalau 20128 terpakai dan tidak mau dihentikan, pakai port laptop berbeda dan sesuaikan alamat provider:
```bash
ssh -N -o ExitOnForwardFailure=yes -L 20129:127.0.0.1:20128 bot-vps
```
Lalu di Hermes lokal ubah `providers.9router.api` jadi `http://127.0.0.1:20129/v1`.

## Keamanan
- Biarkan `-L` memakai default (hanya `127.0.0.1` di laptop). Jangan tulis `-L 0.0.0.0:...`.
- Pakai **key 9router khusus laptop** (bisa dicabut terpisah dari key VPS).
- Tunnel menyalurkan semua isi (termasuk halaman browser yang dilihat agent lokal) lewat VPS ke penyedia model. Anggap VPS bagian dari jalur data laptop kantor lo.
- Setelah `PasswordAuthentication no` di VPS, tunnel tetap jalan karena memakai key.

## Status saat ini
- Hermes lokal: provider `9router`, model `free-tier`, alamat `http://127.0.0.1:20128/v1`. Key asli belum terpasang saat gw cek terakhir.
- Tunnel 20128 lo sebelumnya berjalan sebagai proses `ssh.exe -L 20128:127.0.0.1:20128 bot-vps` (tanpa `-N`, jadi membawa shell interaktif).
- Port 9119 di VPS tidak dipakai siapa pun.
