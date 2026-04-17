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

async function pushToGhl(email, env) {
  if (!env.GHL_API_KEY || !env.GHL_LOCATION_ID) return null;
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
        tags: ['bct-newsletter'],
        source: 'Blue Collar Techy · Newsletter',
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

  try {
    const result = await addToResendAudience(email, env);
    // Fire-and-forget GHL push
    pushToGhl(email, env).catch(() => {});

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
