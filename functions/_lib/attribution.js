/**
 * Shared lead-attribution helpers (used by /api/contact, /api/subscribe, /api/gbp-check, /api/scan).
 *
 * The browser (js/tracking.js) stores first-touch attribution and sends it as `attribution`.
 * Here we sanitize it, classify the source into one `src-*` tag, build the GHL
 * `attributionSource` object, a readable note, and rows for the lead alert email.
 */

const OWN_HOSTS = ['bluecollartechy.com', 'tektongrowth.com'];

const AI_HOSTS = [
  'chatgpt.com', 'chat.openai.com', 'openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com',
  'bard.google.com', 'copilot.microsoft.com', 'grok.com', 'you.com', 'poe.com', 'meta.ai',
  'deepseek.com', 'chat.deepseek.com', 'phind.com', 'kagi.com', 'duck.ai',
];
const AI_SOURCE_WORDS = ['chatgpt', 'openai', 'perplexity', 'claude', 'gemini', 'copilot', 'grok', 'deepseek', 'phind'];

const SEARCH_ENGINES = [
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)yahoo\.com$/, 'yahoo'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
  [/(^|\.)brave\.com$/, 'brave'],
  [/(^|\.)yandex\.[a-z.]+$/, 'yandex'],
  [/(^|\.)baidu\.com$/, 'baidu'],
];

const SOCIAL_HOSTS = [
  'facebook.com', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com', 'instagram.com', 'l.instagram.com',
  'linkedin.com', 'lnkd.in', 't.co', 'twitter.com', 'x.com', 'youtube.com', 'm.youtube.com', 'youtu.be',
  'reddit.com', 'old.reddit.com', 'tiktok.com', 'pinterest.com', 'nextdoor.com',
];

const PAID_MEDIUM = /^(cpc|ppc|paid|paidsearch|paid[-_ ]?social|paidsocial|display|cpm|retargeting|remarketing|ads?|sem)$/i;

const FIELD_LIMITS = {
  utm_source: 120, utm_medium: 120, utm_campaign: 160, utm_content: 160, utm_term: 160,
  gclid: 200, fbclid: 200, referrer: 300, landing_page: 300, landing_url: 500, submission_page: 200, first_seen: 40,
};

export function sanitizeAttribution(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, max] of Object.entries(FIELD_LIMITS)) {
    const v = raw[k];
    if (v === undefined || v === null) continue;
    const s = String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
    if (s) out[k] = s;
  }
  return out;
}

function hostOf(url) {
  if (!url) return '';
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

const endsWithHost = (host, list) => list.some((h) => host === h || host.endsWith('.' + h));

/** Returns { tag, label, sessionSource, medium } for one lead. */
export function classifySource(a, ownHosts = OWN_HOSTS) {
  a = a || {};
  const src = String(a.utm_source || '').toLowerCase();
  const med = String(a.utm_medium || '').toLowerCase();
  let host = hostOf(a.referrer);
  if (host && endsWithHost(host, ownHosts)) host = ''; // internal referrer = no outside referrer

  if (a.gclid || a.fbclid || PAID_MEDIUM.test(med)) {
    const social = !!a.fbclid || /facebook|instagram|meta|tiktok|linkedin|fb|ig/.test(src);
    return { tag: 'src-paid', label: social ? 'Paid social' : 'Paid search', sessionSource: social ? 'Paid Social' : 'Paid Search', medium: med || 'cpc' };
  }
  if (AI_SOURCE_WORDS.some((w) => src.includes(w)) || (host && endsWithHost(host, AI_HOSTS))) {
    return { tag: 'src-ai-referral', label: 'AI referral', sessionSource: 'Referral', medium: med || 'ai-referral' };
  }
  if (med === 'email' || med === 'newsletter' || src === 'email' || src === 'newsletter') {
    return { tag: 'src-email', label: 'Email', sessionSource: 'Email', medium: med || 'email' };
  }
  if (host) {
    for (const [re, name] of SEARCH_ENGINES) {
      if (re.test(host)) return { tag: `src-${name}-organic`, label: `${name[0].toUpperCase()}${name.slice(1)} organic`, sessionSource: 'Organic Search', medium: 'organic' };
    }
    if (endsWithHost(host, SOCIAL_HOSTS)) return { tag: 'src-social', label: 'Social', sessionSource: 'Social media', medium: med || 'social' };
    return { tag: 'src-referral', label: `Referral (${host})`, sessionSource: 'Referral', medium: med || 'referral' };
  }
  if (med === 'organic' && src) {
    return { tag: `src-${src.replace(/[^a-z0-9]+/g, '') || 'search'}-organic`, label: `${src} organic`, sessionSource: 'Organic Search', medium: 'organic' };
  }
  if (src) return { tag: 'src-referral', label: `Campaign (${src})`, sessionSource: 'Referral', medium: med || 'referral' };
  return { tag: 'src-direct', label: 'Direct', sessionSource: 'Direct traffic', medium: 'direct' };
}

/** The one class tag to add. Existing tags are never touched. */
export function attributionTags(a, ownHosts) {
  return [classifySource(a, ownHosts).tag];
}

/** Object for GHL contacts `attributionSource`. Empty fields are left out. */
export function ghlAttributionSource(a, ownHosts) {
  const c = classifySource(a, ownHosts);
  const o = {
    url: a.landing_url || a.landing_page,
    referrer: a.referrer,
    campaign: a.utm_campaign,
    utmSource: a.utm_source,
    utmMedium: a.utm_medium,
    utmContent: a.utm_content,
    utmTerm: a.utm_term,
    gclid: a.gclid,
    fbclid: a.fbclid,
    medium: a.utm_medium || c.medium,
    sessionSource: c.sessionSource,
  };
  for (const k of Object.keys(o)) if (!o[k]) delete o[k];
  return o;
}

/** Readable lines for a GHL note. */
export function attributionNoteLines(a, ownHosts) {
  const c = classifySource(a, ownHosts);
  const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].filter((k) => a[k]).map((k) => `${k.slice(4)}=${a[k]}`).join(', ');
  const ids = ['gclid', 'fbclid'].filter((k) => a[k]).map((k) => `${k}=${a[k]}`).join(', ');
  return [
    `Lead source: ${c.label} (${c.tag})`,
    `Landing page: ${a.landing_url || a.landing_page || '-'}`,
    `Referrer: ${a.referrer || '(none / direct)'}`,
    `UTM: ${utm || '-'}`,
    `Click IDs: ${ids || '-'}`,
    `Submitted from: ${a.submission_page || '-'}`,
    a.first_seen ? `First seen: ${a.first_seen}` : '',
  ].filter(Boolean);
}

/** Rows for the lead alert email. */
export function attributionEmailFields(a, ownHosts) {
  const c = classifySource(a, ownHosts);
  const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].filter((k) => a[k]).map((k) => `${k.slice(4)}=${a[k]}`).join(', ');
  const ids = ['gclid', 'fbclid'].filter((k) => a[k]).map((k) => `${k}=${a[k]}`).join(', ');
  return {
    'Lead source': `${c.label} (${c.tag})`,
    'Landing page': a.landing_url || a.landing_page,
    Referrer: a.referrer || '(none / direct)',
    UTM: utm,
    'Click IDs': ids,
    'Submitted from': a.submission_page,
  };
}

/** Add attribution to a GHL contact body in place. Existing tags stay; one src-* tag is appended. */
export function applyAttributionToContact(body, a, ownHosts) {
  const tags = new Set([...(body.tags || []), ...attributionTags(a, ownHosts)]);
  body.tags = [...tags];
  body.attributionSource = ghlAttributionSource(a, ownHosts);
  return body;
}

/** Best-effort GHL note with the attribution lines. Never throws. */
export async function addAttributionNote(env, contactId, a, extraLines = [], ownHosts) {
  if (!contactId) return;
  try {
    const res = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GHL_API_KEY}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ body: ['Lead attribution', ...extraLines, ...attributionNoteLines(a, ownHosts)].join('\n') }),
    });
    if (!res.ok) console.error('[attribution note]', res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error('[attribution note]', e.message);
  }
}
