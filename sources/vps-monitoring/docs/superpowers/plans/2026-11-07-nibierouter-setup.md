# NibieRouter setup from SumoRouter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the working setup of a SumoRouter instance named NibieRouter, from first API call through sandbox billing, domain, and admin MCP.

**Architecture:** SumoPod hosts the app at a fixed hostname. Callers pay NibieRouter credit. NibieRouter pays Sumopod AI for the model. 9router on the VPS is an optional front. A custom hostname is DNS plus a SumoPod-side attach. Live QRIS is a separate SumoPod KYC gate.

**Tech Stack:** SumoRouter 1.0.14, Sumopod AI, SumoPod Managed Payment (QRIS), Cloudflare DNS, 9router on `127.0.0.1:20128`, admin MCP at `/mcp`.

## Global Constraints

- Do not write API keys, webhook secrets, admin keys, bank numbers, or KTP data into this repo.
- Public base URL until a custom domain works: `https://sr-44e28f.jkt11.sumopod.my.id/v1`
- Customer hostname to aim for: `https://router.nibie.app`
- Sandbox credit is test credit. It is not a bank charge.
- Live payments stay off until SumoPod approves KYC.
- This SumoRouter service has custom domain disabled. DNS alone does not rename the app.
- Money inside admin MCP tools is nano-USD. 1 USD = 1,000,000,000 nano-USD.
- Docs in this repo mark checks the way `docs/hermes-learnings.md` does: **[teruji]** when tried in this session.

---

## File structure

- Create: `docs/superpowers/plans/2026-11-07-nibierouter-setup.md` (this file). One learning record. No app code.

## Problem

The SumoPod app URL `https://sr-44e28f.jkt11.sumopod.my.id` works. The sample docs say `http://localhost:3000/v1`. Callers who copy that sample miss the instance. A top-up on Sumopod AI does not fill NibieRouter credit. A key with a $0 credit cap returns 402 even when the account has credit. A webhook URL with a trailing dot returns 404. A CNAME to the SumoPod host returns Cloudflare error 1014.

## Decisions

- Keep the SumoPod hostname as the machine address.
- Show customers `router.nibie.app` after SumoPod accepts that name.
- Keep `nibie.app` as the company name. Do not buy `nibie.com`. It already resolves.
- Fund model calls with two wallets: NibieRouter credit, then Sumopod AI.
- Use sandbox to prove the payment path. Use Live only after KYC.
- Put the admin MCP key in the user Cursor config, not in git.

---

### Task 1: Confirm the instance and the API base

**Files:**
- Modify: `docs/superpowers/plans/2026-11-07-nibierouter-setup.md`

**Interfaces:**
- Consumes: a browser session already logged into NibieRouter
- Produces: base URL `https://sr-44e28f.jkt11.sumopod.my.id/v1`

- [ ] **Step 1: Ignore the sample host in Quick Start**

The Quick Start page prints `http://localhost:3000/v1`. That string is the product template. This instance answers on:

`https://sr-44e28f.jkt11.sumopod.my.id/v1`

- [ ] **Step 2: List models**

Run:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://sr-44e28f.jkt11.sumopod.my.id/v1/models
```

Expected: `200` and a JSON `data` array. Chat models include `deepseek-v4.1-flash-1017`. **[teruji]**

- [ ] **Step 3: Read the provider line**

Admin → Manage Providers shows one row: **Sumopod AI**, Connected, "Every model is served by Sumopod AI for now." **[teruji]**

---

### Task 2: Separate the two wallets

**Files:**
- Modify: `docs/superpowers/plans/2026-11-07-nibierouter-setup.md`

**Interfaces:**
- Consumes: Task 1 base URL
- Produces: the rule "402 on NibieRouter is NibieRouter credit, not the Sumopod AI balance"

- [ ] **Step 1: Name the wallets**

| Wallet | Where it shows | What it pays |
|---|---|---|
| NibieRouter credit | Header balance on the NibieRouter site | The caller. Empty credit returns 402. |
| Sumopod AI | SumoPod AI billing, provider `sumopod-main` in 9router at `https://ai.sumopod.com/v1` | The model cost after NibieRouter accepts the call. |

A top-up on Sumopod AI does not increase the NibieRouter header. **[teruji]**

- [ ] **Step 2: Read a key limit before blaming the account**

API Keys → key `nibie` once showed `$0.00 of $0.00`. The account still showed `$0.55`. 9router logged:

```text
[402]: {"error":{"code":402,"message":"this API key has reached its credit limit","type":"insufficient_credits"}}
```

Edit the key. Clear **Credit limit (USD)**. The hint on the form is "Leave empty to let this key use the whole account balance." After save, the row reads **No limit**. **[teruji]**

---

### Task 3: Prove sandbox top-up

**Files:**
- Modify: `docs/superpowers/plans/2026-11-07-nibierouter-setup.md`

**Interfaces:**
- Consumes: SumoPod Managed Payment in Sandbox, NibieRouter Billing
- Produces: one completed sandbox top-up. Not a Live payment.

- [ ] **Step 1: Turn payments on only after the gateway key exists**

Settings → Payments → Sumopod. Sandbox API base is `https://api-pay-sandbox.sumopod.com`. Method is QRIS. Rate used in this session: IDR 18,200 per 1 USD. Minimum top-up IDR 10,000.

If the badge says **API key missing**, create a sandbox project under SumoPod → Managed Payment → Sandbox, then paste the API key. Quick Start shows the API key. The signing secret appears only after a webhook URL is saved under Settings → Webhook.

- [ ] **Step 2: Set Site URL before copying the webhook**

Settings → General → Site URL for this instance:

`https://sr-44e28f.jkt11.sumopod.my.id`

Empty Site URL makes the webhook `http://localhost:3000/api/webhooks/sumopod/sandbox`. SumoPod cannot call that.

- [ ] **Step 3: Save the webhook with no trailing dot**

Wrong: `https://sr-44e28f.jkt11.sumopod.my.id/api/webhooks/sumopod/sandbox.`

That path returns:

```text
{"error":{"code":404,"message":"unknown environment","type":"not_found_error"}}
```

Right: `https://sr-44e28f.jkt11.sumopod.my.id/api/webhooks/sumopod/sandbox`

Paste SumoPod's `whsec_…` into **Signing secret** and SumoPod's `whtok_…` into **Webhook token**. Save. SumoPod → Save & Test.

Expected: `Test webhook delivered successfully` and `Response: 200`. **[teruji]**

- [ ] **Step 4: Complete a sandbox payment without a real bank app**

Billing → Top up → Rp 10,000. The checkout host is `sumo.sandbox.pymnt.global`. Do not scan it with a real wallet.

SumoPod → Managed Payment → Payments → the pending row → **Simulate Payment**.

Expected on NibieRouter: status **Completed**, credit about **$0.55**. Order seen: `SR-20261106-824607E84723`. SumoPod showed amount 10,000, fee 370, net 9,630, environment sandbox. **[teruji]**

Admin MCP `list_user_topups` for the owner returned one row: `amount_idr` 10000, `credit_nano` 549450549, `environment` sandbox, `status` completed. **[teruji]**

---

### Task 4: Call a model through 9router

**Files:**
- Modify: `docs/superpowers/plans/2026-11-07-nibierouter-setup.md`

**Interfaces:**
- Consumes: 9router provider connection named `nibierouter`
- Produces: model id `nibierouter/deepseek-v4.1-flash-1017`

- [ ] **Step 1: Point 9router at this instance**

On `bot-vps`, 9router listens on `127.0.0.1:20128`. Dashboard: `http://127.0.0.1:20128/dashboard/providers`.

The connection `nibierouter` is an OpenAI-compatible chat provider:

- Base URL: `https://sr-44e28f.jkt11.sumopod.my.id/v1`
- Prefix: `nibierouter`
- Default model: `deepseek-v4.1-flash-1017`
- API key: the NibieRouter key named `nibie`

Do not put that key in git. Hermes on the VPS does not store it. The VPS Hermes profile `aci` stores a different router key for `https://router.ariaseta.com/v1`.

- [ ] **Step 2: Retry after a 402 lock**

A 402 from the key cap makes 9router lock that model for about 2 minutes. Clear the key cap first (Task 2), wait out the lock, then call `nibierouter/deepseek-v4.1-flash-1017` again.

- [ ] **Step 3: Read the result in admin analytics**

Admin MCP `get_analytics` for Asia/Jakarta showed, for 7 Nov 2026: 24 requests, model `deepseek-v4.1-flash-1017`, revenue_nano 1409748, upstream_cost_nano 1174790, errors 2, one user. **[teruji]**

`get_system_info` returned version `1.0.14`, commit `7def12d8ff132643bbea6f05b021462ce7c6c5d9`, built_at `2026-11-06T13:03:08Z`. **[teruji]**

---

### Task 5: Domain name, without pretending the app moved

**Files:**
- Modify: `docs/superpowers/plans/2026-11-07-nibierouter-setup.md`

**Interfaces:**
- Consumes: Cloudflare account that owns `nibie.app`
- Produces: DNS record `router.nibie.app`. The app still answers on the SumoPod host.

- [ ] **Step 1: Register the company name**

`nibie.com` already has A records and GoDaddy nameservers. Do not buy it.

`nibie.app` was registered at Cloudflare on 7 Nov 2026. Status Active. Expiration 7 Nov 2027. Renewal **$14.20/year**. First year on the public price list was **$8.20**. Registrar page: `https://dash.cloudflare.com/domains`.

- [ ] **Step 2: Add only the product hostname**

Cloudflare DNS for zone `nibie.app`:

| Name | Type | Content | Proxy |
|---|---|---|---|
| `router` | CNAME | `sr-44e28f.jkt11.sumopod.my.id` | DNS only |

Leave `nibie.app` and `www` empty until a real homepage exists. **[teruji]**

- [ ] **Step 3: Stop when Cloudflare returns 1014**

`curl -sS -D - -o NUL https://router.nibie.app/v1/models` returned:

```text
HTTP/1.1 403 Forbidden
error code: 1014
```

1014 means this Cloudflare zone cannot proxy, or follow, a hostname that is already proxied on another Cloudflare account. Orange-cloud on this CNAME hits the same error. **[teruji]**

- [ ] **Step 4: Ask SumoPod to attach the name**

SumoPod → Apps → service **nibie** → Custom Domain. The service id in the dashboard URL is `80d2b661-02db-40b3-9c8f-a86134a1a5a8`. The app record says `service_type` `sumorouter`, `project_id` `sr-44e28f`, `is_custom_domain_enable` false.

POST `https://ws.sumopod.com/api/v1/services/80d2b661-02db-40b3-9c8f-a86134a1a5a8/domains` returns:

```text
{"error":"service not found","code":"NOT_FOUND"}
```

The upgrade list for that service was `[]`. DNS cannot finish this step. **[teruji]**

Do not change NibieRouter **Site URL** to `https://router.nibie.app` until that host returns the app. A wrong Site URL rewrites the webhook to a host SumoPod cannot reach.

---

### Task 6: Admin MCP

**Files:**
- Modify: `C:\Users\muhammad.habiibullah\.cursor\mcp.json` (user config, not this repo)
- Do not commit: any file that contains `sk-admin-`

**Interfaces:**
- Consumes: an admin key created on NibieRouter → Admin API
- Produces: MCP server name `sumorouter-admin`

- [ ] **Step 1: Create the key in the dashboard**

Admin API → Create admin key. Suggested name: `Cursor nibie`.

| Field | Value |
|---|---|
| Expires | In 90 days (the form default) |
| Allowed IP addresses | empty |
| Read-only | off, if the agent must change settings |

Empty IP list means the key works from a laptop whose address changes. A filled IP stops working on the next network.

The secret is shown once. If the row already shows `sk-admin-****…`, the secret is gone. Revoke that row and create another. Do not paste the secret into chat.

- [ ] **Step 2: Write the Cursor config**

`C:\Users\muhammad.habiibullah\.cursor\mcp.json`:

```json
{
  "mcpServers": {
    "sumorouter-admin": {
      "type": "http",
      "url": "https://sr-44e28f.jkt11.sumopod.my.id/mcp",
      "headers": {
        "Authorization": "Bearer PASTE_ADMIN_KEY_HERE"
      }
    }
  }
}
```

Replace `PASTE_ADMIN_KEY_HERE`. Keep the word `Bearer` and one space.

- [ ] **Step 3: Check the handshake**

Reload MCP in Cursor, or POST `tools/call` for `get_system_info` with header `Accept: application/json, text/event-stream`.

Expected HTTP 200 and `"version": "1.0.14"`. **[teruji]** on the key created after the first revoke.

The first key, named `cursor`, was revoked on purpose. A revoked admin key returns 401. The model key `nibie` is a different key and keeps working.

Tools that change credit, prices, users, or settings need a human yes. Read tools used in this session: `get_system_info`, `list_users`, `get_analytics`, `list_user_topups`.

---

### Task 7: What is still blocked

**Files:**
- Modify: `docs/superpowers/plans/2026-11-07-nibierouter-setup.md`

**Interfaces:**
- Consumes: Tasks 1–6
- Produces: the stop line for this setup

- [ ] **Step 1: Leave Live alone**

KYC was submitted. The screen said review usually takes 1–3 business days. Live QRIS stays off until SumoPod approves it. After approval, switch Settings → Payments to **Live** and paste the Live API key, signing secret, and webhook token. Sandbox secrets do not carry over. The Live webhook path ends in `/live`.

- [ ] **Step 2: Leave email off**

Sender email needs a domain SumoPod Email has verified. No custom email domain was verified. Username `username` from the SMTP tutorial is not an email address. **Send emails** stays off. Signup confirmation and password reset will not send.

- [ ] **Step 3: Stop**

Working today: the SumoPod URL, the model key, sandbox credit, 9router prefix `nibierouter`, and admin MCP.

Not working today: `https://router.nibie.app`, Live charges, and mail from NibieRouter.

---

## Self-review

- Spec coverage: instance, wallets, key cap, sandbox payment, webhook dot, 9router, domain, 1014, custom-domain 404, MCP, KYC wait. Each has a task.
- No secret values are in the steps. Placeholders are the string `PASTE_ADMIN_KEY_HERE` and the public prefixes already shown in the dashboard.
- Hostnames and order ids match the session notes. `router.ariaseta.com` is named only so it is not confused with this instance.
