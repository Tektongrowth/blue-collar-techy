import test from 'node:test';
import assert from 'node:assert/strict';

// Each function must at least load as an ES module and export its handler.
for (const f of ['contact', 'subscribe', 'gbp-check', 'scan']) {
  test(`functions/api/${f}.js loads`, async () => {
    const m = await import(`../functions/api/${f}.js`);
    assert.equal(typeof m.onRequestPost, 'function');
  });
}

test('contact: attribution reaches GHL upsert, note, and alert', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith('/contacts/upsert')) return new Response(JSON.stringify({ contact: { id: 'C1' } }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  try {
    const { onRequestPost } = await import('../functions/api/contact.js');
    const pending = [];
    const res = await onRequestPost({
      request: new Request('https://x.test/api/contact', { method: 'POST', body: JSON.stringify({
        name: 'TEST Person', email: 'a@b.co', message: 'hi',
        attribution: { utm_source: 'google', utm_medium: 'cpc', gclid: 'G1', referrer: 'https://www.google.com/', landing_page: '/x', submission_page: '/work-with-me' },
      }) }),
      env: { GHL_API_KEY: 'k', GHL_LOCATION_ID: 'L', RESEND_API_KEY: 'r' },
      waitUntil: (p) => pending.push(p),
    });
    await Promise.all(pending);
    assert.equal(res.status, 200);
    const up = calls.find((c) => c.url.endsWith('/contacts/upsert')).body;
    assert.ok(up.tags.includes('src-paid') && up.tags.includes('bct-work-with-me'));
    assert.equal(up.attributionSource.gclid, 'G1');
    assert.equal(up.attributionSource.sessionSource, 'Paid Search');
    const note = calls.find((c) => c.url.endsWith('/notes')).body.body;
    assert.match(note, /Lead source: Paid search \(src-paid\)/);
    const mail = calls.find((c) => c.url.includes('resend.com')).body;
    assert.match(mail.text, /Lead source: Paid search/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
