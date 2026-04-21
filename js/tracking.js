/**
 * Blue Collar Techy — Google Analytics 4 bootstrap
 * Loads gtag.js and fires pageview. Property: Blue Collar Techy (G-YGLDW6TYCY).
 */
(function () {
  if (window.gtag) return; // idempotent
  var GA_ID = 'G-YGLDW6TYCY';
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { send_page_view: true });
})();

/**
 * Blue Collar Techy — attribution tracking
 * First-touch UTM capture + landing page/referrer storage.
 * Stored in localStorage with a 90-day TTL so returning visitors still
 * attribute to their first meaningful source within that window.
 *
 * Exposes window.bctGetAttribution() → read at form submit time.
 */
(function () {
  if (window.bctGetAttribution) return; // idempotent
  const KEY = 'bct_attr';
  const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  function readStored() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && parsed._ts && (Date.now() - parsed._ts) < TTL_MS) return parsed;
      return {};
    } catch { return {}; }
  }

  function writeStored(obj) {
    try {
      obj._ts = Date.now();
      localStorage.setItem(KEY, JSON.stringify(obj));
    } catch {}
  }

  const stored = readStored();
  const params = new URLSearchParams(location.search);
  let updated = false;

  // First-touch UTM capture — only set if we don't already have a source
  if (!stored.utm_source && !stored.utm_campaign) {
    UTM_KEYS.forEach(function (k) {
      const val = params.get(k);
      if (val) {
        stored[k] = String(val).slice(0, 120);
        updated = true;
      }
    });
  }

  // Landing page + referrer captured once per window
  if (!stored.landing_page) {
    stored.landing_page = location.pathname;
    stored.landing_referrer = document.referrer || '';
    updated = true;
  }

  if (updated) writeStored(stored);

  window.bctGetAttribution = function () {
    const s = readStored();
    return {
      utm_source: s.utm_source || '',
      utm_medium: s.utm_medium || '',
      utm_campaign: s.utm_campaign || '',
      utm_content: s.utm_content || '',
      utm_term: s.utm_term || '',
      referrer: s.landing_referrer || document.referrer || '',
      landing_page: s.landing_page || location.pathname,
      submission_page: location.pathname,
    };
  };
})();
