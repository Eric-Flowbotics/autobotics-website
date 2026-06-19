/* ==========================================================================
   /api/subscribe — Beehiiv capture for the Revenue Leak Score quiz.

   Native <form> on /leak-score  →  this serverless function  →  Beehiiv API.
   The Beehiiv API key is held ONLY here, as a Vercel env var (never client-side).

   Flow:
     1. POST  /v2/publications/{pubId}/subscriptions   (double opt-in + UTM)
     2. POST  /v2/publications/{pubId}/subscriptions/{subId}/tags   (quiz, trade:X, leak:Y)
        — Beehiiv auto-creates any tag that doesn't exist yet.

   Double opt-in is preserved (double_opt_override:"on") → the subscriber lands
   "pending" and must confirm via Beehiiv's email. No welcome email is triggered
   here (send_welcome_email:false) — the welcome-email CTA is being repointed in a
   later pass and must not fire at the old /toolkit URL.

   No npm dependencies — uses the global fetch built into the Vercel Node runtime.
   ========================================================================== */

var BEEHIIV_API = 'https://api.beehiiv.com/v2';
// Pub can be overridden by env, but defaults to "The Home Service Edge".
var PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID || 'pub_03c86483-4f76-4b5f-bbf5-78e094b3c599';

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Keep tags sane: lowercase-ish slugs/labels, deduped, capped.
function sanitizeTags(list) {
  var out = [];
  (list || []).forEach(function (t) {
    if (typeof t !== 'string') return;
    var v = t.trim().slice(0, 48);
    if (v && out.indexOf(v) === -1) out.push(v);
  });
  return out.slice(0, 12);
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return req.body;
}

async function beehiiv(path, method, apiKey, body) {
  var res = await fetch(BEEHIIV_API + path, {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  var json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  return { ok: res.ok, status: res.status, json: json };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var body = readBody(req);

  // Honeypot — bots fill the hidden "website" field; humans never do.
  if (body.website) return res.status(200).json({ success: true });

  var email = (body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, error: 'A valid email is required.' });
  }

  // Build the tag set. Trust the client's tags but also rebuild from the
  // structured fields so a tampered/empty array still segments correctly.
  var derived = [];
  if (body.source === 'quiz' || body.trade || body.leak) derived.push('quiz');
  if (body.trade) derived.push('trade:' + String(body.trade).toLowerCase());
  if (body.leak && body.leak !== 'none') derived.push('leak:' + String(body.leak).toLowerCase());
  var rawTags = Array.isArray(body.tags) ? body.tags.slice(0, 50) : [];
  var tags = sanitizeTags(derived.concat(rawTags));

  var apiKey = process.env.BEEHIIV_API_KEY;

  // Not configured yet (key created in Beehiiv + pasted into Vercel later).
  // Return 200 so the front-end loop is never blocked; log loudly for ops.
  if (!apiKey) {
    console.warn('[subscribe] BEEHIIV_API_KEY is not set — not subscribed:', email, tags.join(','));
    return res.status(503).json({ success: false, configured: false, message: 'BEEHIIV_API_KEY not set in Vercel env.' });
  }

  try {
    // 1) Create (or reactivate) the subscription with double opt-in + UTM.
    var createBody = {
      email: email,
      reactivate_existing: true,
      send_welcome_email: false,
      double_opt_override: 'on',
      utm_source: body.utm_source || 'leak-score-quiz',
      utm_medium: body.utm_medium || 'quiz',
      utm_campaign: body.utm_campaign || 'revenue-leak-score'
    };
    if (body.utm_term) createBody.utm_term = body.utm_term;
    if (body.utm_content) createBody.utm_content = body.utm_content;
    if (body.referring_site) createBody.referring_site = String(body.referring_site).slice(0, 255);

    var created = await beehiiv('/publications/' + PUBLICATION_ID + '/subscriptions', 'POST', apiKey, createBody);
    var subId = created.json && created.json.data && created.json.data.id;
    var status = created.json && created.json.data && created.json.data.status;

    // Already-subscribed or any path where we didn't get an id back → look it up.
    if (!subId) {
      var found = await beehiiv('/publications/' + PUBLICATION_ID + '/subscriptions/by_email/' + encodeURIComponent(email), 'GET', apiKey);
      subId = found.json && found.json.data && found.json.data.id;
      status = (found.json && found.json.data && found.json.data.status) || status;
      if (!subId) {
        console.error('[subscribe] could not resolve subscription id', created.status, JSON.stringify(created.json));
        return res.status(502).json({ success: false, error: 'subscribe_failed' });
      }
    }

    // 2) Attach tags (quiz, trade:X, leak:Y, community-waitlist…). Auto-created if new.
    var tagged = false;
    if (tags.length) {
      var t = await beehiiv('/publications/' + PUBLICATION_ID + '/subscriptions/' + subId + '/tags', 'POST', apiKey, { tags: tags });
      tagged = t.ok;
      if (!t.ok) console.error('[subscribe] tagging failed', t.status, JSON.stringify(t.json));
    }

    return res.status(200).json({ success: true, status: status || 'pending', tagged: tagged, tags: tags });
  } catch (err) {
    console.error('[subscribe] error:', err && err.message);
    return res.status(502).json({ success: false, error: 'exception' });
  }
};
