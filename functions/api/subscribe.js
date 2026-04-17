/**
 * /api/subscribe — Blue Collar Techy newsletter signup
 *
 * POST { email, website? }
 *   ↓
 * 1. Validate email + honeypot check
 * 2. Add contact to Resend Audience
 * 3. Optionally push to GHL with bct-newsletter tag
 * 4. Return { ok }
 *
 * Required env vars:
 *   RESEND_API_KEY      — from resend.com/api-keys
 *   RESEND_AUDIENCE_ID  — from resend.com/audiences (the audience to add subscribers to)
 * Optional:
 *   GHL_API_KEY, GHL_LOCATION_ID — mirror subscribers into GHL as contacts
 */

async function addToResendAudience(email, env) {
  const res = await fetch(`https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      unsubscribed: false,
    }),
  });
  // Resend returns 409 if contact already exists — treat as idempotent success.
  if (res.status === 409) return { already_subscribed: true };
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

async function pushToGhl(email, attribution, env) {
  if (!env.GHL_API_KEY || !env.GHL_LOCATION_ID) return null;
  const tags = ['bct-newsletter', ...buildAttributionTags(attribution)];
  const source = (attribution && attribution.utm_source)
    ? `BCT Newsletter · ${attribution.utm_source}`
    : 'Blue Collar Techy · Newsletter';
  try {
    const res = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GHL_API_KEY}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        locationId: env.GHL_LOCATION_ID,
        email,
        tags,
        source,
      }),
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

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid payload.' }, 400);
  }

  // Honeypot
  if (body.website && body.website.length > 0) {
    return json({ ok: true }, 200);
  }

  const email = (body.email || '').toString().trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid email.' }, 400);
  }

  if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
    return json({ error: 'Newsletter service is not configured.' }, 500);
  }

  const attribution = (body && body.attribution) || {};

  try {
    const result = await addToResendAudience(email, env);
    // Fire-and-forget GHL push
    pushToGhl(email, attribution, env).catch(() => {});

    return json({
      ok: true,
      already_subscribed: !!result.already_subscribed,
    }, 200);
  } catch (e) {
    console.error('[subscribe]', e.message);
    return json({ error: 'Subscription failed. Try again in a minute.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
