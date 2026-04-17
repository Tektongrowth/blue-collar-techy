/**
 * /api/gbp-check — Blue Collar Techy GBP Health Check
 *
 * POST { name, email, business_name, city, website (honeypot) }
 *   ↓
 * 1. Validate + honeypot check
 * 2. DataForSEO my_business_info — fetch the target business
 * 3. DataForSEO local_finder — fetch top competitors in same category + city
 * 4. Score on 7 dimensions (ownership, categories, reviews, photos, hours, website, description)
 * 5. Generate insight + action list
 * 6. Push lead to GHL (optional)
 * 7. Return { ok, report }
 *
 * Required env vars:
 *   DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
 * Optional:
 *   GHL_API_KEY, GHL_LOCATION_ID, GBP_NOTIFY_EMAIL, RESEND_API_KEY, RESEND_FROM_EMAIL
 */

const DFS_LISTINGS = 'https://api.dataforseo.com/v3/business_data/business_listings/search/live';
const DFS_LOCAL_FINDER = 'https://api.dataforseo.com/v3/serp/google/local_finder/live/advanced';

// ============================================================================
// HELPERS
// ============================================================================

const dfsAuth = (login, pass) => 'Basic ' + btoa(`${login}:${pass}`);

function normalizeString(s) {
  return String(s || '').trim();
}

const STATE_ABBREV = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia',
};

function normalizeLocation(city) {
  // DFS requires "City,State Full Name,United States" (no spaces around commas, full state name)
  let c = String(city || '').trim().replace(/\s*,\s*/g, ',');
  let parts = c.split(',').filter(Boolean);

  // If first part is the state abbreviation/name only, assume user typo — just return as-is
  if (parts.length < 2) return c + ',United States';

  // Expand 2-letter state abbreviations (always case-insensitive)
  parts = parts.map(p => {
    const up = p.toUpperCase();
    if (STATE_ABBREV[up]) return STATE_ABBREV[up];
    return p;
  });

  // If only "City,State" provided, append ",United States"
  if (parts.length === 2) parts.push('United States');

  return parts.join(',');
}

function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function classifyCount(count, thresholds) {
  // thresholds = { low, mid } — returns 'low' | 'medium' | 'high'
  if (count < thresholds.low) return 'low';
  if (count < thresholds.mid) return 'medium';
  return 'high';
}

function tierForReviewCount(n) {
  if (n >= 100) return 'high';
  if (n >= 30) return 'medium';
  return 'low';
}

function tierForRating(r) {
  if (r >= 4.8) return 'high';
  if (r >= 4.5) return 'medium';
  return 'low';
}

function tierForCompetitorGap(yours, competitorMedian) {
  if (!competitorMedian) return 'medium';
  const ratio = yours / competitorMedian;
  if (ratio >= 0.8) return 'high';
  if (ratio >= 0.4) return 'medium';
  return 'low';
}

function scoreIndividualCheck(ok) {
  return ok ? 100 : 0;
}

// ============================================================================
// DATAFORSEO CALLERS
// ============================================================================

async function dfsPost(url, body, auth) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 28000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) throw new Error(`DFS ${r.status}: ${await r.text().catch(() => '')}`);
    return await r.json();
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

function nameSimilar(a, b) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  // Word overlap
  const wordsA = new Set(String(a).toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(String(b).toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  wordsA.forEach(w => { if (wordsB.has(w)) shared++; });
  return shared / Math.min(wordsA.size, wordsB.size);
}

async function fetchBusinessInfo(businessName, city, auth) {
  const body = [{
    title: businessName,
    location_name: city,
    limit: 5,
  }];
  const data = await dfsPost(DFS_LISTINGS, body, auth);
  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  if (!items.length) return null;
  // Best name match
  let best = items[0];
  let bestScore = nameSimilar(businessName, best.title);
  for (const item of items.slice(1)) {
    const s = nameSimilar(businessName, item.title);
    if (s > bestScore) { bestScore = s; best = item; }
  }
  return bestScore >= 0.3 ? best : null;
}

// Fallback: use local_finder SERP result and normalize into business_listings shape.
// Used when DFS business_listings index doesn't have the business (common for
// service-area businesses without a storefront).
async function fetchBusinessInfoFallback(businessName, city, auth) {
  const body = [{
    keyword: businessName,
    location_name: city,
    language_code: 'en',
    depth: 5,
  }];
  const data = await dfsPost(DFS_LOCAL_FINDER, body, auth);
  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  if (!items.length) return null;
  // Find best name match among local_pack results
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    if (item.type !== 'local_pack' && item.type !== 'local_finder') continue;
    const s = nameSimilar(businessName, item.title);
    if (s > bestScore) { bestScore = s; best = item; }
  }
  if (!best || bestScore < 0.3) return null;

  // Normalize local_finder shape to business_listings-ish shape.
  // Local finder lacks: category, additional_categories, total_photos, work_time, is_claimed.
  // We flag this as "partial" so scoring can skip N/A checks.
  return {
    _partial: true,
    title: best.title,
    phone: best.phone,
    address: null, // not reliable in local_finder
    url: best.url,
    domain: best.domain,
    category: null,
    additional_categories: [],
    total_photos: null,
    rating: best.rating || null,
    is_claimed: null, // unknown
    work_time: null,
  };
}

async function fetchLocalFinder(category, city, auth) {
  const body = [{
    keyword: category,
    location_name: city,
    language_code: 'en',
    device: 'desktop',
    depth: 10,
  }];
  const data = await dfsPost(DFS_LOCAL_FINDER, body, auth);
  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  // DFS returns items with type='local_pack' for local finder results
  return items.filter(i => (i.type === 'local_pack' || i.type === 'local_finder') && i.rating).slice(0, 10);
}

// ============================================================================
// SCORING
// ============================================================================

function scoreBusiness(biz, competitors) {
  if (!biz) return null;
  const partial = biz._partial === true;

  const checks = [];
  let total = 0;
  let maxTotal = 0;

  // Competitor benchmarks
  const compReviews = competitors
    .map(c => Number(c.rating?.votes_count || c.rating_count || 0))
    .filter(n => n > 0)
    .sort((a, b) => a - b);
  const compMedian = compReviews.length
    ? compReviews[Math.floor(compReviews.length / 2)]
    : 0;
  const compMax = compReviews[compReviews.length - 1] || 0;

  const yourReviews = Number(biz.rating?.votes_count || 0);
  const yourRating = Number(biz.rating?.value || 0);
  const yourCategory = biz.category || '';
  const categories = Array.isArray(biz.additional_categories) ? biz.additional_categories : [];

  // === 1. CLAIMED & VERIFIED ===
  if (biz.is_claimed === null || biz.is_claimed === undefined) {
    checks.push({
      id: 'claimed',
      label: 'Profile claimed and verified',
      weight: 0,
      ok: null,
      score: null,
      message: 'Could not verify claim status from public data. Log into business.google.com to confirm you own the listing.',
      na: true,
    });
  } else {
    const isClaimed = biz.is_claimed === true;
    checks.push({
      id: 'claimed',
      label: 'Profile claimed and verified',
      weight: 20,
      ok: isClaimed,
      score: isClaimed ? 100 : 0,
      message: isClaimed
        ? 'Your profile is claimed and verified. Good foundation.'
        : 'This listing does not appear to be claimed. Claim it before anything else. Go to business.google.com and request ownership.',
    });
  }

  // === 2. PRIMARY CATEGORY ===
  if (partial) {
    checks.push({
      id: 'primary_category',
      label: 'Primary category',
      weight: 0, ok: null, score: null, na: true,
      message: 'Category data not available in the public snapshot. Check business.google.com to confirm yours is set to the most specific match.',
    });
    checks.push({
      id: 'secondary_categories',
      label: 'Secondary categories',
      weight: 0, ok: null, score: null, na: true,
      message: 'Secondary categories not available in the public snapshot. You can add up to nine inside business.google.com.',
    });
  } else {
    const hasCategory = Boolean(yourCategory);
    checks.push({
      id: 'primary_category',
      label: 'Primary category set',
      weight: 15,
      ok: hasCategory,
      score: hasCategory ? 100 : 0,
      detail: yourCategory,
      message: hasCategory
        ? `Primary category is "${yourCategory}". Make sure it is the most specific match for your main service.`
        : 'No primary category detected. This is one of the biggest ranking factors. Pick the most specific category that matches your main service.',
    });

    const hasSecondary = categories.length >= 2;
    const manySecondary = categories.length >= 4;
    checks.push({
      id: 'secondary_categories',
      label: 'Secondary categories filled',
      weight: 10,
      ok: hasSecondary,
      score: manySecondary ? 100 : hasSecondary ? 65 : 0,
      detail: `${categories.length} secondary categor${categories.length === 1 ? 'y' : 'ies'}`,
      message: manySecondary
        ? `${categories.length} secondary categories look solid.`
        : hasSecondary
        ? `Only ${categories.length} secondary categories. Add two or three more to cover services you are missing out on.`
        : 'No secondary categories. You can add up to nine. Each one is a chance to show up for searches you otherwise miss.',
    });
  }

  // === 4. PHONE NUMBER ===
  const hasPhone = Boolean(biz.phone);
  checks.push({
    id: 'phone',
    label: 'Phone number listed',
    weight: 8,
    ok: hasPhone,
    score: hasPhone ? 100 : 0,
    detail: biz.phone || null,
    message: hasPhone
      ? 'Phone number is set. Make sure it matches your website and directory listings.'
      : 'No phone number on the profile. This is a leak straight out of the map pack.',
  });

  // === 5. WEBSITE LINKED ===
  const hasWebsite = Boolean(biz.url || biz.domain);
  checks.push({
    id: 'website',
    label: 'Website linked',
    weight: 10,
    ok: hasWebsite,
    score: hasWebsite ? 100 : 0,
    detail: biz.url || biz.domain || null,
    message: hasWebsite
      ? 'Website is linked. Good.'
      : 'No website linked from your profile. Every click you miss here is a click you paid for somewhere else.',
  });

  // === 6. HOURS SET ===
  if (partial) {
    checks.push({
      id: 'hours',
      label: 'Business hours',
      weight: 0, ok: null, score: null, na: true,
      message: 'Hours not available in the public snapshot.',
    });
  } else {
    const workHours = biz.work_time?.work_hours || biz.work_hours;
    const hasHours = Boolean(workHours && (workHours.timetable || workHours.workday_timing || Object.keys(workHours).length > 0));
    checks.push({
      id: 'hours',
      label: 'Business hours set',
      weight: 5,
      ok: hasHours,
      score: hasHours ? 100 : 0,
      message: hasHours
        ? 'Hours are set.'
        : 'No hours on the profile. Missing hours makes the profile look incomplete.',
    });
  }

  // === 6b. PHOTOS ===
  if (partial || biz.total_photos === null || biz.total_photos === undefined) {
    checks.push({
      id: 'photos',
      label: 'Photo coverage',
      weight: 0, ok: null, score: null, na: true,
      message: 'Photo count not available in the public snapshot. Open your profile and count photos manually. Top profiles have 30+ with recent uploads.',
    });
  } else {
    const photoCount = Number(biz.total_photos || 0);
    let photoScore = 0;
    let photoMsg = '';
    if (photoCount >= 30) { photoScore = 100; photoMsg = `${photoCount} photos on the profile. Solid coverage.`; }
    else if (photoCount >= 15) { photoScore = 70; photoMsg = `${photoCount} photos. Decent, but top profiles usually have more.`; }
    else if (photoCount >= 5) { photoScore = 40; photoMsg = `Only ${photoCount} photos. Upload real project photos this week.`; }
    else if (photoCount > 0) { photoScore = 15; photoMsg = `${photoCount} photos total. The profile looks thin. Homeowners notice.`; }
    else { photoScore = 0; photoMsg = 'No photos visible on the profile. Upload a batch of completed project photos as soon as possible.'; }
    checks.push({
      id: 'photos',
      label: 'Photo coverage',
      weight: 10,
      ok: photoCount >= 15,
      score: photoScore,
      detail: `${photoCount} photo${photoCount === 1 ? '' : 's'} total`,
      message: photoMsg,
    });
  }

  // === 7. REVIEW COUNT VS COMPETITORS ===
  const reviewTier = tierForCompetitorGap(yourReviews, compMedian);
  const reviewScore = reviewTier === 'high' ? 100 : reviewTier === 'medium' ? 55 : 15;
  checks.push({
    id: 'review_count',
    label: 'Review count vs local competitors',
    weight: 20,
    ok: reviewTier !== 'low',
    score: reviewScore,
    detail: `You: ${yourReviews} · Median competitor: ${compMedian || 'n/a'} · Top: ${compMax || 'n/a'}`,
    message:
      reviewTier === 'high'
        ? `You have ${yourReviews} reviews. That is in line with or ahead of your competition.`
        : reviewTier === 'medium'
        ? `You have ${yourReviews} reviews. The median in your area is ${compMedian}. You are in the pack but not ahead.`
        : `You have ${yourReviews} reviews. The median in your area is ${compMedian}. You are playing defense. Every completed job should end with a review ask.`,
  });

  // === 8. RATING ===
  const ratingTier = tierForRating(yourRating);
  const ratingScore = ratingTier === 'high' ? 100 : ratingTier === 'medium' ? 70 : 30;
  checks.push({
    id: 'rating',
    label: 'Star rating',
    weight: 12,
    ok: yourRating >= 4.5,
    score: ratingScore,
    detail: yourRating ? `${yourRating.toFixed(1)} stars` : 'No rating yet',
    message:
      yourRating === 0
        ? 'No rating yet. Your first five reviews set the tone. Ask your best recent customers first.'
        : yourRating >= 4.8
        ? 'Rating is strong. Keep doing what you are doing.'
        : yourRating >= 4.5
        ? 'Rating is OK. Most customers still click, but top-tier profiles are at 4.8+.'
        : 'Rating is hurting you. One or two bad reviews drag this hard when volume is low. Focus on volume of good reviews from happy customers.',
  });

  // Total weighted score — skip N/A checks (weight 0)
  for (const c of checks) {
    if (c.na || c.weight === 0) continue;
    total += c.score * c.weight;
    maxTotal += 100 * c.weight;
  }
  const overallScore = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;

  // Verdict
  let verdict, verdictLabel;
  if (overallScore >= 85) {
    verdictLabel = 'STRONG';
    verdict = 'Your profile is in good shape. Keep the review pipeline running and post regularly. The agency and market buckets are more likely to explain any lead softness than your GBP.';
  } else if (overallScore >= 65) {
    verdictLabel = 'MIXED';
    verdict = 'Your profile is doing some things right but leaving meaningful ground on the table. Fix the three lowest-scoring items below and you will see map pack ranking improvements inside 60 days.';
  } else {
    verdictLabel = 'NEEDS WORK';
    verdict = 'Your profile has real gaps that are almost certainly costing you calls. Start from the top of the action list. Every item compounds on the ones above it.';
  }

  // Action list — top 5 lowest-scoring checks that aren't already at 100 and aren't N/A
  const actions = checks
    .filter(c => !c.na && c.score < 100)
    .sort((a, b) => (a.score * a.weight) - (b.score * b.weight))
    .slice(0, 5);

  return {
    partial,
    business: {
      title: biz.title,
      address: biz.address,
      phone: biz.phone,
      url: biz.url || biz.domain,
      category: yourCategory,
      rating: yourRating,
      review_count: yourReviews,
      place_id: biz.place_id,
      main_image: biz.main_image,
    },
    competitors: {
      median_reviews: compMedian,
      max_reviews: compMax,
      sample_size: compReviews.length,
    },
    checks,
    overall_score: overallScore,
    verdict,
    verdict_label: verdictLabel,
    actions,
  };
}

// ============================================================================
// HTML REPORT RENDERER
// ============================================================================

function htmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderReportHtml(report, input) {
  const { partial, business, competitors, checks, overall_score, verdict, verdict_label, actions } = report;
  const verdictClass = overall_score >= 85 ? 'high' : overall_score >= 65 ? 'medium' : 'low';

  const checkRows = checks.map(c => {
    if (c.na) {
      return `
      <div class="check-row tone-medium">
        <div class="check-head">
          <div class="check-label">${htmlEscape(c.label)}</div>
          <div class="check-score">N/A</div>
        </div>
        <div class="check-msg">${htmlEscape(c.message)}</div>
      </div>
      `;
    }
    const tone = c.score >= 85 ? 'high' : c.score >= 50 ? 'medium' : 'low';
    return `
      <div class="check-row tone-${tone}">
        <div class="check-head">
          <div class="check-label">${htmlEscape(c.label)}</div>
          <div class="check-score">${c.score}/100</div>
        </div>
        ${c.detail ? `<div class="check-detail">${htmlEscape(c.detail)}</div>` : ''}
        <div class="check-msg">${htmlEscape(c.message)}</div>
      </div>
    `;
  }).join('');

  const partialBanner = partial ? `
    <div class="verdict-card" style="border-left-color: var(--warn, #fbbf24);">
      <div class="v-label" style="color: var(--warn, #fbbf24);">Partial Data</div>
      <div class="v-text">We found your business in Google's search results but not in the detailed listings index. That usually means the profile is a service-area business without a full storefront entry, or it's newer. A few checks below are marked N/A because the data isn't publicly available. Log into business.google.com to verify those manually.</div>
    </div>
  ` : '';

  const actionRows = actions.length
    ? actions.map((a, i) => `
        <li><span class="ac-num">${(i + 1).toString().padStart(2, '0')}</span> ${htmlEscape(a.label)} — ${htmlEscape(a.message)}</li>
      `).join('')
    : '<li>No critical gaps. Keep what you are doing.</li>';

  return `
    <div class="report-view">
      <div class="report-header">
        <div class="report-label">GBP Audit · ${htmlEscape(business.title || input.business_name)}</div>
        <h2 class="report-title">Score: <span class="hi">${overall_score}/100</span> · ${htmlEscape(verdict_label)}</h2>
        <div class="report-meta">${htmlEscape(input.city)} · Ran on ${new Date().toISOString().slice(0,10)}</div>
      </div>

      ${partialBanner}
      <div class="verdict-card">
        <div class="v-label">Verdict</div>
        <div class="v-text">${htmlEscape(verdict)}</div>
      </div>

      <div class="metrics-row">
        <div class="metric metric-${verdictClass}"><div class="m-label">Overall Score</div><div class="m-value">${overall_score}</div></div>
        <div class="metric"><div class="m-label">Reviews</div><div class="m-value">${business.review_count}</div></div>
        <div class="metric"><div class="m-label">Rating</div><div class="m-value">${business.rating ? business.rating.toFixed(1) : 'n/a'}</div></div>
      </div>

      <h3 class="section-title">Competitor benchmark</h3>
      <p class="section-sub">We pulled the top contractors in your area for comparison.</p>
      <div class="comp-row">
        <div class="comp-item"><div class="c-label">Your reviews</div><div class="c-value">${business.review_count}</div></div>
        <div class="comp-item"><div class="c-label">Median competitor</div><div class="c-value">${competitors.median_reviews || 'n/a'}</div></div>
        <div class="comp-item"><div class="c-label">Top competitor</div><div class="c-value">${competitors.max_reviews || 'n/a'}</div></div>
      </div>

      <h3 class="section-title">Seven-point breakdown</h3>
      <div class="checks">${checkRows}</div>

      <h3 class="section-title">Priority action list</h3>
      <ol class="actions">${actionRows}</ol>

      <div class="report-footer">
        <p><strong>Next step.</strong> Work the priority list from top to bottom. Everything compounds. If you want help doing it faster, the newsletter gets the follow-up posts, and Tekton Growth handles it for contractors who want someone else to run the work.</p>
      </div>
    </div>
  `;
}

// ============================================================================
// GHL PUSH (optional, non-blocking)
// ============================================================================

async function pushToGHL(env, input, report) {
  if (!env.GHL_API_KEY || !env.GHL_LOCATION_ID) return { skipped: true };
  const [firstName, ...rest] = input.name.split(' ');
  const lastName = rest.join(' ');
  const payload = {
    firstName: firstName || input.name,
    lastName: lastName || '',
    email: input.email,
    locationId: env.GHL_LOCATION_ID,
    source: 'Blue Collar Techy GBP Check',
    tags: ['bct-gbp-check', `bct-gbp-score-${report.verdict_label.toLowerCase().replace(/ /g, '-')}`],
    customFields: [
      { key: 'gbp_business_name', field_value: input.business_name },
      { key: 'gbp_city', field_value: input.city },
      { key: 'gbp_score', field_value: String(report.overall_score) },
    ],
  };
  try {
    const r = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GHL_API_KEY}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return { ok: false, error: await r.text().catch(() => '') };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// HANDLER
// ============================================================================

export async function onRequestPost({ request, env }) {
  const respond = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  let body;
  try {
    body = await request.json();
  } catch {
    return respond({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const name = normalizeString(body.name);
  const email = normalizeString(body.email).toLowerCase();
  const business_name = normalizeString(body.business_name);
  const city = normalizeLocation(body.city);
  const hp = normalizeString(body.website);

  // Honeypot
  if (hp) return respond({ ok: true }, 200);

  // Validate
  if (!name || !email || !business_name || !city) {
    return respond({ ok: false, error: 'Missing required fields.' }, 400);
  }
  if (!validEmail(email)) {
    return respond({ ok: false, error: 'Email looks invalid.' }, 400);
  }

  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    return respond({ ok: false, error: 'Server not configured. Try again later.' }, 500);
  }
  const auth = dfsAuth(env.DATAFORSEO_LOGIN, env.DATAFORSEO_PASSWORD);

  // Fetch business — try full business_listings first, fall back to local_finder
  let biz;
  try {
    biz = await fetchBusinessInfo(business_name, city, auth);
  } catch (e) {
    return respond({ ok: false, error: `Could not search for that business. (${e.message})` }, 502);
  }

  if (!biz) {
    // Fallback: many service-area businesses aren't in business_listings index
    try {
      biz = await fetchBusinessInfoFallback(business_name, city, auth);
    } catch (e) {
      // non-fatal — fall through to "not found"
    }
  }

  if (!biz) {
    return respond({
      ok: false,
      error: `We could not find "${business_name}" in ${city}. Try the exact business name as it appears in Google, or include the state (e.g. "Charlotte, NC").`,
    }, 404);
  }

  // Fetch competitors for comparison
  let competitors = [];
  try {
    const compKeyword = `${biz.category || 'contractor'} ${city.split(',')[0]}`.trim();
    competitors = await fetchLocalFinder(compKeyword, city, auth);
  } catch (e) {
    // Non-fatal — scoring still works with empty competitor set
    console.warn('Competitor fetch failed:', e.message);
  }

  const report = scoreBusiness(biz, competitors);
  if (!report) return respond({ ok: false, error: 'Scoring failed.' }, 500);

  const html = renderReportHtml(report, { business_name, city });

  // Push to GHL (non-blocking)
  const input = { name, email, business_name, city };
  pushToGHL(env, input, report).catch(() => {});

  return respond({
    ok: true,
    html,
    score: report.overall_score,
    verdict: report.verdict_label,
  });
}
