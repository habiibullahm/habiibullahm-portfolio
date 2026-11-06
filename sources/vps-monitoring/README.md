# VPS Monitoring

Private dashboard for a single Ubuntu VPS, plus live health monitoring for the
[9Router](https://github.com/dnhsoft/9router) AI gateway running on it.

Python standard library only on the server side. No external services, no
telemetry, no outbound calls except to local ports.

## What it shows

**System health**
- CPU (1-minute average), load average per core, RAM, disk on `/`, swap
- Network and disk I/O throughput, plus a one-hour history of all three
- Top memory consumers

**Services and Hermes state**
- systemd units and listening ports: Hermes gateway, API forward, 9Router,
  WhatsApp bridge (Juragan), Docker, docex, SSH
- Hermes platform connection state per profile (Telegram, WhatsApp, API server)
- Cron job totals per profile, including which ones failed in the last 48 hours
- Raised and resolved alerts with timestamps

**9Router live model health**
- Every model used by the chat combos is probed with a tiny `ping` completion
- Per-model status, latency in milliseconds, and the upstream error text
- Provider connections with their test status, proxy flag and last error
- Combos with the number of models each one holds and how many currently fail
- Request counts and cost from the 9Router usage table, last hour and last 24 hours

## Layout

| File | Purpose |
| --- | --- |
| `monitor.py` | The HTTP server and all system checks. Binds `127.0.0.1` only. |
| `router_probe.py` | Probes 9Router models and writes `router_state.json`. |
| `app.js` | Dashboard front end. Renders the snapshot, no framework. |
| `app.css` | Styles. |
| `index.html` | Page shell. |
| `systemd/` | Unit files for the monitor and the probe timer. |

## Install

```bash
mkdir -p ~/.config/systemd/user
cp systemd/* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now vps-monitor.service
systemctl --user enable --now vps-router-probe.timer
```

## Use

The dashboard is not exposed to the network. Reach it through an SSH tunnel:

```bash
ssh -N -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -L 19999:127.0.0.1:19999 user@vps-host
```

Then open `http://127.0.0.1:19999/`.

## Run the probe manually

```bash
python3 router_probe.py
```

It writes `router_state.json`, which the monitor picks up on its next refresh.
The systemd timer runs it every five minutes.

## Privacy

- Binds `127.0.0.1` only and rejects requests whose `Host` header is not a
  local address.
- Reads `/proc`, systemd state and Hermes status files. It never reads
  `.env` files, tokens, prompts, message content or process command lines.
- `router_probe.py` reads the 9Router API key from the 9Router key table to
  send probes, but never writes it to disk or to the state file. Only model
  names, status, latency and error text are published.
- The published dashboard contains provider names and error text. Those may
  include an email address if you name a provider after your account.

## Requirements

- Linux, Python 3.10 or newer
- `systemd --user` for the units
- 9Router on `127.0.0.1:20128` for the model section
