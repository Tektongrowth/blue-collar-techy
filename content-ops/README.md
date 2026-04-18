# BCT Content Ops

Automated content pipeline for bluecollartechy.com.

## Files

- `content-calendar.json` — 13-post biweekly calendar (Apr 2026 → Oct 2026) + 6 resource spinoffs
- `mine_keywords.py` — DataForSEO keyword miner. Re-run quarterly to refresh candidates.
- `data/raw_keywords.json` — all 1,254 keywords returned
- `data/filtered_keywords.json` — 290 content candidates (volume ≥ 30, intent-tagged)

## Workflow

1. **Quarterly**: `python3 mine_keywords.py` to refresh keyword data
2. **Every 2 weeks**: `/bct-draft` skill picks the next slot, drafts, commits to `draft/<slug>` branch
3. **Nick reviews**: reads diff, runs Clawton pass, merges to main when ready
4. **Auto-deploy**: push to main triggers Cloudflare Pages build

## Calendar summary

| # | Date | Theme | Primary keyword | Vol |
|---|------|-------|-----------------|-----|
| 1 | 2026-04-30 | Reviews | how to get more google reviews | 590 |
| 2 | 2026-05-14 | Local SEO | how to rank higher on google maps | 260 |
| 3 | 2026-05-28 | Leads | best lead generation companies for contractors | 110 |
| 4 | 2026-06-11 | Ads | local service ads | 40,500 |
| 5 | 2026-06-25 | AI | best ai for small business | 210 |
| 6 | 2026-07-09 | Leads | how to get leads as a contractor | 40 |
| 7 | 2026-07-23 | Local SEO | free google business profile | 210 |
| 8 | 2026-08-06 | Website | best contractor websites | 140 |
| 9 | 2026-08-20 | Agency | best marketing for contractors | 110 |
| 10 | 2026-09-03 | Website | bad contractors website | 90 |
| 11 | 2026-09-17 | Local SEO | best seo for contractors | 50 |
| 12 | 2026-10-01 | Leads | free leads for contractors | 260 |
| 13 | 2026-10-15 | AI | ai for small business | 1,600 |

## Resources pipeline

6 lead-capture resources scheduled alongside relevant posts:
1. Review request template pack (after post 1)
2. Lead source tracker spreadsheet (after post 3)
3. LSA readiness checklist (after post 4)
4. Website audit checklist (after post 8)
5. SEO agency evaluation checklist (after post 11)
6. Contractor AI prompt pack (after post 13)
