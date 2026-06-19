/* ==========================================================================
   Revenue Leak Score — shared scoring engine
   Used by /leak-score (quiz) and /leak-score/results (breakdown + scorecard).

   Pure vanilla JS, no dependencies, no build step. Exposes window.LeakScore.

   Built to the Revenue Leak Score Build-Ready Spec (2026-06-19):
     - Questions / answer options / scores / leak-multipliers come from the
       math-validated Data Engine V2 §4. The ONLY deviation: the best ("clean")
       option in every question is set to multiplier 0.00 so a clean stage adds
       ~$0 to the live counter (spec §5 "money found so far" guardrail) and the
       all-green edge case (§5) and Profile C range (§13) both hold. Worst/middle
       multipliers are unchanged from Data Engine V2.
     - Subtexts are the §3-verified / §4-corrected versions (cut stats removed).
     - The dollar figures are directional estimates, never promised recovery.
   ========================================================================== */
(function (root) {
  'use strict';

  // ---- The canonical share URL. NEVER the preview/Vercel origin (bug-fix §12.1). ----
  var SHARE_URL = 'https://theautobotics.com/leak-score?utm_source=share&utm_medium=social&utm_campaign=leak-score';

  // ---- Trades — all 9 selectable (spec §2/§4). category drives the weight preset. ----
  var BUSINESS_TYPES = [
    { id: 'cleaning',    label: 'Residential Cleaning', icon: '🧹', category: 'recurring' },
    { id: 'landscaping', label: 'Landscaping & Lawn',   icon: '🌿', category: 'recurring' },
    { id: 'hvac',        label: 'HVAC',                  icon: '❄️', category: 'emergency' },
    { id: 'plumbing',    label: 'Plumbing',              icon: '🚰', category: 'emergency' },
    { id: 'handyman',    label: 'Handyman',              icon: '🔨', category: 'project'   },
    { id: 'electrical',  label: 'Electrical',            icon: '⚡', category: 'project'   },
    { id: 'pest',        label: 'Pest Control',          icon: '🐛', category: 'recurring' },
    { id: 'painting',    label: 'Painting',              icon: '🎨', category: 'project'   },
    { id: 'other',       label: 'Other Home Service',    icon: '🏠', category: 'project'   }
  ];

  // Field Reports exist only for these 5 anchored trades (spec §7). Others skip the card.
  var FIELD_REPORT_TRADES = ['cleaning', 'landscaping', 'hvac', 'plumbing', 'handyman'];

  // Master switch for the results-page "Read the [Trade] Field Report" bridge.
  // Off for launch (don't surface a CTA to content we're not linking yet); flip to
  // true to re-enable the card for the 5 anchored trades — one-liner. The bridge
  // markup + FIELD_REPORT_TRADES stay intact regardless.
  var FIELD_REPORTS_LIVE = false;

  // ---- /learn clusters that are actually LIVE on-site. Empty for now — no /learn
  //      routes exist yet, so every /learn link is omitted (never ship a 404, spec §6).
  //      Flip a slug to true here the day its cluster publishes; the link enables itself. ----
  var LEARN_LIVE = {
    // 'answering-calls/missed-call-text-back': true,
    // 'quoting/quote-follow-up': true,
    // 'reviews/review-requests': true,
    // 'scheduling/online-booking': true,
    // 'invoicing/same-day-invoicing': true
  };

  var REVENUE_OPTIONS = [
    { label: 'Under $50K',    value: 35000,  band: 'Under $50K'   },
    { label: '$50K – $100K',  value: 75000,  band: '$50K-$100K'   },
    { label: '$100K – $200K', value: 150000, band: '$100K-$200K'  },
    { label: '$200K – $300K', value: 250000, band: '$200K-$300K'  },
    { label: 'Over $300K',    value: 350000, band: 'Over $300K'   }
  ];

  // Collected for the profile + Airtable (spec §4/§11). Not used in the leak math.
  var TEAM_OPTIONS = [
    { label: 'Just me',        value: 1   },
    { label: '2–3 people',     value: 2.5 },
    { label: '4–6 people',     value: 5   },
    { label: '7–10 people',    value: 8.5 },
    { label: 'More than 10',   value: 12  }
  ];
  var JOBS_OPTIONS = [
    { label: '1–5',          value: 3  },
    { label: '6–10',         value: 8  },
    { label: '11–20',        value: 15 },
    { label: '21–40',        value: 30 },
    { label: 'More than 40', value: 50 }
  ];

  // Data Engine V2 §2 — three presets, each sums to 1.00.
  var STAGE_WEIGHTS = {
    recurring: { lead_capture: 0.28, qualification: 0.06, quoting: 0.18, scheduling: 0.05, delivery: 0.05, invoicing: 0.12, reviews: 0.12, retention: 0.14 },
    project:   { lead_capture: 0.25, qualification: 0.08, quoting: 0.20, scheduling: 0.06, delivery: 0.06, invoicing: 0.14, reviews: 0.10, retention: 0.11 },
    emergency: { lead_capture: 0.22, qualification: 0.10, quoting: 0.18, scheduling: 0.05, delivery: 0.06, invoicing: 0.16, reviews: 0.10, retention: 0.13 }
  };

  var STAGES = [
    { id: 'lead_capture',  label: 'Lead Capture',  questionIds: ['q1', 'q2'], core: true  },
    { id: 'qualification', label: 'Qualification', questionIds: ['q3'],        core: false },
    { id: 'quoting',       label: 'Quoting',       questionIds: ['q4', 'q5'], core: true  },
    { id: 'scheduling',    label: 'Scheduling',    questionIds: ['q6'],        core: true  },
    { id: 'delivery',      label: 'Delivery',      questionIds: ['q7'],        core: false },
    { id: 'invoicing',     label: 'Invoicing',     questionIds: ['q8', 'q9'], core: true  },
    { id: 'reviews',       label: 'Reviews',       questionIds: ['q10'],       core: true  },
    { id: 'retention',     label: 'Retention',     questionIds: ['q11', 'q12'],core: false }
  ];

  // Readable slug for the leak:{Y} Beehiiv tag.
  function leakSlug(stageId) { return stageId.replace(/_/g, '-'); }

  // Questions, scores & multipliers from Data Engine V2 §4. Subtexts corrected to
  // the §3 verified/attributed/reframed ledger. Best option multiplier = 0.00 (see header).
  var AUDIT_QUESTIONS = [
    { id: 'q1', stage: 'lead_capture',
      question: 'When a customer calls and you can’t answer, what happens?',
      subtext: 'About 85% of people who don’t reach you on the first try never call back — they call the next name. Most won’t even leave a voicemail.',
      options: [
        { label: 'Nothing — they get voicemail, maybe I call back later', score: 1, leakMultiplier: 0.85 },
        { label: 'They get voicemail, I try to call back within a few hours', score: 2, leakMultiplier: 0.60 },
        { label: 'I call back within an hour, pretty reliably', score: 3, leakMultiplier: 0.35 },
        { label: 'They get an auto text-back within minutes', score: 4, leakMultiplier: 0.15 },
        { label: 'Every call is answered — live or by a service', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q2', stage: 'lead_capture',
      question: 'If I asked you right now how many leads you got last month, could you tell me the exact number?',
      subtext: 'If you can’t count your leads, you can’t know how many you’re losing.',
      options: [
        { label: 'No idea — they come in from texts, calls, DMs, all over', score: 1, leakMultiplier: 0.30 },
        { label: 'I could estimate, but it’d be a guess', score: 2, leakMultiplier: 0.18 },
        { label: 'Mostly tracked in one place, but some slip through', score: 3, leakMultiplier: 0.10 },
        { label: 'Yes — they all go into one system and I know the number', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q3', stage: 'qualification',
      question: 'How do you figure out if a new lead is worth your time?',
      subtext: 'Hours a week can disappear on leads that were never going to book.',
      options: [
        { label: 'I just show up and hope it works out', score: 1, leakMultiplier: 0.25 },
        { label: 'I ask a couple questions on the phone first', score: 3, leakMultiplier: 0.10 },
        { label: 'I have a standard set of screening questions before I commit', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q4', stage: 'quoting',
      question: 'How fast do your quotes go out after a customer asks?',
      subtext: '78% hire the first company to respond — speed wins.',
      options: [
        { label: 'Whenever I get around to it — could be days', score: 1, leakMultiplier: 0.40 },
        { label: 'Within a day or two usually', score: 3, leakMultiplier: 0.18 },
        { label: 'Same day, every time', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q5', stage: 'quoting',
      question: 'After you send a quote, what happens next?',
      subtext: 'Most quotes that get no follow-up just go cold. A simple day-1 / day-3 / day-7 sequence closes 15–25% more.',
      options: [
        { label: 'I send it and wait. If they want it, they’ll call.', score: 1, leakMultiplier: 0.55 },
        { label: 'I follow up once, maybe twice, if I remember', score: 2, leakMultiplier: 0.35 },
        { label: 'I follow up a couple times but it’s not consistent', score: 3, leakMultiplier: 0.22 },
        { label: 'I have a system — follow up at day 1, day 3, and day 7', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q6', stage: 'scheduling',
      question: 'How do you manage your schedule and book jobs?',
      subtext: 'Double-bookings and empty slots are lost revenue you never see.',
      options: [
        { label: 'In my head or on paper', score: 1, leakMultiplier: 0.15 },
        { label: 'Phone calendar or spreadsheet', score: 3, leakMultiplier: 0.07 },
        { label: 'Scheduling tool with online booking', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q7', stage: 'delivery',
      question: 'If you got sick for a week, would your business keep running without you?',
      subtext: 'If everything stops when you stop, the business owns you — not the other way around.',
      options: [
        { label: 'No — everything stops if I stop', score: 1, leakMultiplier: 0.10 },
        { label: 'It would limp along, but quality would drop', score: 3, leakMultiplier: 0.05 },
        { label: 'Yes — I have systems and people who know the process', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q8', stage: 'invoicing',
      question: 'After you finish a job, when does the invoice go out?',
      subtext: 'The longer an invoice sits, the harder it gets to collect.',
      options: [
        { label: 'End of the week, sometimes longer', score: 1, leakMultiplier: 0.20 },
        { label: 'Within a day or two', score: 3, leakMultiplier: 0.08 },
        { label: 'Same day — automatically or before I leave', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q9', stage: 'invoicing',
      question: 'When a customer doesn’t pay on time, what do you do?',
      subtext: 'Unpaid invoices quietly eat into the money you already earned.',
      options: [
        { label: 'Wait and hope they pay eventually', score: 1, leakMultiplier: 0.25 },
        { label: 'Send a manual reminder after a while', score: 2, leakMultiplier: 0.14 },
        { label: 'Automatic reminders go out, or they’re on autopay', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q10', stage: 'reviews',
      question: 'How many Google reviews does your business have right now?',
      subtext: 'Businesses with 50+ reviews are 266% more likely to show up in Google’s local 3-pack than those with under 10 (BrightLocal).',
      options: [
        { label: 'Under 10 (or I’m not sure)', score: 1, leakMultiplier: 0.35 },
        { label: '10–25', score: 2, leakMultiplier: 0.22 },
        { label: '25–50', score: 3, leakMultiplier: 0.12 },
        { label: 'Over 50', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q11', stage: 'retention',
      question: 'How often do past customers hear from you after a job is done?',
      subtext: 'Keeping a past customer is far cheaper than winning a new one — and most operators never follow up.',
      options: [
        { label: 'Never — once the job’s done, that’s it', score: 1, leakMultiplier: 0.30 },
        { label: 'Occasionally, if I think of it', score: 2, leakMultiplier: 0.18 },
        { label: 'Regularly — seasonal reminders, check-ins, rebooking offers', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q12', stage: 'retention',
      question: 'Do you have any kind of referral system?',
      subtext: 'Referred and repeat customers are your warmest, cheapest work — and you’re leaving it to chance.',
      options: [
        { label: 'No — I just hope people recommend me', score: 1, leakMultiplier: 0.15 },
        { label: 'I mention it sometimes, but nothing formal', score: 3, leakMultiplier: 0.08 },
        { label: 'Yes — I have a referral incentive and I ask every time', score: 5, leakMultiplier: 0.00 }
      ] }
  ];

  // Per-answer explanation shown beside each results bar. Stat-clean: only the §3
  // verified/attributed figures appear; every stat the §3 ledger marked "cut" or
  // "reframe" has been removed and replaced with plain-language consequence.
  var ANSWER_EXPLANATIONS = {
    q1: {
      'Nothing — they get voicemail, maybe I call back later': 'You said missed calls go to voicemail with no reliable callback. About 85% of people who don’t reach you on the first try just call the next name.',
      'They get voicemail, I try to call back within a few hours': 'You said you try to call back within a few hours. By then most callers have already reached someone else — speed of first contact is what holds the lead.',
      'I call back within an hour, pretty reliably': 'You said you call back within an hour. Solid — but a caller who doesn’t reach a person on the first try is still at risk of moving on.',
      'They get an auto text-back within minutes': 'You said leads get an auto text-back within minutes. Strong system — you’re catching almost everyone who slips past a live answer.',
      'Every call is answered — live or by a service': 'Every call answered, live or by a service. You’re not losing leads at the front door.'
    },
    q2: {
      'No idea — they come in from texts, calls, DMs, all over': 'You said you can’t put a number on last month’s leads. If you can’t count them, you can’t see the ones leaking out.',
      'I could estimate, but it’d be a guess': 'You said you could only guess at your lead count. Without tracking, you’re steering on feel instead of numbers.',
      'Mostly tracked in one place, but some slip through': 'You said leads are mostly tracked but some slip through. Close — that slippage is the part you can’t follow up on.',
      'Yes — they all go into one system and I know the number': 'All leads land in one system and you know the number. You can see exactly what’s happening at the top of the funnel.'
    },
    q3: {
      'I just show up and hope it works out': 'You said you take leads as they come with no screening. Hours a week disappear on jobs that were never going to book.',
      'I ask a couple questions on the phone first': 'You said you ask a couple of questions first. That filters the obvious mismatches; a consistent set would catch the rest.',
      'I have a standard set of screening questions before I commit': 'Standard screening before you commit. Your time goes to the leads worth chasing.'
    },
    q4: {
      'Whenever I get around to it — could be days': 'You said quotes can take days. 78% of customers hire the first company to respond — a slow quote is usually a lost one.',
      'Within a day or two usually': 'You said quotes go out in a day or two. Reasonable — but the company that responds first wins most of the time.',
      'Same day, every time': 'Same-day quotes, every time. You’re winning the speed race; any losses here are about price or fit, not response time.'
    },
    q5: {
      'I send it and wait. If they want it, they’ll call.': 'You said you send the quote and wait. Quotes with no follow-up mostly go cold — a day-1/3/7 sequence closes 15–25% more.',
      'I follow up once, maybe twice, if I remember': 'You said follow-up happens when you remember. Inconsistent nudges leave proposals on the table that a set sequence would close.',
      'I follow up a couple times but it’s not consistent': 'You said you follow up but not consistently. A fixed day-1/3/7 cadence is what turns “maybe” into booked work.',
      'I have a system — follow up at day 1, day 3, and day 7': 'A real day-1/3/7 follow-up system. You’re converting near the top of what’s possible.'
    },
    q6: {
      'In my head or on paper': 'You said scheduling lives in your head or on paper. Double-bookings and empty slots are revenue you never see.',
      'Phone calendar or spreadsheet': 'You said you use a phone calendar or spreadsheet. It works, but customers can’t book themselves — you’re the bottleneck.',
      'Scheduling tool with online booking': 'Online booking in place. Customers book the open slots without waiting on you.'
    },
    q7: {
      'No — everything stops if I stop': 'You said everything stops if you stop. The business owns you — and any week you can’t work is a week with no revenue.',
      'It would limp along, but quality would drop': 'You said it would limp along. Some resilience, but your absence still costs you work and quality.',
      'Yes — I have systems and people who know the process': 'Systems and people who know the process. The business can run without you in the truck.'
    },
    q8: {
      'End of the week, sometimes longer': 'You said invoices go out end of week or later. The longer an invoice sits, the harder it gets to collect.',
      'Within a day or two': 'You said invoices go out in a day or two. Decent — but the same-day habit is what keeps cash moving.',
      'Same day — automatically or before I leave': 'Same-day invoicing, before you leave the job. Cash comes in while the work is fresh.'
    },
    q9: {
      'Wait and hope they pay eventually': 'You said you wait and hope late payers come through. That leaves money you’ve already earned sitting uncollected.',
      'Send a manual reminder after a while': 'You said you send a manual reminder eventually. Better than waiting, but inconsistent follow-up still lets some go unpaid.',
      'Automatic reminders go out, or they’re on autopay': 'Automatic reminders or autopay. You’re collecting what you’re owed without chasing it.'
    },
    q10: {
      'Under 10 (or I’m not sure)': 'You said under 10 Google reviews. Businesses with 50+ are 266% more likely to show in Google’s local 3-pack (BrightLocal) — you’re hard to find.',
      '10–25': 'You said 10–25 reviews. A start — but you’re still well short of the 50+ tier where local visibility jumps.',
      '25–50': 'You said 25–50 reviews. Competitive — closing the gap to 50+ is where you start outranking nearby rivals.',
      'Over 50': '50+ Google reviews. You’re in the tier that wins the local 3-pack.'
    },
    q11: {
      'Never — once the job’s done, that’s it': 'You said you don’t follow up after a job. Keeping a past customer is far cheaper than winning a new one — so that repeat business is the cheapest work you’ll ever win.',
      'Occasionally, if I think of it': 'You said you follow up occasionally. Sporadic contact wins back some past customers; a steady rhythm wins back far more.',
      'Regularly — seasonal reminders, check-ins, rebooking offers': 'Regular check-ins and rebooking offers. You’re holding onto the customers you already earned.'
    },
    q12: {
      'No — I just hope people recommend me': 'You said you have no referral system. Referred and repeat customers are the warmest, cheapest leads you’ll ever get — and you’re leaving them on the table.',
      'I mention it sometimes, but nothing formal': 'You said you mention referrals sometimes. Without a simple ask-every-time system, most of those warm leads never happen.',
      'Yes — I have a referral incentive and I ask every time': 'A referral incentive, asked every time. You’re turning happy customers into your best lead source.'
    }
  };

  // ---- The fix set (spec §6): one Monday action + the named tool (+ free alt),
  //      and a /learn slug for the 5 core leaks (gated by LEARN_LIVE). The 3
  //      non-core stages (qualification, delivery, retention) carry NO /learn slug. ----
  var FIX = {
    lead_capture: {
      headline: 'Capture every call',
      move: 'Turn on missed-call text-back in your CRM and replace the robot default with a human line: “Hey, this is [Name] with [Company] — sorry I missed you, I’m on a job. What do you need, and what’s the address? I’ll text you right back with a time.”',
      tool: 'your CRM (Housecall Pro / Jobber / ServiceTitan) — it’s built in',
      freeAlt: 'Google Voice auto-reply',
      learnSlug: 'answering-calls/missed-call-text-back'
    },
    quoting: {
      headline: 'Follow up on every quote',
      move: 'Send today’s quotes the same day, and set a day-1 / day-3 / day-7 follow-up on every open quote.',
      tool: 'Jobber / Housecall Pro quote follow-up',
      freeAlt: 'phone reminders + the three follow-up scripts',
      learnSlug: 'quoting/quote-follow-up'
    },
    reviews: {
      headline: 'Ask for the review, every job',
      move: 'Text every customer about 2 hours after the job: “…if you’re happy with the work, a quick Google review really helps a small business like mine: [link].”',
      tool: 'NiceJob or your CRM’s review automation',
      freeAlt: 'a manual text after each job',
      learnSlug: 'reviews/review-requests'
    },
    scheduling: {
      headline: 'Let customers book themselves',
      move: 'Set up a free booking link and drop it in your texts and email signature.',
      tool: 'Calendly / Square Appointments (free–$8/mo)',
      freeAlt: 'the same free tiers',
      learnSlug: 'scheduling/online-booking'
    },
    invoicing: {
      headline: 'Invoice same-day, every time',
      move: 'Send the invoice before you leave the job, and turn on automatic payment reminders.',
      tool: 'Wave / Square Invoices (free)',
      freeAlt: 'same — both have free tiers',
      learnSlug: 'invoicing/same-day-invoicing'
    },
    qualification: {
      headline: 'Screen before you commit',
      move: 'Write 5 screening questions on a sticky note by your phone — what / where / when / other quotes / budget — and ask them before you commit to anything.',
      tool: 'Google Forms (free)',
      freeAlt: null,
      learnSlug: null
    },
    delivery: {
      headline: 'Get the process out of your head',
      move: 'After your next 3 jobs, jot down every step you did — that’s your first SOP, the start of a business that runs without you.',
      tool: 'Google Docs (free)',
      freeAlt: null,
      learnSlug: null
    },
    retention: {
      headline: 'Reach back out to past customers',
      move: 'Text your last 10 customers a rebooking or check-in this week — about 15 minutes.',
      tool: 'your CRM / SimpleTexting',
      freeAlt: 'a recurring Monday 15-minute block',
      learnSlug: null
    }
  };

  // Returns the on-site /learn URL for a stage's fix, or null when its cluster
  // isn't live yet (so the caller omits the link — never a 404).
  function learnUrl(stageId) {
    var fix = FIX[stageId];
    if (!fix || !fix.learnSlug) return null;
    return LEARN_LIVE[fix.learnSlug] ? '/learn/' + fix.learnSlug : null;
  }

  var INDUSTRY_TIPS = {
    recurring: 'For recurring-service businesses, the biggest wins are usually retention and reviews — keeping the customers you’ve already earned and being easy to find when new ones search.',
    emergency: 'For emergency trades, answering the phone is everything. Miss the call and the customer dials the next number — so capture and fast response pay back first.',
    project: 'For project-based work, fast quotes and steady reviews drive the most revenue — speed wins the job, and reviews are how the next customer finds you.'
  };

  // ---- Scoring (Data Engine V2 §5 math) ----
  function roundLeak(amount) {
    if (amount > 1000) return Math.round(amount / 100) * 100;
    return Math.round(amount / 50) * 50;
  }
  function getScoreBadge(totalScore) {
    if (totalScore >= 45) return { label: 'Strong', color: '#16A34A' };
    if (totalScore >= 30) return { label: 'Needs Work', color: '#D97706' };
    return { label: 'Critical', color: '#DC2626' };
  }
  function getStageColor(stageId, stageScore) {
    var stage = STAGES.filter(function (s) { return s.id === stageId; })[0];
    var twoQ = stage.questionIds.length === 2;
    if (twoQ) {
      if (stageScore <= 4) return '#DC2626';
      if (stageScore <= 7) return '#D97706';
      return '#16A34A';
    }
    if (stageScore <= 1) return '#DC2626';
    if (stageScore <= 3) return '#D97706';
    return '#16A34A';
  }
  // A stage is "weak" (needs a fix shown) per Data Engine V2 §8 thresholds.
  function stageIsWeak(stageId, stageScore) {
    var stage = STAGES.filter(function (s) { return s.id === stageId; })[0];
    var twoQ = stage.questionIds.length === 2;
    return twoQ ? (stageScore <= 7) : (stageScore <= 3);
  }

  function findQuestion(qId) {
    return AUDIT_QUESTIONS.filter(function (q) { return q.id === qId; })[0];
  }
  function findTrade(id) {
    return BUSINESS_TYPES.filter(function (t) { return t.id === id; })[0];
  }

  // Per-stage leak for a single stage given the current answers (used by the live
  // counter to finalize a stage and by calculateResults). Returns 0 if incomplete.
  function stageLeakFor(stageId, answers, revenue, preset) {
    var stage = STAGES.filter(function (s) { return s.id === stageId; })[0];
    var weights = STAGE_WEIGHTS[preset];
    var mults = [], complete = true;
    stage.questionIds.forEach(function (qId) {
      var idx = answers[qId];
      if (idx === undefined || idx === null) { complete = false; return; }
      var opt = findQuestion(qId).options[idx];
      if (opt) mults.push(opt.leakMultiplier);
    });
    if (!complete || !mults.length) return 0;
    var avg = mults.reduce(function (a, b) { return a + b; }, 0) / mults.length;
    return roundLeak(revenue * weights[stageId] * avg);
  }

  // answers: { q1: optionIndex, ... }  profile: { businessType, revenue }
  function calculateResults(answers, profile) {
    var trade = findTrade(profile.businessType);
    var preset = trade.category;
    var revenue = profile.revenue;
    var stageScores = {}, stageLeaks = {};

    STAGES.forEach(function (stage) {
      var totalStageScore = 0;
      stage.questionIds.forEach(function (qId) {
        var idx = answers[qId];
        if (idx === undefined || idx === null) return;
        var opt = findQuestion(qId).options[idx];
        if (opt) totalStageScore += opt.score;
      });
      stageScores[stage.id] = totalStageScore;
      stageLeaks[stage.id] = stageLeakFor(stage.id, answers, revenue, preset);
    });

    var rawTotal = Object.keys(stageLeaks).reduce(function (a, k) { return a + stageLeaks[k]; }, 0);
    var totalLeak = Math.round(rawTotal / 100) * 100;
    var totalScore = Object.keys(stageScores).reduce(function (a, k) { return a + stageScores[k]; }, 0);
    var topLeaks = STAGES.map(function (s) { return { stageId: s.id, leak: stageLeaks[s.id] }; })
      .sort(function (a, b) { return b.leak - a.leak; })
      .slice(0, 3);

    return { stageScores: stageScores, stageLeaks: stageLeaks, totalLeak: totalLeak, totalScore: totalScore, topLeaks: topLeaks };
  }

  // ---- URL state (self-contained handoff quiz → results) ----
  // ?t=cleaning&r=2&ts=0&jw=1&a=402100010000  (a = 12 option-index digits, q1..q12)
  function encodeState(state) {
    var s = '?t=' + encodeURIComponent(state.trade) +
            '&r=' + state.revenueIndex +
            '&a=' + state.answerDigits;
    if (state.teamIndex != null && state.teamIndex >= 0) s += '&ts=' + state.teamIndex;
    if (state.jobsIndex != null && state.jobsIndex >= 0) s += '&jw=' + state.jobsIndex;
    return s;
  }

  function parseState(search) {
    var p = new URLSearchParams(search || '');
    var trade = p.get('t');
    var r = parseInt(p.get('r'), 10);
    var a = p.get('a') || '';
    var ts = p.get('ts'); ts = (ts == null || ts === '') ? -1 : parseInt(ts, 10);
    var jw = p.get('jw'); jw = (jw == null || jw === '') ? -1 : parseInt(jw, 10);
    var valid = true;
    if (!findTrade(trade)) valid = false;
    if (isNaN(r) || r < 0 || r >= REVENUE_OPTIONS.length) valid = false;
    if (!/^[0-9]{12}$/.test(a)) valid = false;
    if (valid) {
      for (var i = 0; i < 12; i++) {
        var q = AUDIT_QUESTIONS[i];
        if (parseInt(a[i], 10) >= q.options.length) { valid = false; break; }
      }
    }
    // team/jobs are optional context — invalid values are dropped, never block.
    if (isNaN(ts) || ts < 0 || ts >= TEAM_OPTIONS.length) ts = -1;
    if (isNaN(jw) || jw < 0 || jw >= JOBS_OPTIONS.length) jw = -1;
    return { trade: trade, revenueIndex: r, answerDigits: a, teamIndex: ts, jobsIndex: jw, valid: valid };
  }

  // Build the rich, render-ready result from a parsed/collected state.
  function fromState(state) {
    var answers = {};
    for (var i = 0; i < 12; i++) answers['q' + (i + 1)] = parseInt(state.answerDigits[i], 10);
    var trade = findTrade(state.trade);
    var revenue = REVENUE_OPTIONS[state.revenueIndex];
    var team = (state.teamIndex != null && state.teamIndex >= 0) ? TEAM_OPTIONS[state.teamIndex] : null;
    var jobs = (state.jobsIndex != null && state.jobsIndex >= 0) ? JOBS_OPTIONS[state.jobsIndex] : null;
    var profile = { businessType: trade.id, revenue: revenue.value };
    var r = calculateResults(answers, profile);

    var perStage = STAGES.map(function (s) {
      var qId0 = s.questionIds[0];
      var optIdx = answers[qId0];
      var optLabel = findQuestion(qId0).options[optIdx].label;
      var score = r.stageScores[s.id];
      return {
        id: s.id,
        label: s.label,
        core: s.core,
        score: score,
        maxScore: s.questionIds.length * 5,
        leak: r.stageLeaks[s.id],
        color: getStageColor(s.id, score),
        weak: stageIsWeak(s.id, score),
        explanation: ANSWER_EXPLANATIONS[qId0][optLabel]
      };
    });

    var realLeaks = r.topLeaks.filter(function (l) { return l.leak > 0; });
    var topLeak = realLeaks.length ? realLeaks[0] : null;
    var topStageId = topLeak ? topLeak.stageId : null;
    var allGreen = (r.totalScore >= 45 && r.totalLeak < 8000);

    // The fixes the results page hands over: every WEAK stage, ranked by leak,
    // with the #1 leak's stage first so it can be expanded (spec §7 promise-item #3).
    var weakStages = perStage.filter(function (s) { return s.weak; })
      .sort(function (a, b) { return b.leak - a.leak; });

    return {
      trade: trade,
      revenue: revenue,
      team: team,
      jobs: jobs,
      profile: profile,
      preset: trade.category,
      answers: answers,
      stageLeaks: r.stageLeaks,
      stageScores: r.stageScores,
      totalLeak: r.totalLeak,
      totalScore: r.totalScore,
      topLeaks: r.topLeaks,
      realLeaks: realLeaks,
      topStageId: topStageId,
      topStageLabel: topStageId ? stageLabel(topStageId) : 'Nothing major',
      perStage: perStage,
      weakStages: weakStages,
      badge: getScoreBadge(r.totalScore),
      allGreen: allGreen,
      headline: headlineFor(r.totalLeak, allGreen),
      methodology: methodologyLine(trade),
      industryTip: INDUSTRY_TIPS[trade.category],
      strongCount: STAGES.filter(function (s) { return r.stageLeaks[s.id] === 0; }).length,
      // Beehiiv tags for the gate (spec §10.3)
      tags: ['quiz', 'trade:' + trade.id].concat(topStageId ? ['leak:' + leakSlug(topStageId)] : ['leak:none'])
    };
  }

  function headlineFor(totalLeak, allGreen) {
    if (allGreen || totalLeak <= 0) {
      return { mode: 'strong', lead: 'Your business is running well.', tail: 'Here’s where you could still tighten up.' };
    }
    return { mode: 'leak', lead: 'Your business is leaving approximately', figure: money(totalLeak), tail: 'on the table every year.' };
  }

  function methodologyLine(trade) {
    return 'This is an estimate based on industry benchmarks for ' + trade.label.toLowerCase() +
      ' businesses at your revenue level — missed leads, unconverted quotes, slow payments, lost repeat business, and unrealized referrals. It points you at your biggest opportunities, not an exact prediction.';
  }

  function stageLabel(stageId) {
    var s = STAGES.filter(function (x) { return x.id === stageId; })[0];
    return s ? s.label : stageId;
  }

  function fieldReportUrl(tradeId) {
    return (FIELD_REPORTS_LIVE && FIELD_REPORT_TRADES.indexOf(tradeId) !== -1) ? '/field-reports/' + tradeId : null;
  }
  function hasFieldReport(tradeId) {
    return FIELD_REPORT_TRADES.indexOf(tradeId) !== -1;
  }

  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  // Share text — pairs with SHARE_URL (the canonical URL, never the preview origin).
  function shareText(result) {
    if (result.totalLeak > 0) {
      return 'I just ran my Revenue Leak Score: my home-service business is leaving about ' +
        money(result.totalLeak) + '/year on the table, and my #1 leak is ' + result.topStageLabel +
        '. Find your own number (3 min, free):';
    }
    return 'I just ran my Revenue Leak Score — my home-service business is running tight at ' +
      result.totalScore + '/60. Find your own number (3 min, free):';
  }

  root.LeakScore = {
    SHARE_URL: SHARE_URL,
    BUSINESS_TYPES: BUSINESS_TYPES,
    FIELD_REPORT_TRADES: FIELD_REPORT_TRADES,
    REVENUE_OPTIONS: REVENUE_OPTIONS,
    TEAM_OPTIONS: TEAM_OPTIONS,
    JOBS_OPTIONS: JOBS_OPTIONS,
    AUDIT_QUESTIONS: AUDIT_QUESTIONS,
    STAGES: STAGES,
    FIX: FIX,
    calculateResults: calculateResults,
    stageLeakFor: stageLeakFor,
    fromState: fromState,
    encodeState: encodeState,
    parseState: parseState,
    fieldReportUrl: fieldReportUrl,
    hasFieldReport: hasFieldReport,
    learnUrl: learnUrl,
    stageLabel: stageLabel,
    stageIsWeak: stageIsWeak,
    leakSlug: leakSlug,
    money: money,
    shareText: shareText,
    getScoreBadge: getScoreBadge,
    getStageColor: getStageColor
  };
})(typeof window !== 'undefined' ? window : this);
