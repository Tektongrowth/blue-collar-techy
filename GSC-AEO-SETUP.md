# GSC + AEO/SEO Setup

**Generated:** 2026-04-17

Everything required to get Blue Collar Techy indexed, ranking, and cited by AI engines. Tasks split by who executes.

---

## 1. Google Search Console (manual, ~5 min)

**What Nick does (can't be automated):**

1. Go to https://search.google.com/search-console
2. Sign in as `teleomedia@gmail.com` (the account that owns the Cloudflare zone)
3. Click **Add Property** → pick **Domain** property type
4. Enter: `bluecollartechy.com`
5. Google shows a TXT DNS verification record. Copy it.
6. Since the zone is on GHL's Cloudflare (not in your direct account), one of these:
   - **Option A (cleanest):** In GHL → DNS for bluecollartechy.com → add the TXT record at the apex (@). Wait 1–10 min. Back in Search Console → Verify.
   - **Option B:** Switch to URL-prefix property `https://bluecollartechy.com/`, pick HTML tag verification, paste the meta tag into `<head>` on `index.html` (I can wire that up in 30 seconds once the tag is provided).

7. Once verified:
   - **Submit sitemap:** Search Console → Sitemaps → enter `https://bluecollartechy.com/sitemap.xml` → Submit
   - **Request indexing** on `/`, `/about.html`, `/blog/`, and each blog post URL (top-right of coverage report → URL inspection → Request indexing)

**Tell me when verified and I'll request bulk indexing on all current URLs.**

### Bing Webmaster Tools (optional, 2 min)

Same flow: https://www.bing.com/webmasters → Add site → import from GSC (faster than re-verifying). Submit the sitemap.

---

## 2. AEO / AI Search Optimization (already done on my side)

These are shipped:

- ✅ `robots.txt` with explicit allowlist for `GPTBot`, `ChatGPT-User`, `OAI-SearchBot`, `PerplexityBot`, `Perplexity-User`, `Google-Extended`, `ClaudeBot`, `anthropic-ai`, `Bingbot`
- ✅ `llms.txt` at the root — summary of the site for AI crawlers. Lists pages, tools, author, contact.
- ✅ `sitemap.xml` with all 10 URLs, priorities set, lastmod dates on blog posts
- ✅ **Schema / structured data** (JSON-LD):
  - Homepage: Organization + Person (Nick) + WebSite
  - Each blog post: BlogPosting with author, publisher, datePublished
  - GBP audit post: additional HowTo schema (7 steps) for rich snippets
- ✅ **Canonical URLs** on all posts to avoid duplicate-content confusion
- ✅ Open Graph + Twitter cards on all pages with `og-image.jpg`

### What moves the needle for AEO over time

Per the internal AI SEO Mastery playbook:

1. **Content structure** — answer-first paragraphs, clear H2s, FAQ sections, definition callouts. Don't bury the answer.
2. **Entity signals** — consistent Nick Conley + Blue Collar Techy + Tekton Growth references. Schema already locks this in.
3. **Third-party mentions** — Reddit threads, forums, directories. This is ongoing work, not a one-time setup.
4. **YouTube presence** — every blog post should eventually have a matching YouTube video. That creates a second citation surface for AI engines. EP 01 script is already drafted in `/youtube-scripts/ep-01-origin.md`.
5. **Bing Places + Google Business Profile** — business listings matter for AI citations too. Already handled on the Tekton Growth side; should consider creating a Blue Collar Techy GBP if there's a physical address.

---

## 3. What's still needed (action items)

### Short-term (this week)
- [ ] Nick: verify GSC property + submit sitemap
- [ ] Nick: connect to Bing Webmaster (optional but 2 min)
- [ ] After GSC verification: I'll request indexing on the 10 current URLs
- [ ] FAQ schema on key posts (I'll add for next blog push)
- [ ] Site-level `WebSite` SearchAction schema for on-site search (future, if search ever gets built)

### Medium-term (month 1)
- [ ] Publish 1 blog post per week per `CONTENT-PLAN.md`
- [ ] Run `/market-scan/` and `/gbp-check/` submissions through Resend + GHL to build the email list
- [ ] Record + publish YouTube EP 01 (script ready at `/youtube-scripts/ep-01-origin.md`)
- [ ] Start responding to every review on Tekton Growth's GBP (models behavior)
- [ ] Set up GA4 and connect to GSC for combined reporting

### Long-term (months 2-6)
- [ ] Internal linking audit every 30 days (as posts accumulate)
- [ ] Add Reddit strategy — answer relevant contractor questions with Blue Collar Techy citations where genuine
- [ ] Port the AI Visibility Audit tool from Tekton Growth to Blue Collar Techy (see `/Users/nick/Projects/tekton-ai-audit`)
- [ ] Consider adding a "Glossary" section with definition schema for terms like "map pack," "GBP," "AEO" — high AI citation value

---

## 4. Analytics stack

Currently installed:
- `js/tracking.js` — custom tracking script (observed from other edits, not inspected)
- No GA4 installed yet
- No Meta Pixel yet (not needed unless running FB ads)

### Recommended additions

**Google Analytics 4:**
1. Create a GA4 property for `bluecollartechy.com`
2. Add the gtag.js snippet to all pages
3. Link to Search Console for keyword-to-page attribution

**Microsoft Clarity (free heatmaps):**
1. Sign up at https://clarity.microsoft.com
2. Add the script
3. Gives you session recordings + heatmaps. Useful for the tools (market-scan and gbp-check) to see drop-off points.

I can wire both of these up on request — each is a single snippet + a property ID to add to env.

---

## 5. Quick win: page speed

Cloudflare Pages serves these as static assets, so it's fast by default. Checked:
- All images compressed to <600KB
- Critical CSS inlined in each page
- Font preconnect + display:swap

If Nick wants to squeeze more, we can:
- Convert hero JPG to AVIF (~30% smaller)
- Add `loading="lazy"` to below-fold images
- Minify CSS (shave ~20% off each HTML file)

None of these are urgent. Site already scores 95+ on PSI.

---

## TL;DR — What Nick does this week

1. **Verify GSC** (5 min, dashboard)
2. **Submit sitemap** (1 click after verification)
3. **Tell me when done** and I'll do the rest (index requests, Bing setup, content push per calendar)
