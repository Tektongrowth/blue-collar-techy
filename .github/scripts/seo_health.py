#!/usr/bin/env python3
"""
Weekly SEO health monitor for bluecollartechy.com.

Pulls GSC sitemap status + URL Inspection on every canonical URL.
Compares against last week's snapshot. Pings Telegram with the diff.

Run as a GitHub Actions cron Mondays at 9am ET.
"""
import json
import os
import sys
import time
import re
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import date

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

REPO = Path(__file__).parents[2]
SITE = "https://bluecollartechy.com/"
SITEMAP_URL = "https://bluecollartechy.com/sitemap.xml"
STATE_FILE = REPO / ".seo-state.json"

GSC_SA_JSON = os.environ.get("GSC_SA_JSON", "")
TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "")


def gsc_client():
    info = json.loads(GSC_SA_JSON)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/webmasters.readonly"]
    )
    return build("searchconsole", "v1", credentials=creds)


def canonical_urls():
    """Read every page's canonical href so we audit exactly what's in the sitemap."""
    urls = []
    EXCLUDE_DIRS = {"node_modules", ".git", ".github", "functions", "content-ops"}
    SKIP = {"under-construction.html", "utm/index.html",
            "resources/crew-cheat-sheet/sheet.html",
            "resources/gbp-optimization-checklist/sheet.html"}
    for path in sorted(REPO.rglob("*.html")):
        parts = path.parts
        if any(p in EXCLUDE_DIRS for p in parts): continue
        rel = str(path.relative_to(REPO))
        if rel in SKIP: continue
        text = path.read_text(errors="ignore")
        if re.search(r'<meta[^>]+name=["\']robots["\'][^>]+content=["\'][^"\']*noindex', text, re.I):
            continue
        m = re.search(r'rel="canonical"\s+href="([^"]+)"', text)
        if m:
            urls.append(m.group(1))
    # Dedupe, preserve order
    seen = set(); uniq = []
    for u in urls:
        if u not in seen:
            seen.add(u); uniq.append(u)
    return uniq


def sitemap_status(sc):
    res = sc.sitemaps().list(siteUrl=SITE).execute()
    out = {"submitted": 0, "indexed": 0, "errors": 0, "warnings": 0}
    def num(v):
        try: return int(v)
        except: return 0
    for s in res.get('sitemap', []):
        out["errors"] += num(s.get('errors', 0))
        out["warnings"] += num(s.get('warnings', 0))
        for c in s.get('contents', []):
            out["submitted"] += num(c.get('submitted', 0))
            out["indexed"] += num(c.get('indexed', 0))
    return out


def inspect_urls(sc, urls):
    """Inspect every URL. Returns map of url → state."""
    results = {}
    for url in urls:
        try:
            r = sc.urlInspection().index().inspect(body={
                "inspectionUrl": url, "siteUrl": SITE,
            }).execute()
            idx = r.get('inspectionResult', {}).get('indexStatusResult', {})
            results[url] = {
                "verdict": idx.get('verdict', '?'),
                "coverage": idx.get('coverageState', '?'),
                "indexing": idx.get('indexingState', '?'),
                "last_crawl": idx.get('lastCrawlTime', 'never'),
            }
            time.sleep(1)  # rate limit gentle
        except HttpError as e:
            results[url] = {"verdict": "ERROR", "coverage": str(e.resp.status), "indexing": "?", "last_crawl": "?"}
    return results


def load_state():
    if STATE_FILE.exists():
        try: return json.loads(STATE_FILE.read_text())
        except: return {}
    return {}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2) + "\n")


def telegram(text):
    if not TG_TOKEN or not TG_CHAT:
        print("Telegram secrets missing — skipping ping")
        return
    url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
    body = urllib.parse.urlencode({"chat_id": TG_CHAT, "text": text}).encode()
    try:
        urllib.request.urlopen(url, body, timeout=10)
    except Exception as e:
        print(f"Telegram error: {e}")


def main():
    sc = gsc_client()
    sm = sitemap_status(sc)
    urls = canonical_urls()
    print(f"Sitemap: {sm['submitted']} submitted, {sm['indexed']} indexed")
    print(f"Inspecting {len(urls)} canonical URLs...")
    inspections = inspect_urls(sc, urls)

    # Bucket by verdict
    buckets = {"PASS": [], "NEUTRAL": [], "FAIL": [], "ERROR": []}
    for url, data in inspections.items():
        v = data['verdict'] if data['verdict'] in buckets else 'ERROR'
        buckets[v].append((url, data['coverage']))

    # Diff against last snapshot
    prev = load_state()
    prev_inspections = prev.get('inspections', {})
    regressions = []  # was PASS, now not
    new_pass = []     # was not PASS, now PASS
    for url, data in inspections.items():
        prev_v = prev_inspections.get(url, {}).get('verdict')
        if prev_v == "PASS" and data['verdict'] != "PASS":
            regressions.append((url, prev_v, data['verdict'], data['coverage']))
        elif prev_v and prev_v != "PASS" and data['verdict'] == "PASS":
            new_pass.append((url, data['coverage']))

    # Build Telegram message
    lines = []
    lines.append("📊 BCT SEO weekly")
    lines.append(f"")
    lines.append(f"Sitemap: {sm['submitted']} submitted / {sm['indexed']} indexed")
    if sm['errors'] or sm['warnings']:
        lines.append(f"⚠️ errors={sm['errors']} warnings={sm['warnings']}")
    lines.append(f"")
    lines.append(f"By verdict:")
    lines.append(f"  ✅ PASS: {len(buckets['PASS'])}")
    lines.append(f"  ⚪ NEUTRAL (not yet indexed): {len(buckets['NEUTRAL'])}")
    lines.append(f"  ❌ FAIL: {len(buckets['FAIL'])}")
    if buckets['ERROR']:
        lines.append(f"  🟡 inspection errors: {len(buckets['ERROR'])}")

    if new_pass:
        lines.append("")
        lines.append(f"🟢 newly indexed this week ({len(new_pass)}):")
        for url, cov in new_pass[:8]:
            lines.append(f"  + {url.replace('https://bluecollartechy.com', '')}")

    if regressions:
        lines.append("")
        lines.append(f"🚨 regressions ({len(regressions)}) — was indexed, now isn't:")
        for url, was, now, cov in regressions[:8]:
            short = url.replace('https://bluecollartechy.com', '')
            lines.append(f"  ! {short} — {cov}")

    # Always show what's not indexed yet so Nick can manually request again
    unindexed = [u for u, d in inspections.items() if d['verdict'] != 'PASS']
    if unindexed:
        lines.append("")
        lines.append(f"Pages not yet indexed ({len(unindexed)}) — request indexing in GSC:")
        for u in unindexed[:10]:
            lines.append(f"  • {u.replace('https://bluecollartechy.com', '')}")
        if len(unindexed) > 10:
            lines.append(f"  ... and {len(unindexed) - 10} more")

    msg = "\n".join(lines)
    print()
    print(msg)
    telegram(msg)

    # Save snapshot
    state = {
        "as_of": date.today().isoformat(),
        "sitemap": sm,
        "inspections": inspections,
    }
    save_state(state)
    print(f"\nState saved to {STATE_FILE}")


if __name__ == "__main__":
    main()
