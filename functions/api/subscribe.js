/**
 * /api/subscribe — Blue Collar Techy newsletter + lead magnet delivery
 *
 * POST { email, website?, source?, attribution? }
 *   ↓
 * 1. Validate email + honeypot check
 * 2. Add contact to Resend Audience
 * 3. If source matches a lead magnet, send delivery email with PDF attached
 * 4. Optionally push to GHL with attribution tags
 * 5. Return { ok }
 *
 * Required env vars:
 *   RESEND_API_KEY, RESEND_AUDIENCE_ID
 * Optional:
 *   RESEND_FROM_EMAIL (default 'Nick Conley <nick@bluecollartechy.com>')
 *   GHL_API_KEY, GHL_LOCATION_ID — mirror subscribers into GHL as contacts
 */

// Lead magnet catalog. Add new entries here to enable PDF delivery for a new resource.
const LEAD_MAGNETS = {
  'crew-cheat-sheet': {
    pdf_url: 'https://bluecollartechy.com/resources/crew-cheat-sheet/crew-cheat-sheet.pdf',
    pdf_filename: 'crew-review-cheat-sheet.pdf',
    subject: 'Your crew review cheat sheet (attached)',
    html: `
      <p>Thanks for grabbing the crew cheat sheet.</p>
      <p>Attached is the printable 2-page PDF — front is the scripts + owner/crew/office roles, back is the Google-compliant crew bonus structure and a weekly checklist.</p>
      <p>How I'd use it:</p>
      <ul>
        <li>Print it, laminate the front side, tape it to the shop wall or stick it in the job-site binder.</li>
        <li>Run a 10-minute crew meeting this week. Walk through the three moments. Tell them about the bonus.</li>
        <li>Set a reminder for 30 days from now to count reviews landed and cut the first check.</li>
      </ul>
      <p>If you're running this in a CRM, the full GoHighLevel automation walkthrough is coming to the blog and YouTube channel. You're on the list for that too.</p>
      <p>Nick</p>
      <p style="font-size:12px;color:#666;">Blue Collar Techy — practical tech for the trades. <a href="https://bluecollartechy.com">bluecollartechy.com</a></p>
    `,
    text: `Thanks for grabbing the crew cheat sheet.

Attached is the printable 2-page PDF. Front is the scripts + owner/crew/office roles, back is the Google-compliant crew bonus structure and a weekly checklist.

How I'd use it:
- Print it, laminate the front side, tape it to the shop wall or stick it in the job-site binder.
- Run a 10-minute crew meeting this week. Walk through the three moments. Tell them about the bonus.
- Set a reminder for 30 days from now to count reviews landed and cut the first check.

If you're running this in a CRM, the full GoHighLevel automation walkthrough is coming to the blog and YouTube channel. You're on the list for that too.

Nick
Blue Collar Techy — practical tech for the trades
https://bluecollartechy.com
`,
  },
};

async function addToResendAudience(email, env) {
  const res = await fetch(`https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, unsubscribed: false }),
  });
  if (res.status === 409) return { already_subscribed: true };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend audience HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function sendLeadMagnetEmail(email, magnet, env) {
  // Fetch the PDF and convert to base64 (Resend's attachment format)
  let attachment = null;
  try {
    const pdfRes = await fetch(magnet.pdf_url);
    if (pdfRes.ok) {
      const buf = await pdfRes.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      attachment = {
        filename: magnet.pdf_filename,
        content: btoa(binary),
      };
    }
  } catch (err) {
    console.error('[subscribe] PDF fetch failed:', err.message);
  }

  const from = env.RESEND_FROM_EMAIL || 'Nick Conley <nick@bluecollartechy.com>';
  const payload = {
    from,
    to: [email],
    subject: magnet.subject,
    html: magnet.html,
    text: magnet.text,
  };
  if (attachment) payload.attachments = [attachment];

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend send HTTP ${res.status}: ${text.slice(0, 200)}`);
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

function buildAttributionTags(a, source) {
  const tags = [];
  if (source) tags.push(slugTag('resource', source));
  if (!a || typeof a !== 'object') return tags.filter(Boolean);
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

async function pushToGhl(email, attribution, source, env) {
  if (!env.GHL_API_KEY || !env.GHL_LOCATION_ID) return null;
  const tags = ['bct-newsletter', ...buildAttributionTags(attribution, source)];
  const sourceLabel = source
    ? `BCT Resource · ${source}`
    : (attribution && attribution.utm_source)
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
        source: sourceLabel,
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
  const source = (body && body.source) ? String(body.source).trim() : null;
  const magnet = source && LEAD_MAGNETS[source];

  try {
    const result = await addToResendAudience(email, env);

    // Fire lead magnet delivery email if source matches a catalog entry
    if (magnet) {
      sendLeadMagnetEmail(email, magnet, env).catch(err => {
        console.error('[subscribe] lead magnet send failed:', err.message);
      });
    }

    // Fire-and-forget GHL push
    pushToGhl(email, attribution, source, env).catch(() => {});

    return json({
      ok: true,
      already_subscribed: !!result.already_subscribed,
      delivery: magnet ? 'email' : 'none',
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
