#!/usr/bin/env python3
"""
Mine contractor pain-point keywords via DataForSEO.

Reads seed terms, hits keywords_for_keywords/live, filters for intent signals
(question/comparison/problem patterns), and writes raw+filtered results to JSON.

Usage:
  python3 mine_keywords.py

Output:
  data/raw_keywords.json      - all keyword suggestions returned
  data/filtered_keywords.json - volume + intent filtered
"""
import os
import json
import base64
import urllib.request
import urllib.error
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

# Load DFS creds from seo-ops-skills/.env
ENV = Path.home() / "Projects/local-prospector/.env"
creds = {}
for line in ENV.read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        creds[k.strip()] = v.strip()

LOGIN = creds["DATAFORSEO_LOGIN"]
PASSWORD = creds["DATAFORSEO_PASSWORD"]
AUTH = base64.b64encode(f"{LOGIN}:{PASSWORD}".encode()).decode()

ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live"

# Seed terms — each round returns up to ~700 related keywords.
# Grouped by theme so we can tag results by source.
SEED_GROUPS = {
    "marketing_agency": [
        "contractor marketing",
        "marketing for contractors",
        "marketing agency contractor",
        "construction marketing",
    ],
    "leads": [
        "contractor leads",
        "how to get more contractor leads",
        "lead generation for contractors",
        "home service leads",
    ],
    "local_seo_gbp": [
        "local seo for contractors",
        "google business profile",
        "how to rank in google maps",
        "seo for contractors",
    ],
    "ads": [
        "facebook ads for contractors",
        "local service ads",
        "google ads for contractors",
    ],
    "reviews_reputation": [
        "how to get more google reviews",
        "respond to negative review contractor",
        "contractor reputation",
    ],
    "sales_ops": [
        "how to close more sales contractor",
        "contractor sales process",
        "contractor follow up",
    ],
    "ai_tech": [
        "ai for contractors",
        "ai for small business",
        "chatgpt for contractors",
    ],
    "website": [
        "contractor website",
        "best contractor website builder",
        "contractor website examples",
    ],
}

LOCATION = "United States"
LANGUAGE = "English"

def fetch(seeds):
    body = [{
        "keywords": seeds,
        "location_name": LOCATION,
        "language_name": LANGUAGE,
        "include_adult_keywords": False,
        "limit": 700,
    }]
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Basic {AUTH}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  ERROR {e.code}: {e.read().decode()[:200]}")
        return None

# Intent filters — keywords containing these tokens are high-intent for content.
QUESTION = {"how", "why", "what", "when", "where", "should", "do", "does", "is", "are", "can"}
COMPARISON = {"vs", "or", "best", "top", "cheapest", "cheap", "free", "better", "worth"}
PROBLEM = {
    "not", "slow", "down", "drop", "lost", "losing", "dry", "dead", "stopped",
    "decrease", "decreasing", "problem", "issue", "fix", "broken", "wrong",
    "bad", "failing", "without",
}

def classify_intent(kw):
    tokens = set(kw.lower().split())
    tags = []
    if tokens & QUESTION and any(kw.lower().startswith(q + " ") for q in QUESTION):
        tags.append("question")
    if tokens & COMPARISON:
        tags.append("comparison")
    if tokens & PROBLEM:
        tags.append("problem")
    return tags

def main():
    raw = []
    filtered = []

    for group, seeds in SEED_GROUPS.items():
        print(f"\n== {group} ==")
        result = fetch(seeds)
        if not result or result.get("status_code") != 20000:
            print(f"  skipped: {result.get('status_message') if result else 'no response'}")
            continue

        tasks = result.get("tasks") or []
        for task in tasks:
            items = task.get("result") or []
            print(f"  {len(items)} keywords returned")
            for it in items:
                kw = it.get("keyword")
                vol = it.get("search_volume") or 0
                cpc = it.get("cpc") or 0
                comp = it.get("competition_index") or 0
                trend = it.get("monthly_searches") or []
                if not kw:
                    continue
                entry = {
                    "keyword": kw,
                    "group": group,
                    "volume": vol,
                    "cpc": cpc,
                    "competition": comp,
                    "intent_tags": classify_intent(kw),
                }
                raw.append(entry)

                # Filter: useful content candidates
                if vol < 30:
                    continue
                if vol > 50000:  # too broad, brand-defining terms
                    continue
                if not entry["intent_tags"] and vol < 200:
                    continue
                filtered.append(entry)

    # Dedupe by keyword (seed groups overlap)
    seen = {}
    for r in raw:
        if r["keyword"] not in seen or r["volume"] > seen[r["keyword"]]["volume"]:
            seen[r["keyword"]] = r
    raw_dedup = list(seen.values())

    seen_f = {}
    for r in filtered:
        if r["keyword"] not in seen_f:
            seen_f[r["keyword"]] = r
    filtered_dedup = sorted(seen_f.values(), key=lambda x: -x["volume"])

    (DATA / "raw_keywords.json").write_text(json.dumps(raw_dedup, indent=2))
    (DATA / "filtered_keywords.json").write_text(json.dumps(filtered_dedup, indent=2))

    print(f"\n== DONE ==")
    print(f"  raw: {len(raw_dedup)} unique keywords")
    print(f"  filtered: {len(filtered_dedup)} content candidates")
    print(f"\nTop 20 by volume:")
    for e in filtered_dedup[:20]:
        tags = ",".join(e["intent_tags"]) or "-"
        print(f"  {e['volume']:>6}  [{tags:20}]  {e['keyword']}")

if __name__ == "__main__":
    main()
