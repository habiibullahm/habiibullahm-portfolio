# Antigravity via home-ISP proxy

Google returned 403 to Antigravity requests from the VPS (cloud-provider IP). Routing that provider through this PC's ISP address fixed it.

Indonesian guide (Hermes on the VPS + local PC): [PANDUAN.md](PANDUAN.md)

## Files
| File | Purpose |
|---|---|
| `connect-proxy.js` | HTTP CONNECT proxy on `127.0.0.1:18080`. Port 443 only, allowlisted hosts, no payload logging. |
| `start-antigravity-proxy.ps1` | Starts the proxy and keeps an SSH reverse tunnel (VPS `127.0.0.1:18081` -> PC `127.0.0.1:18080`); retries every 10 s. |
| `run-hidden.vbs` | Launches the start script with no visible window. |
| `install-startup.ps1` | Creates a Startup-folder shortcut so everything starts at Windows logon. |
| `uninstall-startup.ps1` | Removes that shortcut. |

Allowlist (in `connect-proxy.js`): `*.googleapis.com`, `*.google.com`, `ipinfo.io`, `*.codebuddy.ai`, `*.tencent.com`, `minimax(i).(com|cn|io)`.

9Router (already configured on the VPS): proxy pool "Home ISP via tunnel" = `http://127.0.0.1:18081`, Strict Proxy on, assigned to the Antigravity connection only.

## Run
Manual (foreground, Ctrl-C stops it and the proxy):
```powershell
powershell -ExecutionPolicy Bypass -File .\start-antigravity-proxy.ps1
```

Automatic at every logon (no window):
```powershell
powershell -ExecutionPolicy Bypass -File .\install-startup.ps1
```
Remove with `uninstall-startup.ps1`. Requires `node` and `ssh` on PATH and a working `bot-vps` entry in `~/.ssh/config` (key-based, no passphrase prompt).

Stop the hidden instance:
```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'start-antigravity-proxy|connect-proxy|18081' } | ForEach-Object { Stop-Process -Id $_.ProcessId }
```

The PC must stay on. If the proxy or tunnel stops, Antigravity requests fail (Strict Proxy blocks fallback to the VPS IP); other providers are unaffected.

## Check
- Local: `Get-NetTCPConnection -LocalPort 18080 -State Listen`
- From the VPS: `curl -sS -m 15 -x http://127.0.0.1:18081 https://ipinfo.io/org` should print an Indonesian ISP, not Tencent.
- 9Router: Providers -> Antigravity -> Test one model, once (a failure locks it for 2 min).

## Troubleshooting
- `remote port forwarding failed for listen port ...`: the port is taken on the VPS. Change `$RemotePort` in the script and the pool URL in 9Router together.
- `curl: (56) Proxy CONNECT aborted` from the VPS: the local proxy is down, or the host is not in the allowlist.
- Antigravity 403 returns: tunnel down or Strict Proxy blocked it. Run the egress check before retesting; each 403 locks the model for 2 minutes.
- Do not paste the proxy URL if you switch to an authenticated proxy; add it in the 9Router dashboard yourself.

## Limits
- Stopgap. A permanent fix needs an always-on proxy on a clean ISP address.
- Port 18081 on the VPS because 18080 was already in use there.
- Antigravity OAuth traffic leaves via this PC's ISP (TLS end to end, allowlisted hosts only).

## Investigation record (2026-11-05)
Symptom: `HTTP 503: [antigravity/gemini-3.8-flash-*] [403]: HTTP 403` on every Gemini 3.8 Flash variant, two Google accounts, 9Router 0.5.112 on the Ubuntu VPS.

Proven:
- `POST daily-cloudcode-pa.googleapis.com/v1internal:generateContent` returns a real 403 in ~200-340 ms; OAuth refresh and subscription lookup succeed.
- Custom Headers empty; built-in User-Agent is the hardcoded `antigravity/hub/2.24.0 darwin/arm64`.
- The VPS egresses from Indonesia on AS132203 (Tencent Cloud).
- Same account and model via a Telkom Indonesia residential address succeeded (`DONE 3909ms`); the connection went from `unavailable`/403 to `active`.

Conclusion: Google rejected the VPS's cloud-provider address. Not proven: datacenter ASN vs. anti-abuse scoring of that range.

Not done: Google's 403 body was never captured (Request Logs would write tokens unmasked). Upstream issues on fingerprint/account-verification 403s (decolua/9router #4979, #4434, #1138) were not ruled out, only made unnecessary for this account.
