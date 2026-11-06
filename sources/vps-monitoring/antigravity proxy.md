# Antigravity via home-ISP proxy

Why: Google returned 403 to Antigravity requests from the VPS (cloud-provider IP).
Routing that one provider through this PC's ISP address fixed it.

## Pieces
- `connect-proxy.js` — HTTP CONNECT proxy on 127.0.0.1:18080. Allows only `*.googleapis.com`, `*.google.com`, `ipinfo.io` on port 443. No payload logging.
- `start-antigravity-proxy.ps1` — starts the proxy and keeps an SSH reverse tunnel (VPS 127.0.0.1:18081 -> PC 127.0.0.1:18080), reconnecting every 10 s if it drops.
- 9Router (already configured): proxy pool "Home ISP via tunnel" = `http://127.0.0.1:18081`, Strict Proxy on, assigned to the Antigravity connection only.

## Run
```powershell
powershell -ExecutionPolicy Bypass -File .\start-antigravity-proxy.ps1
```
Leave the window open. The PC must stay on. If it stops, Antigravity requests fail (Strict Proxy blocks fallback to the VPS IP) and the other providers are unaffected.

## Check
- From the VPS: `curl -sS -m 15 -x http://127.0.0.1:18081 https://ipinfo.io/org` should print an Indonesian ISP, not Tencent.
- In 9Router: Providers -> Antigravity -> Test on one model (once; failures lock it for 2 min).

## Investigation record (2026-11-05)
Symptom: `HTTP 503: [antigravity/gemini-3.8-flash-*] [403]: HTTP 403` on every Gemini 3.8 Flash variant, two Google accounts, 9Router 0.5.112 (latest) on the Ubuntu VPS.

Proven:
- Upstream call `POST daily-cloudcode-pa.googleapis.com/v1internal:generateContent` returns a real 403 in ~200-340 ms; OAuth refresh and the subscription lookup succeed.
- Custom Headers empty; built-in User-Agent is the hardcoded `antigravity/hub/2.24.0 darwin/arm64` (a fixed macOS capture sent on every OS).
- The VPS egresses from Indonesia on AS132203 (Tencent Cloud).
- Same account and model, sent through a Telkom Indonesia residential address, succeeded (`DONE 3909ms`); the connection went from `unavailable`/403 to `active`.

Conclusion: Google rejected the VPS's cloud-provider address. Not proven: whether the cause is the datacenter ASN or Google's anti-abuse scoring of that range.

Not done / unverified: Google's 403 body was never captured (9Router logs only `HTTP 403`; Request Logs would write tokens unmasked, so it was not enabled). The upstream issues about fingerprint and account-verification 403s (decolua/9router #4979, #4434, #1138) were not ruled out, only made unnecessary for this account.

## Troubleshooting
- `remote port forwarding failed for listen port ...`: that port is taken on the VPS. Change `$RemotePort` in the script and the pool URL in 9Router together.
- `curl: (56) Proxy CONNECT aborted` from the VPS: the local proxy is not running (check `Get-NetTCPConnection -LocalPort 18080 -State Listen`) or the host is not on the allowlist in `connect-proxy.js`.
- Antigravity 403 returns: the tunnel is down or Strict Proxy has blocked the request. Verify the egress check above before retesting. Do not retest repeatedly; each 403 locks the model for 2 minutes.
- Do not paste the proxy URL if you later switch to an authenticated proxy; add it in the 9Router dashboard yourself.

## Limits
- Stopgap, not production-grade. A permanent fix needs an always-on proxy on a clean ISP address.
- Port 18080 was already in use on the VPS, hence 18081 remote.
- This PC's ISP traffic carries the Antigravity OAuth requests (TLS end to end, allowlisted hosts only).
