/**
 * /api/scan — Blue Collar Techy Market Demand Scanner
 *
 * POST { name, email, city, industry, website }
 *   ↓
 * 1. Validate + honeypot check
 * 2. DataForSEO keywords_for_keywords (24 months) for every category in parallel
 * 3. Apply commercial-intent filter
 * 4. Calculate YoY trends + confidence
 * 5. Render HTML report
 * 6. Send via Resend
 * 7. Push lead to GHL (optional)
 * 8. Return { ok, verdict }
 *
 * Required env vars (CF Pages settings):
 *   DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, RESEND_API_KEY, RESEND_FROM_EMAIL
 * Optional:
 *   GHL_API_KEY, GHL_LOCATION_ID, SCAN_NOTIFY_EMAIL (BCC on every report)
 */

const DFS_ENDPOINT = 'https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live';

// ============================================================================
// SEED DATA (inlined from seo-ops-skills/scripts/seeds/)
// ============================================================================

const SEEDS = {
  construction: {
    industry: 'construction',
    description: 'Residential construction, home improvement, outdoor living',
    categories: {
      roofing_exterior: ['roofing','roof replacement','roof repair','metal roofing','siding installation','vinyl siding','gutters','gutter guards','soffit and fascia'],
      windows_doors: ['window replacement','window installation','door installation','entry door replacement','garage door installation','garage door repair'],
      structures: ['pole barns','pole barn builders','metal buildings','barndominium builders','garage builders','home additions','room additions','sheds','sunrooms','screened in porch'],
      outdoor_living: ['deck builders','deck installation','pergola builders','patio installation','paver patios','outdoor kitchens','fire pit installation','covered patio builders'],
      hardscape: ['retaining walls','retaining wall installation','pavers','paver driveway','stamped concrete','concrete patio','concrete contractors','concrete driveway'],
      landscape: ['landscaping','landscape design','lawn care','sod installation','landscape lighting','tree service','tree removal','stump removal','mulch delivery'],
      site_work: ['excavation contractors','grading contractors','land clearing','drainage contractors','french drain installation','septic system installation','foundation repair','driveway installation','gravel driveway'],
      fencing: ['fence installation','vinyl fence','wood fence','chain link fence','privacy fence','aluminum fence'],
      interior_remodel: ['kitchen remodel','bathroom remodel','basement finishing','flooring installation','hardwood floor installation','tile installation','interior painting','exterior painting'],
      specialty: ['pool installation','inground pool installation','hot tub installation','solar panel installation','ev charger installation'],
    },
  },
  home_services: {
    industry: 'home_services',
    description: 'Home service trades — HVAC, plumbing, electrical, pest, cleaning, restoration',
    categories: {
      hvac: ['hvac repair','hvac installation','ac repair','air conditioner replacement','furnace repair','furnace installation','heat pump installation','ductless mini split','duct cleaning'],
      plumbing: ['plumber','plumbing repair','water heater replacement','tankless water heater installation','drain cleaning','leak detection','sewer line repair','emergency plumber','sump pump installation'],
      electrical: ['electrician','electrical repair','panel upgrade','generator installation','ev charger installation','electrical rewiring','ceiling fan installation'],
      pest_control: ['pest control','termite treatment','mosquito control','rodent control','bed bug treatment','wildlife removal'],
      cleaning: ['house cleaning','carpet cleaning','pressure washing','window cleaning','gutter cleaning','dryer vent cleaning','soft washing','roof cleaning'],
      water: ['water softener installation','well pump repair','water filtration system','water damage restoration'],
      restoration: ['mold remediation','fire damage restoration','crawl space encapsulation','basement waterproofing','foundation waterproofing'],
      garage_and_doors: ['garage door repair','garage door opener installation','garage door spring repair'],
      handyman: ['handyman services','home repair','drywall repair','deck repair'],
    },
  },
  masonry: {
    industry: 'masonry',
    description: 'Masonry, hardscape, and stonework — stone, brick, block, and concrete construction plus restoration',
    categories: {
      stone_masonry: ['stone masonry','stone mason','stone masons','stonework','natural stone work','dry stack stone walls','fieldstone wall','stone veneer','stone veneer installation','granite stonework'],
      brick_masonry: ['brick masonry','brick mason','brick masons','brick repair','tuck pointing','repointing brick','brick restoration','brick wall repair','brick pointing'],
      chimneys_fireplaces: ['chimney repair','chimney rebuilding','chimney masonry','chimney restoration','stone chimney repair','brick chimney repair','fireplace repair','outdoor fireplace installation','stone fireplace installation','chimney crown repair'],
      retaining_walls: ['retaining walls','retaining wall installation','stone retaining wall','boulder retaining wall','segmental retaining wall','concrete retaining wall','block retaining wall','natural stone retaining wall'],
      patios_walkways: ['paver patio','stone patio','flagstone patio','bluestone patio','stone walkway','paver walkway','stone steps','granite steps','flagstone walkway'],
      driveways: ['paver driveway','stamped concrete driveway','cobblestone driveway','stone driveway apron','concrete driveway'],
      concrete_block_foundation: ['concrete block wall','cinder block wall','block wall installation','poured concrete walls','foundation masonry','stone foundation repair','foundation crack repair','masonry foundation'],
      outdoor_living_stone: ['outdoor kitchen','outdoor fireplace','stone fire pit','masonry fire pit','pizza oven installation','stone columns','stone pillars','stone mailbox','stone entry pillars'],
      restoration: ['historic masonry restoration','stone wall restoration','old chimney repair','historic stonework','granite restoration','stone building restoration','masonry restoration'],
    },
  },
};

const FILTERS = {
  brand_blocklist: [
    'siteone','site one','abc supply','abcsupply','home depot','homedepot','lowes',"lowe's",'menards','ferguson','grainger','hd supply',
    'trugreen','tru green','tru lawn','trulawn','lawn doctor',
    'renewal by andersen','renewalbyandersen','andersen windows','pella','marvin windows','therma-tru','thermatru',
    'james hardie','hardie board','hardieboard','certainteed','owens corning','gaf roofing',
    'toughshed','tuff shed','tuffshed','suncast','rubbermaid shed',
    'olmsted','fred olmsted','frederick olmsted','service berry','serviceberry',
    'pea gravel','peagravel','p gravel','bagster','wayfair','amazon','walmart','costco','tractor supply',
  ],
  service_intent_terms: [
    'near me','contractor','contractors','company','companies','install','installation','installed','installer','installers','installing',
    'repair','repairs','repairing','replace','replacement','service','services','builder','builders','build me',
    'cost','price','pricing','prices','estimate','quote','removal','remove','demo','demolition','hire','free estimate',
  ],
};

const STATE_ABBREV = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

// ============================================================================
// UTILITIES
// ============================================================================

function normalizeLocation(loc) {
  const raw = (loc || '').trim();
  if (!raw) return '';
  if (/united states/i.test(raw)) return raw;
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    const token = parts[0].toUpperCase();
    if (STATE_ABBREV[token]) return `${STATE_ABBREV[token]},United States`;
    return `${parts[0]},United States`;
  }
  if (parts.length === 2) {
    const [city, state] = parts;
    const stateFull = STATE_ABBREV[state.toUpperCase()] || state;
    return `${city},${stateFull},United States`;
  }
  return raw;
}

function dateRangeMonthsBack(months) {
  const today = new Date();
  let endYear = today.getUTCFullYear();
  let endMonth = today.getUTCMonth(); // 0-indexed, last complete month
  if (endMonth === 0) { endYear -= 1; endMonth = 12; }
  const back = months - 1;
  let sy = endYear;
  let sm = endMonth - back;
  while (sm <= 0) { sm += 12; sy -= 1; }
  const fromStr = `${sy}-${String(sm).padStart(2, '0')}-01`;
  const toStr = `${endYear}-${String(endMonth).padStart(2, '0')}-28`;
  return { date_from: fromStr, date_to: toStr };
}

function sortedMonths(ms) {
  return (ms || [])
    .filter(m => m && m.search_volume != null)
    .sort((a, b) => (a.year - b.year) || (a.month - b.month));
}

function calcSeasonalSlope(ms) {
  const s = sortedMonths(ms);
  if (s.length < 6) return 0;
  const first = s.slice(0, 3).reduce((a, b) => a + b.search_volume, 0) / 3;
  const last = s.slice(-3).reduce((a, b) => a + b.search_volume, 0) / 3;
  if (first === 0) return last > 0 ? 100 : 0;
  return Math.round(((last - first) / first) * 1000) / 10;
}

function calcYoyTrend(ms) {
  const s = sortedMonths(ms);
  if (s.length >= 15) {
    const recent = s.slice(-3);
    const recentYears = new Set(recent.map(m => m.year));
    const recentMonths = new Set(recent.map(m => m.month));
    const priorYearSet = new Set([...recentYears].map(y => y - 1));
    const prior = s.filter(m => recentMonths.has(m.month) && priorYearSet.has(m.year));
    if (prior.length === 3) {
      const rAvg = recent.reduce((a, b) => a + b.search_volume, 0) / 3;
      const pAvg = prior.reduce((a, b) => a + b.search_volume, 0) / 3;
      if (pAvg === 0) return { pct: rAvg > 0 ? 100 : 0, method: 'yoy' };
      return { pct: Math.round(((rAvg - pAvg) / pAvg) * 1000) / 10, method: 'yoy' };
    }
  }
  return { pct: calcSeasonalSlope(ms), method: 'seasonal' };
}

function matchParent(keyword, seeds) {
  const kw = (keyword || '').toLowerCase();
  let best = '';
  let bestLen = 0;
  for (const s of seeds) {
    const sl = s.toLowerCase();
    if (kw.includes(sl) && sl.length > bestLen) {
      best = s;
      bestLen = sl.length;
    }
  }
  return best;
}

function isCommercial(keyword, parentSeed, allSeeds, cityToken) {
  const kw = (keyword || '').toLowerCase();
  if (!kw) return false;
  for (const b of FILTERS.brand_blocklist) {
    if (b && kw.includes(b.toLowerCase())) return false;
  }
  for (const t of FILTERS.service_intent_terms) {
    if (t && kw.includes(t.toLowerCase())) return true;
  }
  if (cityToken && kw.includes(cityToken.toLowerCase())) return true;
  if (parentSeed) {
    const ps = parentSeed.toLowerCase();
    if (kw.includes(ps) || ps.includes(kw)) return true;
  }
  for (const s of allSeeds) {
    const sl = s.toLowerCase();
    if (!sl) continue;
    if (kw === sl || kw.includes(sl)) return true;
  }
  return false;
}

function assessConfidence(commercialRows, totalVolume, yoyPct) {
  const reasons = [];
  if (totalVolume < 10000) {
    reasons.push(`total commercial volume is ${totalVolume.toLocaleString()}/mo — below the 10,000/mo threshold where Google Ads Keyword Planner data becomes reliable`);
  }
  if (yoyPct < 25) {
    reasons.push(`only ${Math.round(yoyPct)}% of keywords have year-over-year data (need ≥25% for trend claims to hold up)`);
  }
  const withVol = commercialRows.filter(r => r.search_volume > 0);
  if (withVol.length > 0) {
    const topVol = Math.max(...withVol.map(r => r.search_volume));
    if (topVol <= 10) {
      reasons.push(`highest-volume commercial keyword is only ${topVol} searches/mo — the entire ranking is below the noise floor`);
    }
  }
  let level;
  if (totalVolume >= 30000 && yoyPct >= 50 && reasons.length === 0) level = 'HIGH';
  else if (totalVolume < 10000 || reasons.length >= 2) level = 'LOW';
  else if (reasons.length) level = 'MEDIUM';
  else level = 'MEDIUM';
  return { level, reasons };
}

// ============================================================================
// DATAFORSEO CLIENT
// ============================================================================

async function dfsPostOnce(payload, login, password, timeoutMs = 28000) {
  const auth = btoa(`${login}:${password}`);
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(DFS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DFS HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

async function dfsPost(payload, login, password, maxAttempts = 2) {
  let lastErr;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await dfsPostOnce(payload, login, password);
    } catch (e) {
      lastErr = e;
      if (i < maxAttempts) await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
  throw lastErr;
}

async function fetchCategoryKeywords(category, seeds, locationName, dateFrom, dateTo, login, password) {
  const batches = [];
  for (let i = 0; i < seeds.length; i += 20) batches.push(seeds.slice(i, i + 20));
  const rows = [];
  let cost = 0;
  for (const batch of batches) {
    const payload = [{
      keywords: batch,
      location_name: locationName,
      language_name: 'English',
      sort_by: 'search_volume',
      include_seed_keyword: true,
      date_from: dateFrom,
      date_to: dateTo,
    }];
    try {
      const resp = await dfsPost(payload, login, password);
      cost += parseFloat(resp.cost || 0);
      for (const task of resp.tasks || []) {
        for (const r of task.result || []) {
          const kw = r.keyword || '';
          const vol = parseInt(r.search_volume || 0, 10) || 0;
          const ms = r.monthly_searches || [];
          const { pct, method } = calcYoyTrend(ms);
          rows.push({
            keyword: kw,
            category,
            parent_seed: matchParent(kw, batch),
            search_volume: vol,
            competition: r.competition || '',
            cpc: Math.round((parseFloat(r.cpc || 0)) * 100) / 100,
            trend_pct: pct,
            trend_method: method,
            months_returned: ms.length,
          });
        }
      }
    } catch (e) {
      // continue; a single category failure shouldn't kill the whole scan
      console.error(`[scan] category ${category} batch failed:`, e.message);
    }
  }
  return { rows, cost };
}

async function fetchAllKeywords(seedsDoc, locationName, login, password) {
  const { date_from, date_to } = dateRangeMonthsBack(24);
  const cats = Object.entries(seedsDoc.categories).filter(([, s]) => s && s.length);
  const results = await Promise.allSettled(
    cats.map(([cat, seeds]) => fetchCategoryKeywords(cat, seeds, locationName, date_from, date_to, login, password))
  );
  let allRows = [];
  let totalCost = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allRows = allRows.concat(r.value.rows);
      totalCost += r.value.cost;
    }
  }
  // dedupe by keyword, keep highest volume
  const dedup = new Map();
  for (const row of allRows) {
    const k = row.keyword.toLowerCase();
    const existing = dedup.get(k);
    if (!existing || row.search_volume > existing.search_volume) dedup.set(k, row);
  }
  return { rows: [...dedup.values()], cost: totalCost, date_from, date_to };
}

// ============================================================================
// ANALYSIS
// ============================================================================

function annotateAndSummarize(rows, seedsDoc, locationName) {
  const cityToken = locationName.split(',')[0].trim();
  const allSeeds = Object.values(seedsDoc.categories).flat();
  for (const r of rows) {
    r.commercial = isCommercial(r.keyword, r.parent_seed, allSeeds, cityToken);
  }
  const commercial = rows.filter(r => r.commercial);
  const totalVolume = commercial.reduce((a, b) => a + b.search_volume, 0);
  const yoyCount = commercial.filter(r => r.trend_method === 'yoy').length;
  const yoyPct = commercial.length ? (100 * yoyCount / commercial.length) : 0;

  // category rollups
  const byCat = new Map();
  for (const r of commercial) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category).push(r);
  }
  const catStats = [];
  for (const [cat, kws] of byCat.entries()) {
    const totalVol = kws.reduce((a, b) => a + b.search_volume, 0);
    const wTrend = totalVol > 0
      ? kws.reduce((a, b) => a + b.trend_pct * b.search_volume, 0) / totalVol
      : 0;
    const topKw = kws.slice().sort((a, b) => b.search_volume - a.search_volume)[0];
    catStats.push({
      category: cat,
      total_volume: totalVol,
      share_pct: totalVolume > 0 ? Math.round(1000 * totalVol / totalVolume) / 10 : 0,
      weighted_trend: Math.round(wTrend * 10) / 10,
      keyword_count: kws.length,
      top_keyword: topKw ? topKw.keyword : '',
    });
  }
  catStats.sort((a, b) => b.total_volume - a.total_volume);

  const topKws = commercial.slice().sort((a, b) => b.search_volume - a.search_volume).slice(0, 20);
  const rising = commercial
    .filter(r => r.trend_pct >= 25 && r.search_volume >= 50)
    .sort((a, b) => b.search_volume - a.search_volume)
    .slice(0, 15);
  const declining = commercial
    .filter(r => r.trend_pct <= -25 && r.search_volume >= 50)
    .sort((a, b) => b.search_volume - a.search_volume)
    .slice(0, 15);

  const confidence = assessConfidence(commercial, totalVolume, yoyPct);

  // Generate plain-English verdict
  const verdict = buildVerdict(catStats, confidence, rising, declining);

  return {
    commercial, totalVolume, yoyPct, catStats, topKws, rising, declining, confidence, verdict,
  };
}

function buildVerdict(catStats, confidence, rising, declining) {
  if (confidence.level === 'LOW') {
    return 'Low-confidence scan. Re-run using the nearest metro area for reliable data.';
  }
  const upCats = catStats.filter(c => c.weighted_trend > 3);
  const downCats = catStats.filter(c => c.weighted_trend < -3);
  if (downCats.length === 0 && upCats.length >= catStats.length / 2) {
    return `Your market looks healthy. ${upCats.length} of ${catStats.length} categories are up year over year. If business feels slow, look at your marketing/operations before blaming demand.`;
  }
  if (upCats.length === 0) {
    return `Your market is genuinely softening. ${downCats.length} of ${catStats.length} categories are down year over year. Consider pivoting toward the least-down category or adjacent verticals.`;
  }
  return `Mixed market. ${upCats.length} categories up, ${downCats.length} down. Check whether your specific service mix falls into the rising or declining group.`;
}

// ============================================================================
// HTML REPORT (for email body)
// ============================================================================

function reportHtml(data, seedsDoc, locationName, submitterName) {
  const { catStats, topKws, rising, declining, confidence, totalVolume, yoyPct, verdict } = data;
  const trendLabel = yoyPct >= 50 ? 'YoY' : 'Blended';
  const confColor = confidence.level === 'HIGH' ? '#4ade80' : confidence.level === 'MEDIUM' ? '#fbbf24' : '#f87171';

  const catRows = catStats.map(c => {
    const icon = c.weighted_trend > 10 ? '↑' : (c.weighted_trend < -10 ? '↓' : '→');
    const sign = c.weighted_trend >= 0 ? '+' : '';
    return `<tr>
      <td style="padding:12px 14px;border-bottom:1px solid #272733;">${c.category}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #272733;text-align:right;">${c.total_volume.toLocaleString()}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #272733;text-align:right;">${c.share_pct}%</td>
      <td style="padding:12px 14px;border-bottom:1px solid #272733;text-align:right;color:${c.weighted_trend > 5 ? '#4ade80' : c.weighted_trend < -5 ? '#f87171' : '#f5f5f7'};font-weight:600;">${icon} ${sign}${c.weighted_trend.toFixed(1)}%</td>
      <td style="padding:12px 14px;border-bottom:1px solid #272733;color:#a0a0ab;font-size:14px;">${c.top_keyword}</td>
    </tr>`;
  }).join('');

  const topRows = topKws.map(r => `<tr>
    <td style="padding:10px 14px;border-bottom:1px solid #272733;">${escapeHtml(r.keyword)}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #272733;color:#a0a0ab;">${r.category}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #272733;text-align:right;">${r.search_volume.toLocaleString()}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #272733;text-align:right;color:${r.trend_pct > 5 ? '#4ade80' : r.trend_pct < -5 ? '#f87171' : '#f5f5f7'};">${r.trend_pct >= 0 ? '+' : ''}${r.trend_pct.toFixed(1)}%</td>
  </tr>`).join('');

  const risingRows = rising.length ? rising.map(r => `<tr>
    <td style="padding:8px 14px;border-bottom:1px solid #272733;">${escapeHtml(r.keyword)}</td>
    <td style="padding:8px 14px;border-bottom:1px solid #272733;color:#a0a0ab;">${r.category}</td>
    <td style="padding:8px 14px;border-bottom:1px solid #272733;text-align:right;">${r.search_volume}</td>
    <td style="padding:8px 14px;border-bottom:1px solid #272733;text-align:right;color:#4ade80;font-weight:600;">+${r.trend_pct.toFixed(1)}%</td>
  </tr>`).join('') : `<tr><td colspan="4" style="padding:16px;color:#a0a0ab;font-style:italic;">None above the ≥50 volume, +25% trend threshold.</td></tr>`;

  const decliningRows = declining.length ? declining.map(r => `<tr>
    <td style="padding:8px 14px;border-bottom:1px solid #272733;">${escapeHtml(r.keyword)}</td>
    <td style="padding:8px 14px;border-bottom:1px solid #272733;color:#a0a0ab;">${r.category}</td>
    <td style="padding:8px 14px;border-bottom:1px solid #272733;text-align:right;">${r.search_volume}</td>
    <td style="padding:8px 14px;border-bottom:1px solid #272733;text-align:right;color:#f87171;font-weight:600;">${r.trend_pct.toFixed(1)}%</td>
  </tr>`).join('') : `<tr><td colspan="4" style="padding:16px;color:#a0a0ab;font-style:italic;">None below the ≥50 volume, −25% trend threshold.</td></tr>`;

  const reasonsBlock = confidence.reasons.length
    ? `<ul style="margin:12px 0 0;padding-left:20px;color:#a0a0ab;font-size:14px;">${confidence.reasons.map(r => `<li style="margin-bottom:6px;">${escapeHtml(r)}</li>`).join('')}</ul>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Your Market Scan — ${escapeHtml(locationName)}</title></head>
<body style="margin:0;padding:0;background:#0d0d12;color:#f5f5f7;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d12;">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;">

      <tr><td style="padding-bottom:32px;">
        <div style="font-family:'Courier New',monospace;font-size:11px;color:#ff6a1a;letter-spacing:0.25em;text-transform:uppercase;">▸ Blue Collar Techy · Market Scan</div>
      </td></tr>

      <tr><td style="padding-bottom:24px;">
        <h1 style="margin:0;font-family:Arial Black,Arial,sans-serif;font-size:32px;line-height:1.05;color:#f5f5f7;">Your market scan for <span style="color:#ff6a1a;">${escapeHtml(locationName)}</span>.</h1>
      </td></tr>

      <tr><td style="padding-bottom:28px;">
        <p style="margin:0;font-size:17px;color:#a0a0ab;">Hey ${escapeHtml(submitterName)}, here's your report. Industry: <strong style="color:#f5f5f7;">${escapeHtml(seedsDoc.description)}</strong>. Data source: Google Ads Keyword Planner via DataForSEO. Trend window: 24 months, year-over-year comparison.</p>
      </td></tr>

      <tr><td style="padding:24px;background:#1a1a24;border:1px solid #272733;border-left:4px solid #ff6a1a;margin-bottom:24px;">
        <div style="font-family:'Courier New',monospace;font-size:11px;color:#ff6a1a;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:10px;">The Quick Read</div>
        <p style="margin:0;font-size:18px;color:#f5f5f7;line-height:1.5;">${escapeHtml(verdict)}</p>
      </td></tr>

      <tr><td style="height:24px;"></td></tr>

      <tr><td>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#15151d;border:1px solid #272733;">
          <tr><td style="padding:20px 24px;border-bottom:1px solid #272733;">
            <div style="font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:4px;">Confidence</div>
            <div style="font-family:Arial Black,Arial,sans-serif;font-size:22px;color:${confColor};">${confidence.level}</div>
            ${reasonsBlock}
          </td></tr>
          <tr><td style="padding:20px 24px;">
            <table width="100%"><tr>
              <td style="width:33%;padding-right:16px;">
                <div style="font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:4px;">Commercial Vol</div>
                <div style="font-family:Arial Black,Arial,sans-serif;font-size:20px;color:#f5f5f7;">${totalVolume.toLocaleString()}<span style="font-size:13px;color:#a0a0ab;font-weight:400;"> /mo</span></div>
              </td>
              <td style="width:33%;padding:0 16px;">
                <div style="font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:4px;">YoY Coverage</div>
                <div style="font-family:Arial Black,Arial,sans-serif;font-size:20px;color:#f5f5f7;">${Math.round(yoyPct)}%</div>
              </td>
              <td style="width:33%;padding-left:16px;">
                <div style="font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:4px;">Categories</div>
                <div style="font-family:Arial Black,Arial,sans-serif;font-size:20px;color:#f5f5f7;">${catStats.length}</div>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="height:40px;"></td></tr>

      <tr><td>
        <h2 style="margin:0 0 16px;font-family:Arial Black,Arial,sans-serif;font-size:22px;color:#f5f5f7;">Category Demand</h2>
        <p style="margin:0 0 16px;color:#a0a0ab;font-size:14px;">Ranked by commercial-intent search volume in your market. Weighted trend is volume-weighted year-over-year where data allows.</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#15151d;border:1px solid #272733;font-size:14px;">
          <thead>
            <tr style="background:#1a1a24;">
              <th style="padding:12px 14px;text-align:left;font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;">Category</th>
              <th style="padding:12px 14px;text-align:right;font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;">Vol/mo</th>
              <th style="padding:12px 14px;text-align:right;font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;">Share</th>
              <th style="padding:12px 14px;text-align:right;font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;">${trendLabel} Trend</th>
              <th style="padding:12px 14px;text-align:left;font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;">Top Keyword</th>
            </tr>
          </thead>
          <tbody>${catRows}</tbody>
        </table>
      </td></tr>

      <tr><td style="height:40px;"></td></tr>

      <tr><td>
        <h2 style="margin:0 0 16px;font-family:Arial Black,Arial,sans-serif;font-size:22px;color:#f5f5f7;">Top 20 Commercial Keywords</h2>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#15151d;border:1px solid #272733;font-size:14px;">
          <thead><tr style="background:#1a1a24;">
            <th style="padding:12px 14px;text-align:left;font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;">Keyword</th>
            <th style="padding:12px 14px;text-align:left;font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;">Category</th>
            <th style="padding:12px 14px;text-align:right;font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;">Vol</th>
            <th style="padding:12px 14px;text-align:right;font-family:'Courier New',monospace;font-size:10px;color:#a0a0ab;letter-spacing:0.2em;text-transform:uppercase;">Trend</th>
          </tr></thead>
          <tbody>${topRows}</tbody>
        </table>
      </td></tr>

      <tr><td style="height:40px;"></td></tr>

      <tr><td>
        <h2 style="margin:0 0 16px;font-family:Arial Black,Arial,sans-serif;font-size:22px;color:#4ade80;">Rising Demand (≥ +25% YoY)</h2>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#15151d;border:1px solid #272733;font-size:14px;">
          <tbody>${risingRows}</tbody>
        </table>
      </td></tr>

      <tr><td style="height:32px;"></td></tr>

      <tr><td>
        <h2 style="margin:0 0 16px;font-family:Arial Black,Arial,sans-serif;font-size:22px;color:#f87171;">Declining Demand (≤ −25% YoY)</h2>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#15151d;border:1px solid #272733;font-size:14px;">
          <tbody>${decliningRows}</tbody>
        </table>
      </td></tr>

      <tr><td style="height:48px;"></td></tr>

      <tr><td style="padding:28px 24px;background:#1a1a24;border:1px solid #272733;">
        <div style="font-family:'Courier New',monospace;font-size:11px;color:#ff6a1a;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:14px;">What to do next</div>
        <p style="margin:0 0 14px;color:#f5f5f7;font-size:16px;">If your market is up and your business still feels slow, it's not the market. The blog post below walks through how to check your agency and your own operations next.</p>
        <p style="margin:0;">
          <a href="https://bluecollartechy.com/blog/market-agency-or-you" style="display:inline-block;background:#ff6a1a;color:#000;padding:12px 22px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;">Read the full breakdown →</a>
        </p>
      </td></tr>

      <tr><td style="height:40px;"></td></tr>

      <tr><td style="border-top:1px solid #272733;padding-top:24px;">
        <p style="margin:0;color:#6b6b78;font-size:12px;line-height:1.6;">
          This scan used live Google Ads Keyword Planner data. Numbers are directional, not absolute. Small markets, sparse categories, and new keywords may fall back to seasonal trend comparisons when 24-month YoY data isn't available. Always pair this with your lead volume, conversion rate, and competitive check.
          <br><br>
          Blue Collar Techy · Built by Nick Conley · <a href="https://bluecollartechy.com" style="color:#ff6a1a;">bluecollartechy.com</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// DELIVERY
// ============================================================================

async function sendEmail(to, name, subject, html, env) {
  const body = {
    from: env.RESEND_FROM_EMAIL || 'Blue Collar Techy <nick@bluecollartechy.com>',
    to: [to],
    subject,
    html,
    reply_to: 'nick@bluecollartechy.com',
  };
  if (env.SCAN_NOTIFY_EMAIL) body.bcc = [env.SCAN_NOTIFY_EMAIL];

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function slugTag(prefix, value) {
  if (!value) return null;
  const slug = String(value).toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug ? `${prefix}-${slug}` : null;
}

function buildAttributionTags(a) {
  if (!a || typeof a !== 'object') return [];
  const tags = [];
  if (a.utm_source) tags.push(slugTag('src', a.utm_source));
  if (a.utm_medium) tags.push(slugTag('medium', a.utm_medium));
  if (a.utm_campaign) tags.push(slugTag('camp', a.utm_campaign));
  if (a.utm_content) tags.push(slugTag('content', a.utm_content));
  if (a.referrer) {
    try {
      const u = new URL(a.referrer.startsWith('http') ? a.referrer : 'https://' + a.referrer);
      if (u.hostname && !u.hostname.endsWith('bluecollartechy.com')) {
        tags.push(slugTag('ref', u.hostname));
      }
    } catch {}
  }
  if (a.submission_page) tags.push(slugTag('page', a.submission_page));
  return tags.filter(Boolean);
}

async function pushGhlContact(payload, env) {
  if (!env.GHL_API_KEY || !env.GHL_LOCATION_ID) return null;
  const baseTags = ['bct-market-scan', `bct-${payload.industry}`];
  const attrTags = buildAttributionTags(payload.attribution);
  const source = (payload.attribution && payload.attribution.utm_source)
    ? `BCT Market Scan · ${payload.attribution.utm_source}`
    : 'Blue Collar Techy · Market Scan';
  const body = {
    locationId: env.GHL_LOCATION_ID,
    firstName: payload.name.split(' ')[0] || payload.name,
    lastName: payload.name.split(' ').slice(1).join(' ') || '',
    email: payload.email,
    tags: [...baseTags, ...attrTags],
    source,
    customFields: [],
  };
  try {
    const res = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GHL_API_KEY}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('[ghl]', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('[ghl]', e.message);
    return null;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON payload.' }, 400);
  }

  // Honeypot
  if (body.website && body.website.length > 0) {
    return json({ ok: true }, 200); // silently accept so bots don't retry
  }

  const name = (body.name || '').toString().trim();
  const email = (body.email || '').toString().trim().toLowerCase();
  const city = (body.city || '').toString().trim();
  const industry = (body.industry || '').toString().trim();

  if (!name || !email || !city || !industry) {
    return json({ error: 'All fields are required.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }
  const seedsDoc = SEEDS[industry];
  if (!seedsDoc) {
    return json({ error: `Unknown industry: ${industry}` }, 400);
  }
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    return json({ error: 'Scan service is not configured. Please email nick@bluecollartechy.com.' }, 500);
  }

  const locationName = normalizeLocation(city);

  try {
    // 1. Scan
    const { rows, cost } = await fetchAllKeywords(seedsDoc, locationName, env.DATAFORSEO_LOGIN, env.DATAFORSEO_PASSWORD);
    if (!rows.length) {
      return json({ error: 'No data returned for your market. Try re-running with the nearest metro area.' }, 422);
    }

    // 2. Analyze
    const analysis = annotateAndSummarize(rows, seedsDoc, locationName);

    // 3. Push lead to GHL (non-blocking — scan still succeeds if GHL hiccups)
    const attribution = (body && body.attribution) || {};
    pushGhlContact({ name, email, industry, city, attribution }, env).catch(() => {});

    // 4. Return structured report to the browser
    return json({
      ok: true,
      scan_cost_usd: Math.round(cost * 1000) / 1000,
      report: {
        location: locationName,
        industry: seedsDoc.industry,
        industry_description: seedsDoc.description,
        submitter: { name, email, city },
        confidence: analysis.confidence,
        verdict: analysis.verdict,
        total_volume: analysis.totalVolume,
        yoy_pct: Math.round(analysis.yoyPct * 10) / 10,
        categories: analysis.catStats,
        top_keywords: analysis.topKws,
        rising: analysis.rising,
        declining: analysis.declining,
      },
    }, 200);

  } catch (e) {
    console.error('[scan] failed:', e.message, e.stack);
    return json({ error: `Scan failed: ${e.message}` }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
