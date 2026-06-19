/* ==========================================================================
   /api/subscribe — the ONE write path for the Revenue Leak Score quiz.

   Native fetch() from /leak-score/results  →  this serverless function  →
     1) Beehiiv  (PRIMARY — the gate unlocks on this; double opt-in + tags)
     2) Airtable (BEST-EFFORT — full first-party record; one retry + log)

   Both API keys live ONLY here, as Vercel env vars — never in the browser:
     BEEHIIV_API_KEY            (already set)
     AIRTABLE_API_KEY           (the new PAT — server-side)
     BEEHIIV_PUBLICATION_ID     (optional override)
     AIRTABLE_BASE_ID           (optional; defaults to the Autobotics base)
     AIRTABLE_TABLE             (optional; defaults to "Leak Score Submissions")

   FAILURE RULE (spec §11): the Airtable write must NEVER block or fail the
   Beehiiv subscribe. A data-write hiccup never costs us the lead. The Airtable
   call is awaited (so it runs on the serverless instance) but its result never
   changes the response — Beehiiv is the source of truth for success.

   No npm dependencies — uses the global fetch in the Vercel Node runtime.
   ========================================================================== */

var BEEHIIV_API = 'https://api.beehiiv.com/v2';
var AIRTABLE_API = 'https://api.airtable.com/v0';
var PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID || 'pub_03c86483-4f76-4b5f-bbf5-78e094b3c599';
var AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID || 'appyyjGuoyHBGQGW6';
var AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || 'Leak Score Submissions';
var WAITLIST_TABLE = process.env.AIRTABLE_WAITLIST_TABLE || 'Community Waitlist';

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Stage order for the per-stage score/leak columns (matches the engine + table).
var STAGE_ORDER = [
  ['lead_capture',  'Lead Capture'],
  ['qualification', 'Qualification'],
  ['quoting',       'Quoting'],
  ['scheduling',    'Scheduling'],
  ['delivery',      'Delivery'],
  ['invoicing',     'Invoicing'],
  ['reviews',       'Reviews'],
  ['retention',     'Retention']
];
var TRADE_LABELS = {
  cleaning: 'Residential Cleaning', landscaping: 'Landscaping & Lawn', hvac: 'HVAC',
  plumbing: 'Plumbing', handyman: 'Handyman', electrical: 'Electrical',
  pest: 'Pest Control', painting: 'Painting', other: 'Other Home Service'
};

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
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return req.body;
}

function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function str(v) { return (v == null) ? '' : String(v); }

async function beehiiv(path, method, apiKey, body) {
  var res = await fetch(BEEHIIV_API + path, {
    method: method,
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  var json = null; try { json = await res.json(); } catch (e) { json = null; }
  return { ok: res.ok, status: res.status, json: json };
}

// ---- Best-effort Airtable write. Returns {written, status} — NEVER throws. ----
async function writeAirtable(body, tags) {
  var key = process.env.AIRTABLE_API_KEY;
  if (!key) { console.warn('[subscribe] AIRTABLE_API_KEY not set — skipping data write (Beehiiv unaffected).'); return { written: false, reason: 'no_key' }; }

  // Map the submission payload → Airtable fields. Unknown/empty fields are dropped.
  var fields = {};
  function set(name, val) { if (val !== '' && val !== null && val !== undefined) fields[name] = val; }

  set('Email', str(body.email).toLowerCase());
  // Only mark consent when the newsletter gate was actually accepted — the
  // community-waitlist path posts no consent flag and must not read as opted-in.
  set('Consent Newsletter', body.consent_newsletter === true);
  set('Source', str(body.source) || 'quiz');
  set('Trade', TRADE_LABELS[body.trade] || str(body.trade));
  set('Weight Preset', str(body.weight_preset));
  set('Revenue Band', str(body.revenue_band));
  set('Team Size', str(body.team_size));
  set('Jobs Per Week', str(body.jobs_per_week));

  // Answers q1..q12 — "label · score"
  var answers = body.answers || {};
  for (var i = 1; i <= 12; i++) {
    var a = answers['q' + i];
    if (a && a.label) set('Q' + i, a.label + (a.score != null ? ' · ' + a.score : ''));
  }

  // Per-stage scores + leaks, and the totals.
  var ss = body.stage_scores || {}, sl = body.stage_leaks || {};
  STAGE_ORDER.forEach(function (pair) {
    var id = pair[0], label = pair[1];
    if (num(ss[id]) !== null) set('Score: ' + label, ss[id]);
    if (num(sl[id]) !== null) set('Leak: ' + label, sl[id]);
  });
  set('Total Score', num(body.total_score));
  set('Total Leak', num(body.total_leak));
  set('Badge', str(body.badge));
  set('Leak Rank 1', str(body.leak_rank_1));
  set('Leak Rank 2', str(body.leak_rank_2));
  set('Leak Rank 3', str(body.leak_rank_3));

  // Behaviour + attribution.
  set('Completed', body.completed !== false);
  set('Last Question Reached', num(body.last_question_reached));
  set('Time To Complete (sec)', num(body.time_to_complete_sec));
  set('Device', str(body.device));
  set('UTM Source', str(body.utm_source));
  set('UTM Medium', str(body.utm_medium));
  set('UTM Campaign', str(body.utm_campaign));
  set('UTM Content', str(body.utm_content));
  set('Referring Site', str(body.referring_site).slice(0, 255));

  var url = AIRTABLE_API + '/' + AIRTABLE_BASE + '/' + encodeURIComponent(AIRTABLE_TABLE);
  var payload = { fields: fields, typecast: true }; // typecast lets new single-select values pass

  // One try + one retry (spec §11). Any failure is logged, never thrown.
  for (var attempt = 1; attempt <= 2; attempt++) {
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return { written: true, status: res.status };
      var txt = ''; try { txt = await res.text(); } catch (e) {}
      console.error('[subscribe] Airtable write failed (attempt ' + attempt + ') status=' + res.status + ' ' + txt.slice(0, 300));
      if (res.status < 500 && res.status !== 429) break; // 4xx (bad field) won't fix on retry
    } catch (err) {
      console.error('[subscribe] Airtable write error (attempt ' + attempt + '):', err && err.message);
    }
  }
  return { written: false, reason: 'write_failed' };
}

// ---- Best-effort UPSERT (by Email) into the Community Waitlist table — its own table,
//      NOT the completions log. Created is set on first insert and preserved on repeat
//      clicks (a repeat is a PATCH that doesn't touch Created). One retry; never throws. ----
async function writeWaitlist(body) {
  var key = process.env.AIRTABLE_API_KEY;
  if (!key) { console.warn('[subscribe] AIRTABLE_API_KEY not set — skipping waitlist write.'); return { written: false, reason: 'no_key' }; }
  var email = str(body.email).toLowerCase();
  if (!email) return { written: false, reason: 'no_email' };

  var base = AIRTABLE_API + '/' + AIRTABLE_BASE + '/' + encodeURIComponent(WAITLIST_TABLE);
  var headers = { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };
  var tradeLabel = TRADE_LABELS[body.trade] || str(body.trade);

  try {
    // Find an existing row by Email (the upsert key) so a repeat click updates, not duplicates.
    var formula = "LOWER({Email})='" + email.replace(/'/g, "\\'") + "'";
    var lookup = await fetch(base + '?maxRecords=1&filterByFormula=' + encodeURIComponent(formula), { headers: headers });
    var existingId = null;
    if (lookup.ok) { var lj = await lookup.json().catch(function () { return null; }); existingId = lj && lj.records && lj.records[0] && lj.records[0].id; }

    var fields = { Email: email, Source: str(body.source) || 'quiz-results' };
    if (tradeLabel) fields.Trade = tradeLabel;
    var method, url;
    if (existingId) { method = 'PATCH'; url = base + '/' + existingId; }          // update — keep the original Created
    else { fields.Created = new Date().toISOString(); method = 'POST'; url = base; } // new — stamp Created

    var payload = { fields: fields, typecast: true };
    for (var attempt = 1; attempt <= 2; attempt++) {
      var res = await fetch(url, { method: method, headers: headers, body: JSON.stringify(payload) });
      if (res.ok) return { written: true, status: res.status, action: existingId ? 'updated' : 'created' };
      var txt = ''; try { txt = await res.text(); } catch (e) {}
      console.error('[subscribe] Waitlist ' + method + ' failed (attempt ' + attempt + ') status=' + res.status + ' ' + txt.slice(0, 300));
      if (res.status < 500 && res.status !== 429) break;
    }
  } catch (err) {
    console.error('[subscribe] Waitlist write error:', err && err.message);
  }
  return { written: false, reason: 'write_failed' };
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

  // Build the tag set — trust the client's tags but also rebuild from the
  // structured fields so a tampered/empty array still segments correctly.
  var derived = [];
  if (body.source === 'quiz' || body.trade || body.leak) derived.push('quiz');
  if (body.trade) derived.push('trade:' + String(body.trade).toLowerCase());
  if (body.leak && body.leak !== 'none') derived.push('leak:' + String(body.leak).toLowerCase());
  var rawTags = Array.isArray(body.tags) ? body.tags.slice(0, 50) : [];
  var tags = sanitizeTags(derived.concat(rawTags));

  // The single write path branches by event: a COMPLETED-QUIZ submission (source 'quiz')
  // writes the full record to Leak Score Submissions (one row per quiz); the community-
  // waitlist click (source 'quiz-results') upserts its own Community Waitlist row.
  var isSubmission = body.source === 'quiz';
  var isWaitlist = body.source === 'quiz-results';

  var apiKey = process.env.BEEHIIV_API_KEY;

  // No Beehiiv key yet — return 200 so the (already-unlocked) front end is never
  // blocked, but still attempt the best-effort Airtable record and log for ops.
  if (!apiKey) {
    console.warn('[subscribe] BEEHIIV_API_KEY not set — not subscribed:', email, tags.join(','));
    var aOnly = isSubmission ? await writeAirtable(body, tags) : { written: false };
    var wOnly = isWaitlist ? await writeWaitlist(body) : { written: false };
    return res.status(200).json({ success: false, configured: false, airtable: aOnly.written, waitlist: wOnly.written });
  }

  var beehiivResult = { success: false };
  try {
    var createBody = {
      email: email,
      reactivate_existing: true,
      send_welcome_email: false,        // welcome handled in Beehiiv (repointed to /leak-score)
      double_opt_override: 'on',        // double opt-in preserved
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

    if (!subId) {
      var found = await beehiiv('/publications/' + PUBLICATION_ID + '/subscriptions/by_email/' + encodeURIComponent(email), 'GET', apiKey);
      subId = found.json && found.json.data && found.json.data.id;
      status = (found.json && found.json.data && found.json.data.status) || status;
    }

    var tagged = false;
    if (subId && tags.length) {
      var t = await beehiiv('/publications/' + PUBLICATION_ID + '/subscriptions/' + subId + '/tags', 'POST', apiKey, { tags: tags });
      tagged = t.ok;
      if (!t.ok) console.error('[subscribe] tagging failed', t.status, JSON.stringify(t.json));
    }
    beehiivResult = subId
      ? { success: true, status: status || 'pending', tagged: tagged, tags: tags }
      : { success: false, error: 'subscribe_failed', status: created.status };
    if (!subId) console.error('[subscribe] could not resolve subscription id', created.status, JSON.stringify(created.json));
  } catch (err) {
    console.error('[subscribe] Beehiiv error:', err && err.message);
    beehiivResult = { success: false, error: 'exception' };
  }

  // Best-effort data writes — awaited so they run, but never able to change the outcome
  // the front end / Beehiiv saw. A completed quiz writes the full Leak Score Submissions
  // row; the waitlist click upserts the Community Waitlist row. Failures are logged only.
  var airtable = { written: false }, waitlistRes = { written: false };
  if (isSubmission) {
    try { airtable = await writeAirtable(body, tags); } catch (e) { console.error('[subscribe] airtable wrapper error', e && e.message); }
  }
  if (isWaitlist) {
    try { waitlistRes = await writeWaitlist(body); } catch (e) { console.error('[subscribe] waitlist wrapper error', e && e.message); }
  }

  var code = beehiivResult.success ? 200 : 502;
  return res.status(code).json(Object.assign({}, beehiivResult, { airtable: airtable.written, waitlist: waitlistRes.written }));
};
