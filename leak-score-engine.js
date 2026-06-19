/* ==========================================================================
   Revenue Leak Score — shared scoring engine
   Used by /leak-score (quiz) and /leak-score/results (breakdown + scorecard).

   Pure vanilla JS, no dependencies, no build step. Exposes window.LeakScore.

   Scoring math is carried over verbatim from the original Operator's Toolkit
   (git history, e93cb63^): per-trade stage weights × revenue band ×
   average(leak multipliers) → per-stage dollar leak → top-3 leaks.
   The dollar figures are directional estimates, not predictions.
   ========================================================================== */
(function (root) {
  'use strict';

  // ---- Trades (brand-canonical 5 + "Other"). category drives stage weights ----
  var BUSINESS_TYPES = [
    { id: 'cleaning',    label: 'Residential Cleaning',  category: 'recurring' },
    { id: 'landscaping', label: 'Landscaping & Lawn',    category: 'recurring' },
    { id: 'hvac',        label: 'HVAC',                  category: 'emergency' },
    { id: 'plumbing',    label: 'Plumbing',              category: 'emergency' },
    { id: 'handyman',    label: 'Handyman',              category: 'project'   },
    { id: 'other',       label: 'Other home service',    category: 'project'   }
  ];

  // Field Reports only exist for these trades; "other" bridges to the hub.
  var FIELD_REPORT_TRADES = ['cleaning', 'landscaping', 'hvac', 'plumbing', 'handyman'];

  var REVENUE_OPTIONS = [
    { label: 'Under $50K',     value: 35000  },
    { label: '$50K – $100K',  value: 75000  },
    { label: '$100K – $200K', value: 150000 },
    { label: '$200K – $300K', value: 250000 },
    { label: 'Over $300K',     value: 350000 }
  ];

  var STAGE_WEIGHTS = {
    recurring: { lead_capture: 0.28, qualification: 0.06, quoting: 0.18, scheduling: 0.05, delivery: 0.05, invoicing: 0.12, reviews: 0.12, retention: 0.14 },
    project:   { lead_capture: 0.25, qualification: 0.08, quoting: 0.20, scheduling: 0.06, delivery: 0.06, invoicing: 0.14, reviews: 0.10, retention: 0.11 },
    emergency: { lead_capture: 0.22, qualification: 0.10, quoting: 0.18, scheduling: 0.05, delivery: 0.06, invoicing: 0.16, reviews: 0.10, retention: 0.13 }
  };

  var STAGES = [
    { id: 'lead_capture',  label: 'Lead Capture',  questionIds: ['q1', 'q2'] },
    { id: 'qualification', label: 'Qualification', questionIds: ['q3'] },
    { id: 'quoting',       label: 'Quoting',       questionIds: ['q4', 'q5'] },
    { id: 'scheduling',    label: 'Scheduling',    questionIds: ['q6'] },
    { id: 'delivery',      label: 'Delivery',      questionIds: ['q7'] },
    { id: 'invoicing',     label: 'Invoicing',     questionIds: ['q8', 'q9'] },
    { id: 'reviews',       label: 'Reviews',       questionIds: ['q10'] },
    { id: 'retention',     label: 'Retention',     questionIds: ['q11', 'q12'] }
  ];

  // Readable slug for the leak:{Y} Beehiiv tag.
  function leakSlug(stageId) { return stageId.replace(/_/g, '-'); }

  var AUDIT_QUESTIONS = [
    { id: 'q1', stage: 'lead_capture',
      question: 'When a customer calls and you can’t answer, what happens?',
      subtext: '85% of callers who reach voicemail never call back. Every missed call is a lost job.',
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
      subtext: 'The average operator spends 3–5 hours per week on leads that were never going to book.',
      options: [
        { label: 'I just show up and hope it works out', score: 1, leakMultiplier: 0.25 },
        { label: 'I ask a couple questions on the phone first', score: 3, leakMultiplier: 0.10 },
        { label: 'I have a standard set of screening questions before I commit', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q4', stage: 'quoting',
      question: 'How fast do your quotes go out after a customer asks?',
      subtext: '78% of customers hire the first company that sends a quote. Speed wins.',
      options: [
        { label: 'Whenever I get around to it — could be days', score: 1, leakMultiplier: 0.40 },
        { label: 'Within a day or two usually', score: 3, leakMultiplier: 0.18 },
        { label: 'Same day, every time', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q5', stage: 'quoting',
      question: 'After you send a quote, what happens next?',
      subtext: '48–60% of quotes never get a single follow-up. Half your proposals are dying in inboxes.',
      options: [
        { label: 'I send it and wait. If they want it, they’ll call.', score: 1, leakMultiplier: 0.55 },
        { label: 'I follow up once, maybe twice, if I remember', score: 2, leakMultiplier: 0.35 },
        { label: 'I follow up a couple times but it’s not consistent', score: 3, leakMultiplier: 0.22 },
        { label: 'I have a system — follow up at day 1, day 3, and day 7', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q6', stage: 'scheduling',
      question: 'How do you manage your schedule and book jobs?',
      subtext: 'Double-bookings and empty slots cost the average operator $200–$400/week in lost revenue.',
      options: [
        { label: 'In my head or on paper', score: 1, leakMultiplier: 0.15 },
        { label: 'Phone calendar or spreadsheet', score: 3, leakMultiplier: 0.07 },
        { label: 'Scheduling tool with online booking', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q7', stage: 'delivery',
      question: 'If you got sick for a week, would your business keep running without you?',
      subtext: '82% of solo operators say they can’t take a full week off without losing revenue.',
      options: [
        { label: 'No — everything stops if I stop', score: 1, leakMultiplier: 0.10 },
        { label: 'It would limp along, but quality would drop', score: 3, leakMultiplier: 0.05 },
        { label: 'Yes — I have systems and people who know the process', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q8', stage: 'invoicing',
      question: 'After you finish a job, when does the invoice go out?',
      subtext: 'Every day you delay invoicing, your chance of getting paid drops 10–15%.',
      options: [
        { label: 'End of the week, sometimes longer', score: 1, leakMultiplier: 0.20 },
        { label: 'Within a day or two', score: 3, leakMultiplier: 0.08 },
        { label: 'Same day — automatically or before I leave', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q9', stage: 'invoicing',
      question: 'When a customer doesn’t pay on time, what do you do?',
      subtext: 'Small service businesses write off an average of 5–8% of revenue to unpaid invoices every year.',
      options: [
        { label: 'Wait and hope they pay eventually', score: 1, leakMultiplier: 0.25 },
        { label: 'Send a manual reminder after a while', score: 2, leakMultiplier: 0.14 },
        { label: 'Automatic reminders go out, or they’re on autopay', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q10', stage: 'reviews',
      question: 'How many Google reviews does your business have right now?',
      subtext: 'Businesses with 50+ Google reviews get 266% more leads than those with under 10.',
      options: [
        { label: 'Under 10 (or I’m not sure)', score: 1, leakMultiplier: 0.35 },
        { label: '10–25', score: 2, leakMultiplier: 0.22 },
        { label: '25–50', score: 3, leakMultiplier: 0.12 },
        { label: 'Over 50', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q11', stage: 'retention',
      question: 'How often do past customers hear from you after a job is done?',
      subtext: 'A repeat customer is worth 3–5x more than a new one. Most operators never follow up.',
      options: [
        { label: 'Never — once the job’s done, that’s it', score: 1, leakMultiplier: 0.30 },
        { label: 'Occasionally, if I think of it', score: 2, leakMultiplier: 0.18 },
        { label: 'Regularly — seasonal reminders, check-ins, rebooking offers', score: 5, leakMultiplier: 0.00 }
      ] },
    { id: 'q12', stage: 'retention',
      question: 'Do you have any kind of referral system?',
      subtext: '73% of homeowners choose a service provider based on word of mouth. Are you making it easy?',
      options: [
        { label: 'No — I just hope people recommend me', score: 1, leakMultiplier: 0.15 },
        { label: 'I mention it sometimes, but nothing formal', score: 3, leakMultiplier: 0.08 },
        { label: 'Yes — I have a referral incentive and I ask every time', score: 5, leakMultiplier: 0.00 }
      ] }
  ];

  var ANSWER_EXPLANATIONS = {
    q1: {
      'Nothing — they get voicemail, maybe I call back later': 'You said missed calls go to voicemail with no guaranteed callback. 85% of callers who reach voicemail never call back.',
      'They get voicemail, I try to call back within a few hours': 'You said you try to call back within a few hours. Industry data shows 60% of callers have already called someone else by then.',
      'I call back within an hour, pretty reliably': 'You said you call back within an hour. That’s solid, but callers who don’t reach a person immediately are still 35% likely to move on.',
      'They get an auto text-back within minutes': 'You said leads get an auto text-back within minutes. Strong system — you’re capturing most leads.',
      'Every call is answered — live or by a service': 'Every call answered live or by a service. You’re not losing leads here.'
    },
    q2: {
      'No idea — they come in from texts, calls, DMs, all over': 'You said you have no idea how many leads you get. If you can’t count them, you can’t know how many you’re losing.',
      'I could estimate, but it’d be a guess': 'You said you could estimate lead count but it’d be a guess. Without tracking, you’re making business decisions on gut feel.',
      'Mostly tracked in one place, but some slip through': 'You said leads are mostly tracked but some slip through. Close — that 10% slippage adds up over a year.',
      'Yes — they all go into one system and I know the number': 'All leads tracked in one system. You know your numbers.'
    },
    q3: {
      'I just show up and hope it works out': 'You said you show up without pre-qualifying. The average operator wastes 3–5 hours/week on leads that were never going to book.',
      'I ask a couple questions on the phone first': 'You said you ask a couple questions first. That filters obvious bad fits, but inconsistent screening still lets some through.',
      'I have a standard set of screening questions before I commit': 'Standard screening questions before every commitment. You’re filtering effectively.'
    },
    q4: {
      'Whenever I get around to it — could be days': 'You said quotes go out whenever you get around to it. 78% of customers hire the first company that quotes — days-long delays lose jobs.',
      'Within a day or two usually': 'You said quotes go out within a day or two. Reasonable, but the operator who quotes same-day wins 78% of the time.',
      'Same day, every time': 'Same-day quotes every time. You’re winning on speed. Any remaining quote losses are about pricing and competition, not speed.'
    },
    q5: {
      'I send it and wait. If they want it, they’ll call.': 'You said you send quotes and wait. 48–60% of quotes never get a single follow-up — they die in inboxes.',
      'I follow up once, maybe twice, if I remember': 'You said you follow up once or twice if you remember. Inconsistent follow-up loses about 35% of convertible quotes.',
      'I follow up a couple times but it’s not consistent': 'You said follow-up happens but isn’t consistent. That costs about 22% of quotes that would convert with a system.',
      'I have a system — follow up at day 1, day 3, and day 7': 'Systematic follow-up at day 1, 3, and 7. You’re converting at near-maximum rates.'
    },
    q6: {
      'In my head or on paper': 'You said scheduling is in your head or on paper. Double-bookings and empty slots cost the average operator $200–$400/week.',
      'Phone calendar or spreadsheet': 'You said you use a phone calendar or spreadsheet. Works, but customers can’t book themselves — you’re the bottleneck.',
      'Scheduling tool with online booking': 'Online booking with a scheduling tool. Customers book without calling you.'
    },
    q7: {
      'No — everything stops if I stop': 'You said everything stops if you stop. Zero resilience — any disruption directly costs revenue.',
      'It would limp along, but quality would drop': 'You said it would limp along but quality drops. Some resilience, but your absence still costs you.',
      'Yes — I have systems and people who know the process': 'Systems and people in place. Your business runs without you.'
    },
    q8: {
      'End of the week, sometimes longer': 'You said invoices go out at end of week or later. Every day you delay, collection probability drops 10–15%.',
      'Within a day or two': 'You said invoices go within a day or two. Decent, but same-day invoicing has 94% collection rate vs 66% after 7 days.',
      'Same day — automatically or before I leave': 'Same-day invoicing, automatic or before you leave. Best practice.'
    },
    q9: {
      'Wait and hope they pay eventually': 'You said you wait and hope late payers pay. Small businesses write off 5–8% of revenue this way.',
      'Send a manual reminder after a while': 'You said you send manual reminders eventually. Better than hoping, but inconsistent follow-up still lets money slip.',
      'Automatic reminders go out, or they’re on autopay': 'Automatic reminders or autopay. You’re collecting reliably.'
    },
    q10: {
      'Under 10 (or I’m not sure)': 'You said under 10 Google reviews. Businesses with 50+ reviews get 266% more leads.',
      '10–25': 'You said 10–25 reviews. A start, but you’re losing visibility to competitors with 50+.',
      '25–50': 'You said 25–50 reviews. Competitive, but there’s a meaningful gap to the 50+ tier where lead volume jumps.',
      'Over 50': '50+ Google reviews. Top tier for local visibility.'
    },
    q11: {
      'Never — once the job’s done, that’s it': 'You said you never follow up. A repeat customer is worth 3–5x a new one — you’re leaving all of that on the table.',
      'Occasionally, if I think of it': 'You said you follow up occasionally. Sporadic contact captures some, but you’re missing the majority.',
      'Regularly — seasonal reminders, check-ins, rebooking offers': 'Regular follow-up with seasonal reminders and rebooking. You’re retaining customers.'
    },
    q12: {
      'No — I just hope people recommend me': 'You said no referral system. 73% of homeowners choose via word of mouth — you’re leaving referrals to chance.',
      'I mention it sometimes, but nothing formal': 'You said you mention referrals sometimes. Without a formal system, you’re capturing maybe half the referrals you could.',
      'Yes — I have a referral incentive and I ask every time': 'Referral incentive in place, asked every time. You’re maximizing word-of-mouth.'
    }
  };

  // The "first Monday move" for each leak — the plan results hands the operator.
  var FIX_FIRST_MOVE = {
    lead_capture:  { headline: 'Capture every call', move: 'Set a missed-call auto text-back tonight: “Sorry I missed you — I’m on a job. Text me what you need and your zip and I’ll get you a quote today.” No call goes unanswered again.' },
    qualification: { headline: 'Screen before you commit', move: 'Write 5 screening questions on a sticky note by your phone (service, location, timeline, other quotes, budget). Ask them before you drive anywhere.' },
    quoting:       { headline: 'Follow up on every quote', move: 'Find every quote you sent in the last 2 weeks with no reply and send a day-3 nudge today. Then set a day 1 / day 3 / day 7 follow-up rule.' },
    scheduling:    { headline: 'Let customers book themselves', move: 'Stand up a free Calendly or Square Appointments link tonight and drop it in your texts and email signature.' },
    delivery:      { headline: 'Get the process out of your head', move: 'After your next 3 jobs, spend 5 minutes writing down every step. That’s your first SOP — the start of a business that runs without you.' },
    invoicing:     { headline: 'Invoice same-day, every time', move: 'After your next job, send the invoice before you drive to the next one. Then turn on automatic payment reminders.' },
    reviews:       { headline: 'Ask for the review, every job', move: 'Text your next customer within 2 hours of finishing: “If you’re happy with the work, a 30-second Google review really helps a small business like mine: [link].”' },
    retention:     { headline: 'Reach back out to past customers', move: 'Text your last 10 customers a seasonal rebooking offer this week. 15 minutes; it routinely brings back $1,000+ in work.' }
  };

  var INDUSTRY_TIPS = {
    recurring: 'For recurring service businesses, the biggest ROI usually comes from retention and rebooking tools. SimpleTexting pays for itself if it rebooks even 2 past customers per month.',
    emergency: 'For emergency service businesses, the #1 tool investment is always phone answering. Miss an emergency call and that customer calls the next number. OpenPhone pays for itself on the first captured call.',
    project: 'For project-based businesses, quoting tools and review collection drive the most revenue. Fast, professional quotes close more jobs, and reviews are how new customers find you.'
  };

  // ---- Scoring (verbatim math from the original engine) ----
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

  function findQuestion(qId) {
    return AUDIT_QUESTIONS.filter(function (q) { return q.id === qId; })[0];
  }
  function findTrade(id) {
    return BUSINESS_TYPES.filter(function (t) { return t.id === id; })[0];
  }

  // answers: { q1: optionIndex, q2: optionIndex, ... }  (option index per question)
  // profile: { businessType: tradeId, revenue: number }
  function calculateResults(answers, profile) {
    var trade = findTrade(profile.businessType);
    var weights = STAGE_WEIGHTS[trade.category];
    var revenue = profile.revenue;
    var stageScores = {}, stageLeaks = {};

    STAGES.forEach(function (stage) {
      var totalStageScore = 0;
      var mults = [];
      stage.questionIds.forEach(function (qId) {
        var idx = answers[qId];
        if (idx === undefined || idx === null) return;
        var q = findQuestion(qId);
        var opt = q.options[idx];
        if (opt) { totalStageScore += opt.score; mults.push(opt.leakMultiplier); }
      });
      stageScores[stage.id] = totalStageScore;
      var avg = mults.length ? mults.reduce(function (a, b) { return a + b; }, 0) / mults.length : 0;
      stageLeaks[stage.id] = roundLeak(revenue * weights[stage.id] * avg);
    });

    var rawTotal = Object.keys(stageLeaks).reduce(function (a, k) { return a + stageLeaks[k]; }, 0);
    var totalLeak = Math.round(rawTotal / 100) * 100;
    var totalScore = Object.keys(stageScores).reduce(function (a, k) { return a + stageScores[k]; }, 0);
    var topLeaks = STAGES.map(function (s) { return { stageId: s.id, leak: stageLeaks[s.id] }; })
      .sort(function (a, b) { return b.leak - a.leak; })
      .slice(0, 3);

    return { stageScores: stageScores, stageLeaks: stageLeaks, totalLeak: totalLeak, totalScore: totalScore, topLeaks: topLeaks };
  }

  function headlineFor(totalLeak, revenue) {
    var pct = revenue ? totalLeak / revenue : 0;
    if (pct > 0.15) return { text: 'Your business is leaving approximately', color: '#DC2626' };
    if (pct > 0.05) return { text: 'Your business has room to tighten up — about', color: '#D97706' };
    if (pct > 0.01) return { text: 'Your business is running well. We found about', color: '#0D9488' };
    return { text: 'Your business is running tight.', color: '#0D9488' };
  }

  // ---- URL state (shareable, self-contained) ----
  // ?t=cleaning&r=2&a=402100010000  (a = 12 option-index digits, q1..q12)
  function encodeState(state) {
    return '?t=' + encodeURIComponent(state.trade) +
           '&r=' + state.revenueIndex +
           '&a=' + state.answerDigits;
  }

  function parseState(search) {
    var p = new URLSearchParams(search || '');
    var trade = p.get('t');
    var r = parseInt(p.get('r'), 10);
    var a = p.get('a') || '';
    var valid = true;
    if (!findTrade(trade)) valid = false;
    if (isNaN(r) || r < 0 || r >= REVENUE_OPTIONS.length) valid = false;
    if (!/^[0-9]{12}$/.test(a)) valid = false;
    if (valid) {
      // every digit must be a legal option index for its question
      for (var i = 0; i < 12; i++) {
        var q = AUDIT_QUESTIONS[i];
        if (parseInt(a[i], 10) >= q.options.length) { valid = false; break; }
      }
    }
    return { trade: trade, revenueIndex: r, answerDigits: a, valid: valid };
  }

  // Build the rich, render-ready result from a parsed/collected state.
  function fromState(state) {
    var answers = {};
    for (var i = 0; i < 12; i++) answers['q' + (i + 1)] = parseInt(state.answerDigits[i], 10);
    var trade = findTrade(state.trade);
    var revenue = REVENUE_OPTIONS[state.revenueIndex];
    var profile = { businessType: trade.id, revenue: revenue.value };
    var r = calculateResults(answers, profile);

    var perStage = STAGES.map(function (s) {
      var qId0 = s.questionIds[0];
      var optIdx = answers[qId0];
      var optLabel = findQuestion(qId0).options[optIdx].label;
      return {
        id: s.id,
        label: s.label,
        score: r.stageScores[s.id],
        maxScore: s.questionIds.length * 5,
        leak: r.stageLeaks[s.id],
        color: getStageColor(s.id, r.stageScores[s.id]),
        explanation: ANSWER_EXPLANATIONS[qId0][optLabel]
      };
    });

    var realLeaks = r.topLeaks.filter(function (l) { return l.leak > 0; });
    var topLeak = realLeaks.length ? realLeaks[0] : null;
    var topStageId = topLeak ? topLeak.stageId : null;

    return {
      trade: trade,
      revenue: revenue,
      profile: profile,
      stageLeaks: r.stageLeaks,
      stageScores: r.stageScores,
      totalLeak: r.totalLeak,
      totalScore: r.totalScore,
      topLeaks: r.topLeaks,
      realLeaks: realLeaks,
      topStageId: topStageId,
      topStageLabel: topStageId ? stageLabel(topStageId) : 'Nothing major',
      perStage: perStage,
      badge: getScoreBadge(r.totalScore),
      headline: headlineFor(r.totalLeak, revenue.value),
      strongCount: STAGES.filter(function (s) { return r.stageLeaks[s.id] === 0; }).length,
      industryTip: INDUSTRY_TIPS[trade.category],
      // Beehiiv tags for the gate
      tags: ['quiz', 'trade:' + trade.id].concat(topStageId ? ['leak:' + leakSlug(topStageId)] : ['leak:none'])
    };
  }

  function stageLabel(stageId) {
    var s = STAGES.filter(function (x) { return x.id === stageId; })[0];
    return s ? s.label : stageId;
  }

  function fieldReportUrl(tradeId) {
    return FIELD_REPORT_TRADES.indexOf(tradeId) !== -1
      ? '/field-reports/' + tradeId
      : '/field-reports';
  }

  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  function shareText(result) {
    var origin = (root.location && root.location.origin) ? root.location.origin : 'https://theautobotics.com';
    if (result.totalLeak > 0) {
      return 'I just ran the Revenue Leak Score on my home-service business: about ' +
        money(result.totalLeak) + '/year leaking, and my #1 leak is ' + result.topStageLabel +
        '. Find your own number (3 min, free): ' + origin + '/leak-score';
    }
    return 'I ran the Revenue Leak Score and my home-service business is running tight — ' +
      result.totalScore + '/60. Find your own number (3 min, free): ' + origin + '/leak-score';
  }

  root.LeakScore = {
    BUSINESS_TYPES: BUSINESS_TYPES,
    REVENUE_OPTIONS: REVENUE_OPTIONS,
    AUDIT_QUESTIONS: AUDIT_QUESTIONS,
    STAGES: STAGES,
    FIX_FIRST_MOVE: FIX_FIRST_MOVE,
    calculateResults: calculateResults,
    fromState: fromState,
    encodeState: encodeState,
    parseState: parseState,
    fieldReportUrl: fieldReportUrl,
    stageLabel: stageLabel,
    leakSlug: leakSlug,
    money: money,
    shareText: shareText,
    getScoreBadge: getScoreBadge,
    getStageColor: getStageColor
  };
})(window);
