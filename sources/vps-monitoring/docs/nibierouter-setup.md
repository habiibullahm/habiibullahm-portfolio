# NibieRouter, from a SumoRouter instance

Written 7 Nov 2026 from a live setup. No API keys, webhook secrets, or account numbers.

**[teruji]** means it was checked in that session.

## Problem

SumoPod issued a SumoRouter app at `https://sr-44e28f.jkt11.sumopod.my.id`. The Quick Start page still prints `http://localhost:3000/v1`. Copying that sample misses this instance.

Two balances look like one. NibieRouter credit is what the caller spends. Sumopod AI (`https://ai.sumopod.com/v1`) is what pays the model after NibieRouter accepts the call. Topping up Sumopod AI does not fill the NibieRouter header.

A key capped at `$0.00` returns 402 while the account still has credit. A webhook URL with a trailing dot returns 404. A Cloudflare CNAME to the SumoPod host returns error 1014. Live QRIS stays off until KYC is approved.

## Process

### 1. API base

The working base URL is:

`https://sr-44e28f.jkt11.sumopod.my.id/v1`

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://sr-44e28f.jkt11.sumopod.my.id/v1/models
```

Expected: `200`. The list includes `deepseek-v4.1-flash-1017`. **[teruji]**

Admin, Manage Providers shows one provider: **Sumopod AI**, Connected. **[teruji]**

Send the key as `Authorization: Bearer` or `x-api-key`. A missing or revoked key is 401. An empty account or a key that has hit its own cap is 402. An unknown model is 404.

### 2. Key cap versus account balance

The account showed `$0.55`. The key named `nibie` showed `$0.00 of $0.00`. 9router logged:

```text
[402]: {"error":{"code":402,"message":"this API key has reached its credit limit","type":"insufficient_credits"}}
```

Edit the key and clear **Credit limit (USD)**. The form says to leave it empty so the key can use the whole account balance. After save, the row reads **No limit**. **[teruji]**

9router then locks that model for about two minutes. Wait that out before retrying.

### 3. Sandbox payment

Settings, Payments uses Sumopod, sandbox, QRIS. The sandbox API base is `https://api-pay-sandbox.sumopod.com`. The rate in this session was IDR 18,200 per 1 USD. Minimum top-up was IDR 10,000.

Create the sandbox project in SumoPod Managed Payment first. Quick Start shows the API key. The signing secret and webhook token appear only after a webhook URL is saved.

Set Site URL before copying the webhook:

`https://sr-44e28f.jkt11.sumopod.my.id`

An empty Site URL makes the webhook `http://localhost:3000/...`. SumoPod cannot call that.

The webhook path must not end with a dot.

Wrong: `.../api/webhooks/sumopod/sandbox.`

That returns `404 unknown environment`. **[teruji]**

Right: `https://sr-44e28f.jkt11.sumopod.my.id/api/webhooks/sumopod/sandbox`

Paste the `whsec_` and `whtok_` values from SumoPod into NibieRouter. Save and Test returned `200`. **[teruji]**

Billing, Top up, Rp 10,000 opens `sumo.sandbox.pymnt.global`. Do not scan it with a real bank app. In SumoPod, Payments, open the pending row and choose **Simulate Payment**.

Result: order `SR-20261106-824607E84723`, status Completed, credit about `$0.55`. SumoPod recorded amount 10,000, fee 370, net 9,630. **[teruji]**

### 4. 9router on the VPS

9router on `bot-vps` listens at `127.0.0.1:20128`. The provider named `nibierouter` is OpenAI-compatible:

- Base URL: `https://sr-44e28f.jkt11.sumopod.my.id/v1`
- Prefix: `nibierouter`
- Default model: `deepseek-v4.1-flash-1017`
- API key: the NibieRouter key named `nibie`

Call it as `nibierouter/deepseek-v4.1-flash-1017`.

Admin analytics for 7 Nov 2026: 24 requests, revenue about `$0.0014`, upstream cost about `$0.0012`, 2 errors, 1 user. **[teruji]**

Build: SumoRouter `1.0.14`, commit `7def12d`, built `2026-11-06T13:03:08Z`. **[teruji]**

Hermes profile `aci` on the VPS points at `https://router.ariaseta.com/v1`, not at this NibieRouter host. Do not mix those keys.

### 5. Domain

`nibie.com` already resolves. It was not bought.

`nibie.app` was registered at Cloudflare. Active until 7 Nov 2027. Renewal `$14.20/year`.

DNS, zone `nibie.app`:

| Name | Type | Content | Proxy |
|---|---|---|---|
| `router` | CNAME | `sr-44e28f.jkt11.sumopod.my.id` | DNS only |

`https://router.nibie.app/v1/models` returned Cloudflare `403` and `error code: 1014`. **[teruji]**

1014 means this zone cannot stand in front of a hostname that another Cloudflare account already proxies.

SumoPod, the nibie app, Custom Domain returns `404 service not found`. The app record has custom domain disabled and an empty upgrade list. **[teruji]**

Do not set NibieRouter **Site URL** to `https://router.nibie.app` until that host serves the app.

### 6. Admin MCP

Admin API keys are not the model key. Create one under Admin API. Leave **Allowed IP addresses** empty for a laptop. The secret is shown once.

Cursor user config, not this repo: `C:\Users\muhammad.habiibullah\.cursor\mcp.json`

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

`get_system_info` returned HTTP 200 and version `1.0.14`. **[teruji]**

Read tools used: `list_users`, `get_analytics`, `list_user_topups`. Tools that change credit, prices, or users need a yes first. Revoking an admin key does not revoke the model key `nibie`.

## Decisions

- Keep `https://sr-44e28f.jkt11.sumopod.my.id` as the machine address until SumoPod attaches a custom domain.
- Customers should see `https://router.nibie.app` and call `https://router.nibie.app/v1`. That name is not live yet.
- `nibie.app` is the company name. It does not have a homepage yet.
- Sandbox proved the payment path. Live waits for KYC. Review was submitted and usually takes 1-3 business days. Sandbox keys do not carry over. The Live webhook path ends in `/live`.
- Email stays off. There is no verified sender domain.

## Learnings

- The docs base URL and this instance's base URL are different. Test `/v1/models` on the host you will ship.
- 402 has two causes: the account is empty, or the key's own cap is hit. `this API key has reached its credit limit` is the cap.
- Webhook paths are exact. A trailing dot is a different environment name.
- A CNAME to a SumoPod hostname is not a custom domain. SumoPod has to accept the name, and this plan has that switch off.
- NibieRouter credit and Sumopod AI credit are spent in that order. One balance does not refill the other.
