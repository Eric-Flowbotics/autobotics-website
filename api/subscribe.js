/* ==========================================================================
   /api/subscribe — the ONE shared write path for the site's email capture:
     • the Revenue Leak Score quiz   (source 'quiz' / 'quiz-results')
     • the native newsletter form    (source 'homepage' / 'about')

   Native fetch() from those pages  →  this serverless function  →
     1) Beehiiv  (PRIMARY — the list/gate; double opt-in + tags; success gates here)
     2) Airtable (BEST-EFFORT backup — first-party record; one retry + log):
          quiz                           → Leak Score Submissions
          quiz-results / homepage-road-ahead → Waitlist  (Interest: Community / Playbook / DFY)
          homepage/about                 → Contacts  (insert-if-absent Lead; never downgrades a row)

   Both API keys live ONLY here, as Vercel env vars — never in the browser:
     BEEHIIV_API_KEY            (already set)
     AIRTABLE_API_KEY           (the new PAT — server-side)
     BEEHIIV_PUBLICATION_ID     (optional override)
     AIRTABLE_BASE_ID           (optional; defaults to the Autobotics base)
     AIRTABLE_TABLE             (optional; defaults to "Leak Score Submissions")
     AIRTABLE_CONTACTS_TABLE    (optional; defaults to "Contacts" — native newsletter backup)

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
// Referenced by table ID (not name) so renaming the table in Airtable (Community Waitlist → Waitlist)
// never breaks this write. If AIRTABLE_WAITLIST_TABLE is ever set, use the table ID, not the name.
var WAITLIST_TABLE = process.env.AIRTABLE_WAITLIST_TABLE || 'tblKmfyAhXQqyT1gh';
var CONTACTS_TABLE = process.env.AIRTABLE_CONTACTS_TABLE || 'Contacts';

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
// Road-Ahead waitlist: interest key → Airtable "Interest" value and the Beehiiv interest tag.
// community-waitlist + dfy-waitlist already exist in Beehiiv; playbook-waitlist is new.
var INTEREST_LABEL = { community: 'Community', playbook: 'Playbook', dfy: 'DFY' };
var INTEREST_TAG = { community: 'community-waitlist', playbook: 'playbook-waitlist', dfy: 'dfy-waitlist' };

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

// ---- Best-effort UPSERT into the Waitlist table (its own table, NOT the completions log).
//      Serves both the quiz-results "join the community waitlist" bridge (Interest → Community)
//      and the homepage Road-Ahead "Get notified" cards (Interest → Community / Playbook / DFY).
//      Upsert key = Email + Interest, so one person can sit on more than one list without a later
//      interest overwriting an earlier one, while a repeat click on the SAME interest updates
//      rather than duplicates. Created is stamped on first insert and preserved on repeat clicks.
//      One retry; never throws — the Airtable write can never block the Beehiiv subscribe. ----
async function writeWaitlist(body) {
  var key = process.env.AIRTABLE_API_KEY;
  if (!key) { console.warn('[subscribe] AIRTABLE_API_KEY not set — skipping waitlist write.'); return { written: false, reason: 'no_key' }; }
  var email = str(body.email).trim().toLowerCase();
  if (!email) return { written: false, reason: 'no_email' };

  var interest = INTEREST_LABEL[body.interest] || 'Community'; // quiz-results bridge defaults to Community
  var base = AIRTABLE_API + '/' + AIRTABLE_BASE + '/' + encodeURIComponent(WAITLIST_TABLE);
  var headers = { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };
  var tradeLabel = TRADE_LABELS[body.trade] || str(body.trade);

  try {
    // Upsert key = Email + Interest (one row per person per list), so a repeat click updates, not duplicates.
    // Airtable formula string literals do NOT honor backslash escaping, so use a double-quote delimiter and
    // strip any double-quote from the address (same approach as writeContact) — an apostrophe address
    // (o'brien@…) must MATCH its existing row, not 422 and fall through to a duplicate POST. The Interest
    // half comes from a controlled map, so it is injection-safe.
    var formula = 'AND(LOWER({Email})="' + email.replace(/"/g, '') + '",{Interest}="' + interest + '")';
    var lookup = await fetch(base + '?maxRecords=1&filterByFormula=' + encodeURIComponent(formula), { headers: headers });
    var existingId = null;
    if (lookup.ok) { var lj = await lookup.json().catch(function () { return null; }); existingId = lj && lj.records && lj.records[0] && lj.records[0].id; }

    var fields = { Email: email, Interest: interest, Source: str(body.source) || 'quiz-results' };
    if (tradeLabel) fields.Trade = tradeLabel;
    if (str(body.first_name)) fields['First Name'] = str(body.first_name).slice(0, 100);
    if (str(body.note)) fields.Note = str(body.note).slice(0, 500);
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

// ---- Best-effort backup for the NATIVE newsletter form (source 'homepage'/'about').
//      Beehiiv is the source of truth; this only guarantees the lead is still captured in
//      Airtable's Contacts table if Beehiiv ever fails. INSERT-IF-ABSENT by Email: a person
//      already in the funnel (ebook / toolkit / blueprint …) is never downgraded or
//      duplicated. NOTE: Contacts."Created" is a computed createdTime field — we must NOT
//      send it (Airtable 422s on computed fields). One retry; never throws. ----
async function writeContact(body) {
  var key = process.env.AIRTABLE_API_KEY;
  if (!key) { console.warn('[subscribe] AIRTABLE_API_KEY not set — skipping Contacts backup.'); return { written: false, reason: 'no_key' }; }
  var email = str(body.email).toLowerCase();
  if (!email) return { written: false, reason: 'no_email' };

  var base = AIRTABLE_API + '/' + AIRTABLE_BASE + '/' + encodeURIComponent(CONTACTS_TABLE);
  var headers = { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };
  var SOURCE_LABEL = { homepage: 'Homepage', about: 'About' };
  var sourceLabel = SOURCE_LABEL[body.source] || 'website';

  try {
    // Look up by Email (case-insensitive). Use a DOUBLE-quoted formula literal: Airtable
    // formulas don't honor backslash escaping, so the common apostrophe-in-local-part
    // address ("o'neil@…") only matches with a double-quote delimiter; defensively drop any
    // double-quote so the literal itself can't break.
    var formula = 'LOWER({Email})="' + email.replace(/"/g, '') + '"';
    var lookup = await fetch(base + '?maxRecords=1&filterByFormula=' + encodeURIComponent(formula), { headers: headers });

    // Only INSERT when the lookup DEFINITIVELY succeeded and returned no match. On any
    // inconclusive read (non-2xx, parse failure) we skip the insert rather than risk a
    // duplicate row — the lead is already safe in Beehiiv (the source of truth).
    if (!lookup.ok) {
      var lt = ''; try { lt = await lookup.text(); } catch (e) {}
      console.error('[subscribe] Contacts lookup failed status=' + lookup.status + ' ' + lt.slice(0, 200) + ' — skipping insert to avoid a duplicate.');
      return { written: false, reason: 'lookup_failed' };
    }
    var lj = await lookup.json().catch(function () { return null; });
    if (!lj) { console.error('[subscribe] Contacts lookup parse failed — skipping insert.'); return { written: false, reason: 'lookup_parse_failed' }; }
    if (lj.records && lj.records[0]) return { written: true, status: lookup.status, action: 'exists' }; // already captured — leave the funnel row untouched

    // Confirmed-absent → insert a top-of-funnel Lead row. typecast lets a new 'About' Source pass.
    var fields = {
      Email: email,
      Source: sourceLabel,
      Status: 'Lead',
      Notes: 'Newsletter signup via native /api/subscribe form (source: ' + (str(body.source) || 'unknown') + ').'
    };
    var payload = { fields: fields, typecast: true };
    for (var attempt = 1; attempt <= 2; attempt++) {
      var res = await fetch(base, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
      if (res.ok) return { written: true, status: res.status, action: 'created' };
      var txt = ''; try { txt = await res.text(); } catch (e) {}
      console.error('[subscribe] Contacts insert failed (attempt ' + attempt + ') status=' + res.status + ' ' + txt.slice(0, 300));
      if (res.status < 500 && res.status !== 429) break; // 4xx (bad field) won't fix on retry
    }
  } catch (err) {
    console.error('[subscribe] Contacts write error:', err && err.message);
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

  // The single write path branches by event:
  //   quiz           → full record to Leak Score Submissions (one row per quiz)
  //   quiz-results   → upsert the Community Waitlist row
  //   homepage/about → native newsletter form: Beehiiv 'newsletter' tag + Contacts backup
  var isSubmission = body.source === 'quiz';
  var isWaitlist = body.source === 'quiz-results';
  var isRoadAhead = body.source === 'homepage-road-ahead'; // homepage Road-Ahead "Get notified" cards
  var isNewsletter = body.source === 'homepage' || body.source === 'about';

  // Build the tag set — trust the client's tags but also rebuild from the structured fields so a
  // tampered/empty array still segments correctly. Source-aware: a Road-Ahead signup can carry a
  // trade, so guard the 'quiz' tag to genuine quiz traffic and add the interest waitlist tag.
  var derived = [];
  var isQuizFamily = body.source === 'quiz' || body.source === 'quiz-results';
  if (isQuizFamily || (!isNewsletter && !isRoadAhead && (body.trade || body.leak))) derived.push('quiz');
  if (isNewsletter || isRoadAhead) derived.push('newsletter');                                  // both join the weekly Edge
  if (isRoadAhead && INTEREST_TAG[body.interest]) derived.push(INTEREST_TAG[body.interest]);    // community-/playbook-/dfy-waitlist
  if (body.trade) derived.push('trade:' + String(body.trade).toLowerCase());
  if (body.leak && body.leak !== 'none') derived.push('leak:' + String(body.leak).toLowerCase());
  var rawTags = Array.isArray(body.tags) ? body.tags.slice(0, 50) : [];
  var tags = sanitizeTags(derived.concat(rawTags));

  var apiKey = process.env.BEEHIIV_API_KEY;

  // No Beehiiv key — keep the original 200 envelope (so the quiz's client-side unlock and the
  // waitlist's `j.waitlist` success check are unchanged), but success:false so the native
  // newsletter form still shows its error state (it reads res.ok && j.success). Log loudly and
  // still attempt the best-effort Airtable backups so the lead is captured.
  if (!apiKey) {
    console.error('[subscribe] BEEHIIV_API_KEY not set — cannot add to the list:', email, tags.join(','));
    var aOnly = isSubmission ? await writeAirtable(body, tags) : { written: false };
    var wOnly = (isWaitlist || isRoadAhead) ? await writeWaitlist(body) : { written: false };
    var cOnly = isNewsletter ? await writeContact(body) : { written: false };  // still capture the lead
    return res.status(200).json({ success: isRoadAhead ? true : false, beehiivOk: false, configured: false, airtable: aOnly.written, waitlist: wOnly.written, contact: cOnly.written });
  }

  var beehiivResult = { success: false, beehiivOk: false };
  // List-like sources (native newsletter + Road-Ahead waitlist) join the weekly Edge and share
  // website-style utm defaults; the quiz keeps its leak-score attribution.
  var listLike = isNewsletter || isRoadAhead;
  try {
    var createBody = {
      email: email,
      reactivate_existing: true,
      send_welcome_email: false,        // welcome handled in Beehiiv (repointed to /leak-score)
      double_opt_override: 'on',        // double opt-in preserved
      // Source-aware defaults so a native subscribe is never mislabeled as the quiz if the
      // form ever omits utm (the homepage/about/road-ahead forms do send these explicitly).
      utm_source: body.utm_source || (listLike ? (body.source || 'newsletter') : 'leak-score-quiz'),
      utm_medium: body.utm_medium || (listLike ? 'website' : 'quiz'),
      utm_campaign: body.utm_campaign || (listLike ? 'newsletter' : 'revenue-leak-score')
    };
    // Beehiiv's create-subscription endpoint accepts only utm_source / utm_medium /
    // utm_campaign (+ referring_site). Forwarding utm_content or utm_term makes Beehiiv
    // REJECT the create (→ no subscription id → our 502). That is exactly why the native
    // newsletter form failed while the quiz worked: the form is the first caller to send a
    // NON-EMPTY utm_content, whereas the quiz sends '' (which these guards dropped). We still
    // keep utm_content/term in the Airtable record below — just never on the Beehiiv call.
    if (body.referring_site) createBody.referring_site = String(body.referring_site).slice(0, 255);

    var created = await beehiiv('/publications/' + PUBLICATION_ID + '/subscriptions', 'POST', apiKey, createBody);
    var createData = created.json && created.json.data;
    var subId = (createData && createData.id) || null;
    var status = (createData && createData.status) || null;

    // beehiivOk = the create call itself genuinely returned a created/updated subscriber. This is the
    // HONEST signal: a subId resolved only via the by_email fallback below does NOT flip it true — that
    // recycled/suppressed-address case is exactly the silent miss we must surface (a row was written and
    // the user saw success, but no Beehiiv subscriber was created).
    var beehiivOk = !!(created.ok && subId);

    if (!beehiivOk) {
      console.error('[subscribe] Beehiiv subscribe MISS — status=' + created.status +
        ' body=' + (created.json ? JSON.stringify(created.json).slice(0, 500) : '(no body)') +
        ' email=' + email + ' source=' + (str(body.source) || 'unknown') + ' interest=' + (str(body.interest) || 'n/a'));
      // Best-effort: the subscriber may already exist — resolve an id so we can still apply the tags.
      var found = await beehiiv('/publications/' + PUBLICATION_ID + '/subscriptions/by_email/' + encodeURIComponent(email), 'GET', apiKey);
      subId = subId || (found.json && found.json.data && found.json.data.id) || null;
      status = status || (found.json && found.json.data && found.json.data.status) || null;
    }

    var tagged = false;
    if (subId && tags.length) {
      var t = await beehiiv('/publications/' + PUBLICATION_ID + '/subscriptions/' + subId + '/tags', 'POST', apiKey, { tags: tags });
      tagged = t.ok;
      if (!t.ok) console.error('[subscribe] Beehiiv tagging failed — status=' + t.status + ' body=' + JSON.stringify(t.json) + ' email=' + email);
    }
    beehiivResult = { success: !!subId, beehiivOk: beehiivOk, status: status || 'pending', tagged: tagged, tags: tags };
  } catch (err) {
    console.error('[subscribe] Beehiiv error:', err && err.message,
      '— email=' + email + ' source=' + (str(body.source) || 'unknown') + ' interest=' + (str(body.interest) || 'n/a'));
    beehiivResult = { success: false, beehiivOk: false, error: 'exception' };
  }

  // Best-effort data writes — awaited so they run, but never able to change the outcome
  // the front end / Beehiiv saw. A completed quiz writes the full Leak Score Submissions
  // row; a waitlist click (quiz-results or Road-Ahead) upserts the Waitlist row. Failures are logged only.
  var airtable = { written: false }, waitlistRes = { written: false }, contactRes = { written: false };
  if (isSubmission) {
    try { airtable = await writeAirtable(body, tags); } catch (e) { console.error('[subscribe] airtable wrapper error', e && e.message); }
  }
  if (isWaitlist || isRoadAhead) {
    try { waitlistRes = await writeWaitlist(body); } catch (e) { console.error('[subscribe] waitlist wrapper error', e && e.message); }
  }
  if (isNewsletter) {
    try { contactRes = await writeContact(body); } catch (e) { console.error('[subscribe] contact wrapper error', e && e.message); }
  }

  // User-facing success vs the honest Beehiiv signal:
  //  • Road-Ahead waitlist: NEVER fail the user on a Beehiiv miss — the Airtable row captured the lead
  //    and we follow up by hand — so success stays true; beehiivOk:false (logged) surfaces the miss.
  //  • Newsletter / quiz: unchanged — Beehiiv is the source of truth; a miss returns 502 (no false success).
  var userSuccess = isRoadAhead ? true : beehiivResult.success;
  if (!beehiivResult.beehiivOk) {
    console.error('[subscribe] Beehiiv NOT confirmed (beehiivOk=false) — source=' + (str(body.source) || 'unknown') +
      ' email=' + email + ' interest=' + (str(body.interest) || 'n/a') +
      ' userSuccess=' + userSuccess + ' waitlistWritten=' + waitlistRes.written);
  }
  var code = userSuccess ? 200 : 502;
  var payload = Object.assign({}, beehiivResult, {
    success: userSuccess,
    beehiivOk: !!beehiivResult.beehiivOk,
    airtable: airtable.written, waitlist: waitlistRes.written, contact: contactRes.written
  });
  if (userSuccess && payload.error) delete payload.error;   // don't ship a contradictory success:true + error
  return res.status(code).json(payload);
};
