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
| `DATAFORSEO_LOGIN` | `nick@tektongrowth.com` | existing account |
| `DATAFORSEO_PASSWORD` | `af230e7ad009b991` | existing account |

### Optional (lead capture into GHL)

| Name | Value | Purpose |
|------|-------|---------|
| `GHL_API_KEY` | v2 Private Integration Token | push scan submitters into GHL as contacts |
| `GHL_LOCATION_ID` | your location ID | required if using GHL |

That's it. No email service. The scan report renders inline on the page when the scan completes — users see their results instantly. If they want a copy, they hit **Save as PDF** (triggers the browser print dialog with a print-stylesheet we already ship).

## One-time setup: GHL (optional)

1. GHL → Settings → Integrations → **Private Integrations** → create new token with scopes: `contacts.write`, `contacts.readonly`.
2. Copy the token into `GHL_API_KEY`.
3. GHL → Settings → Business Profile → copy your Location ID into `GHL_LOCATION_ID`.

Leads flow in with tags `bct-market-scan` and `bct-<industry>`. Set up a GHL workflow on either tag to automate follow-up.

Without GHL env vars set, the scan still works — it just won't push a contact into GHL. The scan captures the submitter's name, email, city, and industry; losing it means you lose the lead, so GHL is strongly recommended for production.

## Testing locally

Requires `wrangler` (Cloudflare's CLI):

```bash
npm install -g wrangler
```

Create `.dev.vars` in the project root (gitignored):

```
DATAFORSEO_LOGIN=nick@tektongrowth.com
DATAFORSEO_PASSWORD=af230e7ad009b991
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
