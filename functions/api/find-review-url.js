/**
 * POST /api/find-review-url
 * Body: { business: string, city: string }
 * Returns: { ok, matches: [{ title, address, phone, place_id, review_url }] }
 *
 * Looks up a contractor's Google Business Profile using DataForSEO and returns
 * a ready-to-use Google review URL. Used by /qr-generator/ so contractors
 * don't have to hunt down their review link.
 *
 * Tries business_listings first, falls back to local_finder for service-area
 * businesses without a physical storefront.
 *
 * Env: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
 */

const DFS_LISTINGS = 'https://api.dataforseo.com/v3/business_data/business_listings/search/live';
const DFS_LOCAL_FINDER = 'https://api.dataforseo.com/v3/serp/google/local_finder/live/advanced';

const STATE_ABBREV = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia',
  HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa',
  KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland',
  MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi',
  MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire',
  NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina',
  ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania',
  RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee',
  TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington',
  WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
};

function normalizeLocation(city) {
  if (!city) return '';
  let s = city.trim().replace(/\s+/g, ' ').replace(/,\s+/g, ',');
  const parts = s.split(',').map(p => p.trim());
  if (parts.length === 2 && parts[1].length === 2) {
    const abbrev = parts[1].toUpperCase();
    if (STATE_ABBREV[abbrev]) parts[1] = STATE_ABBREV[abbrev];
  }
  return parts.join(',').replace(/,/g, ', ');
}

function reviewUrl(placeId) {
  if (!placeId) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

async function dfsPost(url, body, auth) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DFS ${res.status}`);
  return res.json();
}

async function searchListings(business, city, auth) {
  const data = await dfsPost(DFS_LISTINGS, [{
    title: business,
    location_name: city,
    limit: 5,
  }], auth);
  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items.map(it => ({
    title: it.title,
    address: it.address || null,
    phone: it.phone || null,
    place_id: it.place_id || null,
    rating: it.rating?.value || null,
    reviews: it.rating?.votes_count || null,
    review_url: reviewUrl(it.place_id),
    source: 'business_listings',
  })).filter(it => it.place_id && it.review_url);
}

async function searchLocalFinder(business, city, auth) {
  const data = await dfsPost(DFS_LOCAL_FINDER, [{
    keyword: business,
    location_name: city,
    language_code: 'en',
    depth: 10,
  }], auth);
  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items
    .filter(it => (it.type === 'local_pack' || it.type === 'local_finder') && it.place_id)
    .slice(0, 5)
    .map(it => ({
      title: it.title,
      address: it.address || null,
      phone: it.phone || null,
      place_id: it.place_id,
      rating: it.rating?.value || null,
      reviews: it.rating?.votes_count || null,
      review_url: reviewUrl(it.place_id),
      source: 'local_finder',
    }));
}

export async function onRequestPost({ request, env }) {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    return json({ ok: false, error: 'Server not configured.' }, 500);
  }
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad JSON.' }, 400); }
  const business = (body?.business || '').trim();
  const city = normalizeLocation(body?.city || '');
  if (!business || !city) return json({ ok: false, error: 'Business and city are required.' }, 400);

  const auth = btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);

  try {
    let matches = await searchListings(business, city, auth);
    if (!matches.length) {
      // Service-area businesses often aren't in business_listings index
      matches = await searchLocalFinder(business, city, auth);
    }
    if (!matches.length) {
      return json({ ok: false, error: 'No listing found. Double-check the name and city, or paste your link in manually.' }, 404);
    }
    return json({ ok: true, matches });
  } catch (err) {
    return json({ ok: false, error: `Lookup failed: ${err.message}` }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet() {
  return new Response('POST only', { status: 405 });
}
