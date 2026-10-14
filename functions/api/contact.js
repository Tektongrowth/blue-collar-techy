/**
 * /api/contact — Blue Collar Techy "Work With Me" (Growth Systems Call) form
 *
 * POST JSON { name, email, business?, phone?, revenue?, trade?, interest?[], message, website?, hp? }
 * Upserts the lead into GHL (same GHL_API_KEY / GHL_LOCATION_ID the other BCT
 * functions use), tags it `bct-work-with-me`, and attaches the full request as a note.
 * Returns 502 if GHL rejects it so the page can show a fallback instead of a fake success.
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const bg = (p) => (context.waitUntil ? context.waitUntil(p) : p);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid payload.' }, 400);
  }

  // Honeypot
  if (body.hp) return json({ ok: true });

  const name = String(body.name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const message = String(body.message || '').trim().slice(0, 5000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) {
    return json({ error: 'Name, a valid email, and a message are required.' }, 400);
  }

  if (!env.GHL_API_KEY || !env.GHL_LOCATION_ID) {
    console.error('[contact] GHL not configured');
    return json({ error: 'Contact service is not configured.' }, 500);
  }

  const interests = Array.isArray(body.interest) ? body.interest.map(String).slice(0, 10) : [];
  const website = String(body.website || '').trim().slice(0, 300);
  const [firstName, ...rest] = name.split(/\s+/);
  const headers = {
    Authorization: `Bearer ${env.GHL_API_KEY}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      locationId: env.GHL_LOCATION_ID,
      firstName,
      lastName: rest.join(' '),
      email,
      phone: String(body.phone || '').trim().slice(0, 40),
      companyName: String(body.business || '').trim().slice(0, 200),
      website: /^https?:\/\//i.test(website) ? website : '',
      source: 'Blue Collar Techy · Work With Me',
      tags: ['bct-work-with-me', 'bct-growth-systems-call'],
    }),
  });

  if (!res.ok) {
    console.error('[contact] GHL upsert', res.status, (await res.text()).slice(0, 200));
    return json({ error: 'Could not submit right now.' }, 502);
  }

  const data = await res.json().catch(() => null);
  const contactId = data && data.contact && data.contact.id;
  if (contactId) {
    const note = [
      'Blue Collar Techy — Growth Systems Call request',
      `Business: ${body.business || '-'}`,
      `Phone: ${body.phone || '-'}`,
      `Revenue: ${body.revenue || '-'}`,
      `Trade: ${body.trade || '-'}`,
      `Interests: ${interests.join(', ') || '-'}`,
      `Website/GBP: ${website || '-'}`,
      '',
      message,
    ].join('\n');
    await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: note }),
    }).catch((e) => console.error('[contact] note', e.message));
  }

  bg(notifyLead(env, `Work With Me: ${name}${body.business ? ' / ' + body.business : ''}`, { Name: name, Email: email, Phone: body.phone, Business: body.business, Revenue: body.revenue, Trade: body.trade, Interests: interests.join(', '), Website: website, Message: message, GHL: contactId ? `https://app.gohighlevel.com/v2/location/${env.GHL_LOCATION_ID}/contacts/detail/${contactId}` : '' }));
  return json({ ok: true });
}

// Internal new-lead alert (Resend). Recipient: LEAD_NOTIFY_EMAIL || SCAN_NOTIFY_EMAIL || nick@tektongrowth.com
async function notifyLead(env, subject, fields) {
  if (!env.RESEND_API_KEY) return;
  const to = env.LEAD_NOTIFY_EMAIL || env.SCAN_NOTIFY_EMAIL || 'nick@tektongrowth.com';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rows = Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== '');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL || 'Blue Collar Techy <nick@bluecollartechy.com>',
        to: [to],
        reply_to: fields.Email || undefined,
        subject: `[BCT lead] ${subject}`,
        html: '<table>' + rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('') + '</table>',
        text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
      }),
    });
    if (!res.ok) console.error('[notify]', res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error('[notify]', e.message);
  }
}
