# Deploying Blue Collar Techy

Static HTML + Cloudflare Pages Functions. Auto-deploys on push to `main`.

## Live pages

- `/` — homepage (includes newsletter signup form in `#newsletter` section)
- `/about.html` — founder story
- `/blog/` — blog index
- `/blog/market-agency-or-you.html` — first post
- `/resources/` — free resources hub
- `/market-scan/` — free market demand scan lead magnet (form)
- `/api/scan` — Pages Function backend for the scan (POST JSON)
- `/api/subscribe` — Pages Function backend for the newsletter signup (POST JSON)

## One-time setup: environment variables

In Cloudflare Pages dashboard → your project → **Settings → Environment variables**, add these for **Production** (and Preview if you want it on branch deploys):

### Required for the market scan (`/api/scan`)

| Name | Value | Source |
|------|-------|--------|
| `DATAFORSEO_LOGIN` | `nick@tektongrowth.com` | existing account |
| `DATAFORSEO_PASSWORD` | `af230e7ad009b991` | existing account |

### Required for the newsletter (`/api/subscribe`)

| Name | Value | Source |
|------|-------|--------|
| `RESEND_API_KEY` | `re_...` | resend.com/api-keys |
| `RESEND_AUDIENCE_ID` | UUID | resend.com/audiences → create "Blue Collar Techy" audience, copy the ID |

### Optional (lead capture into GHL)

| Name | Value | Purpose |
|------|-------|---------|
| `GHL_API_KEY` | v2 Private Integration Token | mirror scan submitters + newsletter subscribers into GHL |
| `GHL_LOCATION_ID` | your location ID | required if using GHL |

The market scan itself does not email anything — the report renders inline when the scan completes. The Resend integration is only for newsletter signups. If they want a copy of a scan report, they hit **Save as PDF** (triggers the browser print dialog with a print-stylesheet we already ship).

## One-time setup: Resend

1. Sign up at [resend.com](https://resend.com). Free tier covers 3,000 transactional emails/month and 3,000 broadcast emails/month with an audience up to 3,000 subscribers.
2. **Add domain**: `bluecollartechy.com` → Resend will give you 3 DNS records (SPF, DKIM, return-path). Add them in Cloudflare DNS for `bluecollartechy.com`, then click "Verify" in Resend. Required for any broadcasts to deliver.
3. **Create audience**: Resend dashboard → Audiences → New audience → name it "Blue Collar Techy". Copy the audience ID into `RESEND_AUDIENCE_ID`.
4. **Create API key**: Resend dashboard → API Keys → New → scope "Full access". Copy into `RESEND_API_KEY`.

Subscribers flow into the audience in real time when someone submits the homepage newsletter form. Send broadcasts from the Resend dashboard (Audiences → Blue Collar Techy → Broadcast).

### Welcome email (optional — next step)

Right now the signup is silent (no confirmation email). If you want a welcome email sent automatically, set up a Resend Broadcast triggered when a contact is added to the audience, or add a `sendEmail()` call to `/functions/api/subscribe.js` right after the audience add.

## One-time setup: GHL (optional)

1. GHL → Settings → Integrations → **Private Integrations** → create new token with scopes: `contacts.write`, `contacts.readonly`.
2. Copy the token into `GHL_API_KEY`.
3. GHL → Settings → Business Profile → copy your Location ID into `GHL_LOCATION_ID`.

Leads flow in with these tags:
- `bct-market-scan` + `bct-<industry>` — from the scan tool
- `bct-newsletter` — from the homepage newsletter signup

Set up a GHL workflow on either tag to automate follow-up.

Without GHL env vars set, the scan + newsletter still work (Resend captures newsletter subscribers regardless). The GHL mirror just lets you run sales follow-up from the same CRM as your other Tekton Growth contacts.

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
RESEND_AUDIENCE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Run locally:

```bash
wrangler pages dev .
```

Open `http://localhost:8788/market-scan/` and submit a real city + industry. The scan takes 60-90s and then renders the full report on the same page.

## Deploy

Cloudflare Pages auto-deploys on push to `main`. The first deploy after adding env vars needs to be re-triggered (env vars don't retroactively apply to old deploys). Either push an empty commit or click "Retry deployment" in CF dashboard.

## Monitoring

- **Cloudflare Pages → Functions** tab shows logs for `/api/scan` including any errors.
- **DataForSEO dashboard** shows real-time cost usage. Each scan costs ~$0.65–$0.80.
- **GHL** → Contacts → filter by tag `bct-market-scan` to see everyone who's run a scan.

## Cost estimate

| Item | Per-scan | Monthly (100 scans) |
|------|---------:|---------------------:|
| DataForSEO API | ~$0.70 | ~$70 |
| Cloudflare Pages | $0 | $0 (free tier handles this) |
| **Total** | **~$0.70** | **~$70** |

If this tool scales past ~1,000 scans/month, budget ~$700/mo in DFS costs. At that point it's driving serious lead flow and is worth the spend.

## Abuse protection

Current: honeypot field on the form + Cloudflare DDoS defaults.

If spam becomes a problem, add **Cloudflare Turnstile** (free captcha) to the form:
1. Turnstile dashboard → create widget → bind to `bluecollartechy.com`
2. Add the widget JS to `/market-scan/index.html`
3. Add server-side verification in `/functions/api/scan.js` before the honeypot check

Or add a rate limit via Cloudflare KV — count scans per IP per hour, reject after a threshold.

## Troubleshooting

**"The scan didn't complete"**
- Check CF Pages → Functions → Logs for the real error
- Most common: DFS timeout. The function has a 28s per-call timeout with 1 retry. If DFS is slow across all 10 categories, total time can hit the 30s function limit. Upgrade to CF Pages paid ($20/mo, 5-min limit) if this becomes frequent.

**Lead doesn't show in GHL**
- Check CF logs for `[ghl]` errors
- Most common: expired/revoked token, wrong location ID, or missing scopes
- The scan succeeds either way — GHL push is non-blocking

**Report looks empty or sparse**
- Almost always means the city is too small for reliable Google Ads data. The report will flag this automatically with a LOW confidence warning and suggest re-running with the nearest metro.
