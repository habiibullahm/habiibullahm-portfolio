# Panduan: Hubungkan Antigravity ke Agent Hermes (VPS) dan Komputer Lokal

Terakhir diperbarui: 2026-11-05. Versi 9Router yang diuji: 0.5.112.

## 1. Gambaran singkat

```
Agent Hermes (VPS) --> 9Router (VPS, :20128) --> proxy pool --> tunnel SSH --> proxy di PC kamu --> Google (Antigravity)
```

- Agent Hermes tidak bicara langsung ke Google. Agent bicara ke **9Router**, lalu 9Router yang memanggil Antigravity.
- Model yang dipakai: `ag/gemini-3.8-flash-low`.
- **Kenapa perlu proxy?** Google menolak (HTTP 403) permintaan Antigravity dari IP VPS (Tencent Cloud). Lewat IP ISP rumah/kantor (Telkom Indonesia) permintaan berhasil. Penyebab pastinya (IP datacenter atau aturan Google lain) belum terbukti; isi pesan 403 dari Google belum pernah tertangkap.

## 2. Yang harus ada dulu

- 9Router jalan di VPS (port 20128) dan akun Antigravity sudah login di sana (Providers -> Antigravity).
- Proxy pool "Home ISP via tunnel" sudah dibuat di 9Router: `http://127.0.0.1:18081`, **Strict Proxy ON**, dan sudah dipasang ke koneksi Antigravity (Providers -> Antigravity -> Apply Proxy).
- Folder ini (`antigravity-proxy`) ada di PC kamu: `connect-proxy.js` dan `start-antigravity-proxy.ps1`.

## 3. Jalankan proxy + tunnel (wajib, tiap kali mau dipakai)

Di PowerShell di PC kamu, jalankan lalu **biarkan jendelanya terbuka**:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-antigravity-proxy.ps1
```

**Otomatis saat Windows login (tanpa jendela):** jalankan sekali `powershell -ExecutionPolicy Bypass -File .\install-startup.ps1`. Hapus dengan `uninstall-startup.ps1`. Detail lengkap ada di [README.md](README.md).

Script ini menjalankan proxy di `127.0.0.1:18080` dan membuka tunnel SSH ke VPS (`bot-vps`) ke port `18081`. Kalau tunnel putus, script mencoba lagi tiap 10 detik. Hentikan dengan Ctrl-C.

Cek dari VPS (harus muncul ISP Indonesia, bukan Tencent):

```bash
curl -sS -m 15 -x http://127.0.0.1:18081 https://ipinfo.io/org
```

> Kalau PC mati, proxy atau tunnel berhenti, **Antigravity ikut gagal** (Strict Proxy mencegah jatuh ke IP VPS). Agent lain yang tidak memakai Antigravity tidak terpengaruh.

## 4. Hubungkan agent Hermes di VPS

Contoh ini untuk agent **default** (Nibie). Config-nya `~/.hermes/config.yaml`.

1. Cek dulu isinya sekarang (sudah memakai 9Router):

   ```yaml
   model:
     default: free-tier
     provider: custom:9router
   providers:
     9router:
       api: http://127.0.0.1:20128/v1
       key_env: HERMES_CUSTOM_127_0_0_1_20128_API_KEY
   ```

2. Backup, lalu ganti hanya `model.default`:

   ```bash
   cp -p ~/.hermes/config.yaml ~/.hermes/config.yaml.bak-$(date +%Y%m%d-%H%M%S)
   nano ~/.hermes/config.yaml
   ```

   ```yaml
   model:
     default: ag/gemini-3.8-flash-low
   ```

   Jangan ubah `provider`, `api`, atau `key_env`. Jangan tulis API key langsung di file ini.

3. Restart agent:

   ```bash
   systemctl --user restart hermes-gateway
   systemctl --user is-active hermes-gateway
   ```

4. Cek berhasil: buka 9Router -> **Console Log**. Cari baris seperti ini:

   ```
   POST ag/gemini-3.8-flash-low -> antigravity/gemini-3.8-flash-low
   [PROXY] ANTIGRAVITY | ... | url=http://127.0.0.1:18081
   DONE ...
   ```

   Muncul `DONE` = berhasil. Muncul `ERROR 403` = lihat bagian 6.

**Agent Hermes lain** (profile `dr-eggbot`, `forge`, `jenni`, `juragan`, `scout`): config-nya ada di `~/.hermes/profiles/<nama>/config.yaml` dan caranya sama (ganti `model.default`). Cara restart tiap profile belum saya cek, jadi pastikan dulu cara restart yang benar sebelum mengubahnya. Semua agent yang dipindah ke Antigravity ikut bergantung pada PC kamu.

## 5. Hubungkan dari komputer lokal

Ada dua kasus:

**A. Kamu hanya memakai 9Router yang ada di VPS (lewat tunnel SSH `-L`)**
Tunnel `ssh -L 20128:127.0.0.1:20128 bot-vps` sudah membuat `http://127.0.0.1:20128` di PC kamu menunjuk ke 9Router di VPS. Alat apa pun di PC yang kompatibel OpenAI bisa memakainya:

- Base URL: `http://127.0.0.1:20128/v1`
- Model: `ag/gemini-3.8-flash-low`
- API key: ambil dari dashboard 9Router -> **Endpoint & Key** (jangan dibagikan atau di-commit; simpan di variabel lingkungan).

Penting: bagian 3 (proxy + tunnel `-R`) tetap harus jalan, karena yang memanggil Google tetap 9Router di VPS.

**B. Kamu menjalankan 9Router sendiri di PC**
Pasang akun Antigravity di 9Router lokal, lalu pakai base URL `http://127.0.0.1:20128/v1` dan model yang sama. Karena permintaan keluar dari IP PC (ISP rumah), proxy kemungkinan **tidak diperlukan**. Ini belum saya uji, jadi tes dulu satu kali. Pastikan port 20128 tidak bentrok dengan tunnel `-L` (matikan salah satunya).

Tes satu permintaan dari PC (PowerShell, key dari variabel lingkungan):

```powershell
$env:NINEROUTER_KEY = Read-Host "Masukkan API key 9Router"
curl.exe -s http://127.0.0.1:20128/v1/chat/completions -H "Authorization: Bearer $env:NINEROUTER_KEY" -H "Content-Type: application/json" -d '{\"model\":\"ag/gemini-3.8-flash-low\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}'
```

## 6. Kalau gagal

| Gejala | Penyebab paling mungkin | Yang dilakukan |
|---|---|---|
| `[403]: HTTP 403` di Console Log | Proxy/tunnel mati, atau permintaan lolos lewat IP VPS | Jalankan ulang bagian 3, cek IP lewat perintah `ipinfo` |
| `Proxy CONNECT aborted` (dari VPS) | Proxy lokal di PC tidak jalan | Jalankan `start-antigravity-proxy.ps1` |
| `remote port forwarding failed for listen port` | Port itu sudah dipakai di VPS | Ganti port tunnel di script **dan** URL pool 9Router (harus sama) |
| `User location is not supported for the API use` (400) | Itu rute `gemini/...` (Gemini API biasa) dari IP VPS, bukan Antigravity | Jangan pakai rute itu dari VPS tanpa proxy |
| Model terkunci "reset after 2m" | Satu 403 mengunci model 2 menit | Tunggu, jangan klik Test berulang-ulang |
| Agent tidak berubah model | Gateway belum di-restart | `systemctl --user restart hermes-gateway` |

## 7. Kembali ke semula (rollback)

```bash
cp -p ~/.hermes/config.yaml.bak-XXXXXXXX ~/.hermes/config.yaml
systemctl --user restart hermes-gateway
```

## 8. Keamanan dan batasan

- Proxy hanya mengizinkan host Google (`*.googleapis.com`, `*.google.com`), `ipinfo.io`, serta `codebuddy.ai`, `tencent.com`, `minimax` (lihat `connect-proxy.js`), di port 443. Hanya listen di loopback.
- Jangan menempel API key, token, atau email akun di chat atau file ini.
- Ini solusi **sementara**: bergantung pada PC kamu yang menyala. Untuk permanen, pakai proxy yang selalu hidup di IP ISP biasa (bukan datacenter).
- Antigravity lewat 9Router memakai sesi OAuth yang tidak resmi untuk proxy; akun bisa dibatasi atau diblokir oleh Google (peringatan juga muncul di dashboard 9Router).
