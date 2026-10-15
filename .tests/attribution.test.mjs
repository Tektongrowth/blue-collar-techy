import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySource, sanitizeAttribution, ghlAttributionSource, applyAttributionToContact, attributionEmailFields } from '../functions/_lib/attribution.js';

const tag = (a) => classifySource(sanitizeAttribution(a)).tag;

test('direct', () => {
  assert.equal(tag({}), 'src-direct');
  assert.equal(tag({ referrer: 'https://bluecollartechy.com/blog/x' }), 'src-direct');
});
test('google organic and others', () => {
  assert.equal(tag({ referrer: 'https://www.google.com/' }), 'src-google-organic');
  assert.equal(tag({ referrer: 'https://www.bing.com/search?q=x' }), 'src-bing-organic');
  assert.equal(tag({ referrer: 'https://duckduckgo.com/' }), 'src-duckduckgo-organic');
});
test('ai referral', () => {
  assert.equal(tag({ referrer: 'https://chatgpt.com/' }), 'src-ai-referral');
  assert.equal(tag({ referrer: 'https://www.perplexity.ai/search' }), 'src-ai-referral');
  assert.equal(tag({ utm_source: 'chatgpt.com' }), 'src-ai-referral');
  assert.equal(tag({ referrer: 'https://gemini.google.com/' }), 'src-ai-referral');
});
test('paid', () => {
  assert.equal(tag({ gclid: 'abc', referrer: 'https://www.google.com/' }), 'src-paid');
  assert.equal(tag({ fbclid: 'abc' }), 'src-paid');
  assert.equal(tag({ utm_source: 'google', utm_medium: 'cpc' }), 'src-paid');
});
test('social, email, referral', () => {
  assert.equal(tag({ referrer: 'https://l.facebook.com/' }), 'src-social');
  assert.equal(tag({ utm_medium: 'email', utm_source: 'beehiiv' }), 'src-email');
  assert.equal(tag({ referrer: 'https://example.org/post' }), 'src-referral');
});
test('ghl attributionSource and tags', () => {
  const a = sanitizeAttribution({ utm_source: 'probe', utm_medium: 'cpc', utm_campaign: 'c', gclid: 'g1', landing_url: 'https://x.com/?a=1', referrer: 'https://www.google.com/' });
  const s = ghlAttributionSource(a);
  assert.equal(s.sessionSource, 'Paid Search');
  assert.equal(s.utmSource, 'probe');
  assert.equal(s.gclid, 'g1');
  const body = applyAttributionToContact({ tags: ['bct-newsletter'] }, a);
  assert.deepEqual(body.tags, ['bct-newsletter', 'src-paid']);
});
test('sanitize clamps and drops junk', () => {
  const a = sanitizeAttribution({ utm_source: 'x'.repeat(500), evil: 'y', gclid: null });
  assert.equal(a.utm_source.length, 120);
  assert.equal(a.evil, undefined);
  assert.equal(a.gclid, undefined);
});
test('email rows', () => {
  const f = attributionEmailFields(sanitizeAttribution({ referrer: 'https://www.google.com/', submission_page: '/x' }));
  assert.match(f['Lead source'], /src-google-organic/);
});
