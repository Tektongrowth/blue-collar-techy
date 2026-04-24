# BCT Content Ops

Automated content pipeline for bluecollartechy.com.

## Files

- `content-calendar.json` — 20-post 2x/week calendar (Apr 28 → Jul 2 2026)
- `ghl-walkthrough-series-plan.md` — companion video series plan (7 episodes)
- `mine_keywords.py` — DataForSEO keyword miner. Re-run quarterly to refresh candidates.
- `data/filtered_keywords.json` — 290 content candidates (volume ≥ 30, intent-tagged)

## Cadence (updated 2026-04-23)

- **Tuesday + Thursday** publishing (2 posts/week)
- Cron fires Sunday 6am (drafts Tuesday's post) and Tuesday 6am (drafts Thursday's post) — 48-hour lead time for review
- Topic sources: keyword data + ongoing Fathom call mining for pain points contractors actually raise

## Workflow

1. **Quarterly**: `python3 mine_keywords.py` to refresh keyword data
2. **Ongoing**: mine Fathom call transcripts for real contractor pain points; add to calendar
3. **Twice weekly**: cron runs `/bct-draft` which picks the next slot, drafts, commits to `draft/<slug>` branch, pushes CF preview URL + Telegram notification
4. **Nick reviews on mobile**: taps Approve & Ship in Telegram (one-tap merge) or sends revision request via Claude Code mobile
5. **Auto-deploy**: merge to main triggers production deploy + sitemap regen

## Calendar summary (current)

| # | Date | Title (working) |
|---|------|-----------------|
| 1 | 2026-04-18 | How to get more Google reviews as a contractor ✓ published |
| 2 | 2026-04-28 | GBP video verification walkthrough |
| 3 | 2026-04-30 | How to rank higher on Google Maps |
| 4 | 2026-05-05 | Map Pack vs Google Ads: where local clicks come from |
| 5 | 2026-05-07 | Service-area vs physical address GBP |
| 6 | 2026-05-12 | Move your GBP without losing rankings |
| 7 | 2026-05-14 | SEO isn't a lead engine |
| 8 | 2026-05-19 | Duplicate / closed Google listings cleanup |
| 9 | 2026-05-21 | Start SEO when you're busy, not slow |
| 10 | 2026-05-26 | Best lead gen companies for contractors |
| 11 | 2026-05-28 | The contractor pricing ceiling |
| 12 | 2026-06-02 | Local Service Ads pillar post |
| 13 | 2026-06-04 | Best AI tools for contractors |
| 14 | 2026-06-09 | How to get leads without Angi/HomeAdvisor |
| 15 | 2026-06-11 | The free Google Business Profile |
| 16 | 2026-06-16 | Best contractor websites |
| 17 | 2026-06-18 | Best marketing by trade |
| 18 | 2026-06-23 | Bad contractor websites |
| 19 | 2026-06-25 | Best SEO for contractors |
| 20 | 2026-06-30 | Free leads for contractors |
| 21 | 2026-07-02 | AI for small business contractors |

## Topic sources

1. **DataForSEO keyword mining** (quarterly refresh via `mine_keywords.py`)
2. **Fathom call mining** — pull Nick's client calls + Kyle 1:1s and extract pain points that surface repeatedly. Topics from the Apr 22-23 calls already seeded (GBP video verification, multi-location moves, service-area vs address, Map Pack vs Ads, duplicate listings cleanup, SEO-as-asset-build, pricing ceiling)

## Resources pipeline

1. GoHighLevel walkthrough video series (7 episodes — see `ghl-walkthrough-series-plan.md`)
2. Pricing audit calculator (tied to slot 11 — build as interactive tool)
3. LSA readiness checklist (tied to slot 12)
4. Contractor AI prompt pack (tied to slot 21)
