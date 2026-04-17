# Deploying Blue Collar Techy

Static HTML + Cloudflare Pages Functions. Auto-deploys on push to `main`.

## Live pages

- `/` — homepage
- `/about.html` — founder story
- `/blog/` — blog index
- `/blog/market-agency-or-you.html` — first post
- `/market-scan/` — free market demand scan lead magnet (form)
- `/api/scan` — Pages Function backend for the scan (POST JSON)

## One-time setup: environment variables

In Cloudflare Pages dashboard → your project → **Settings → Environment variables**, add these for **Production** (and Preview if you want it on branch deploys):

### Required

| Name | Value | Source |
|------|-------|--------|
| `DATAFORSEO_LOGIN` | `nick@tektongrowth.com` | existing account (already in `~/Projects/local-prospector/.env`) |
| `DATAFORSEO_PASSWORD` | `af230e7ad009b991` | same |
| `RESEND_API_KEY` | `re_...` | create at [resend.com/api-keys](https://resend.com/api-keys) |
| `RESEND_FROM_EMAIL` | `Blue Collar Techy <nick@bluecollartechy.com>` | domain must be verified on Resend |

### Optional

| Name | Value | Purpose |
|------|-------|---------|
| `SCAN_NOTIFY_EMAIL` | `nick@bluecollartechy.com` | BCCs you on every report that goes out — strongly recommended during launch |
| `GHL_API_KEY` | Private Integration Token (v2) | auto-push leads to GHL |
| `GHL_LOCATION_ID` | your location ID | required if using GHL |

## One-time setup: Resend

1. Sign up at [resend.com](https://resend.com) — free tier is 100 emails/day, 3,000/month. Plenty for launch.
2. **Add domain**: `bluecollartechy.com` → Resend will give you 3 DNS records (SPF, DKIM, return-path).
3. **Add DNS records in Cloudflare** (the DNS tab for bluecollartechy.com). After Cloudflare propagates (a few minutes), click "Verify" in Resend.
4. **Create API key** → scope "Full access" or "Sending access" → copy into `RESEND_API_KEY` above.

Without a verified domain, emails go out from `onboarding@resend.dev` and land in spam. Verified domain is required for the tool to feel legit.

## One-time setup: GHL (optional)

1. GHL → Settings → Integrations → **Private Integrations** → create new token with scopes: `contacts.write`, `contacts.readonly`.
2. Copy the token into `GHL_API_KEY`.
3. GHL → Settings → Business Profile → copy your Location ID into `GHL_LOCATION_ID`.

Leads flow in with tags `bct-market-scan` and `bct-<industry>`. Set up a GHL workflow on either tag to automate follow-up.

## Testing locally

Requires `wrangler` (Cloudflare's CLI):

```bash
npm install -g wrangler
```

Create `.dev.vars` in the project root (gitignored):

```
DATAFORSEO_LOGIN=nick@tektongrowth.com
DATAFORSEO_PASSWORD=af230e7ad009b991
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=onboarding@resend.dev
SCAN_NOTIFY_EMAIL=nick@bluecollartechy.com
```

Run locally:

```bash
wrangler pages dev .
```

Open `http://localhost:8788/market-scan/` and submit a real city + industry. The scan takes 60-90s. You should receive an email at the address you entered.

## Deploy

Cloudflare Pages auto-deploys on push to `main`. The first deploy after adding env vars needs to be re-triggered (env vars don't retroactively apply to old deploys). Either push an empty commit or click "Retry deployment" in CF dashboard.

## Monitoring

- **Resend dashboard** shows every email sent, delivery status, opens, clicks.
- **Cloudflare Pages → Functions** tab shows logs for `/api/scan` including any errors.
- **DataForSEO dashboard** shows real-time cost usage. Each scan costs ~$0.65–$0.80.

## Cost estimate

| Item | Per-scan | Monthly (100 scans) |
|------|---------:|---------------------:|
| DataForSEO API | ~$0.70 | ~$70 |
| Resend email | $0 (within free tier) | $0 |
| Cloudflare Pages | $0 | $0 (free tier handles this) |
| **Total** | **~$0.70** | **~$70** |

If this tool scales past ~1,000 scans/month, budget ~$700/mo in DFS costs. At that point it's driving serious lead flow and is worth the spend.

## Abuse protection

Current: honeypot field on the form + Cloudflare DDoS defaults.

If spam becomes a problem, add **Cloudflare Turnstile** (free captcha) to the form:
1. Turnstile dashboard → create widget → bind to `bluecollartechy.com`
2. Add the widget JS to `/market-scan/index.html`
3. Add server-side verification in `/functions/api/scan.js` before the honeypot check

## Troubleshooting

**"The scan didn't complete" on the user's side**
- Check CF Pages → Functions → Logs for the real error
- Most common: DFS timeout. The function has a 28s per-call timeout with 1 retry. If DFS is slow across all 10 categories, total time can hit the 30s function limit. Upgrade to CF Pages paid ($20/mo, 5-min limit) if this becomes frequent.

**Email doesn't arrive**
- Check Resend dashboard for delivery status
- If "bounced", the sending domain may not be fully verified
- If "delivered" but user can't find it, check spam/promotions

**Lead doesn't show in GHL**
- Check CF logs for `[ghl]` errors
- Most common: expired/revoked token, wrong location ID, or missing scopes
