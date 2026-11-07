#!/usr/bin/env node
/**
 * Does Revo know how Revisely works? Real how-to and why questions asked of the real model with
 * this checkout's prompt (its guide, functions/src/revo/guide.ts, REVO-30), against made-up tester
 * accounts (no user's data). Each question lists the facts a right answer must contain; the page
 * written shows each answer with a pass or fail per fact, and whether Revo offered the screen.
 *
 *   cd functions && npm run build && ANTHROPIC_API_KEY=… node scripts/revo-guide-samples.js \
 *     [--out <file.md>] [--only <n,n,…>] [--dry]
 *
 * --dry checks everything without a call: every context as the server takes it, every request
 * built, every fact grounded in the guide where it says so. The key is read from the environment,
 * sent only to api.anthropic.com, and never written or printed. ~27 requests to claude-sonnet-5-5,
 * the guide cached after the first: well under a dollar.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const OUT = arg('--out', path.join(os.homedir(), 'Documents/revisely-today-mocks/revo/guide-samples.md'));
const ONLY = arg('--only', null)?.split(',').map(Number);
const DRY = process.argv.includes('--dry');

const lib = path.join(__dirname, '..', 'lib');
if (!fs.existsSync(path.join(lib, 'revo/guide.js'))) {
  console.error('Build the functions first: npm run build');
  process.exit(2);
}
const key = process.env.ANTHROPIC_API_KEY;
if (!key && !DRY) {
  console.error('Set ANTHROPIC_API_KEY (it is never printed or stored), or pass --dry to check the requests.');
  process.exit(2);
}

const { ANTHROPIC_URL, ANTHROPIC_VERSION } = require(path.join(lib, 'coach/call.js'));
const { buildAskRequest, REVO_SYSTEM_PROMPT } = require(path.join(lib, 'revo/prompt.js'));
const { REVO_GUIDE } = require(path.join(lib, 'revo/guide.js'));
const { parseReply } = require(path.join(lib, 'revo/reply.js'));
const { contextPages, validateContext } = require(path.join(lib, 'revo/validate.js'));

// ---------------------------------------------------------------------------------------------
// Made-up accounts, as the app sends them (src/lib/revo/context.ts).
// ---------------------------------------------------------------------------------------------

const DAY = '2026-11-05'; // a Thursday
const shift = (n) => {
  const [y, m, d] = DAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const NAMES = {
  542: 'Al-Mujadila, ayahs 1–6 · Juz 28', 543: 'Al-Mujadila, ayahs 7–11 · Juz 28', 544: 'Al-Mujadila, ayahs 12–21 · Juz 28',
  545: 'Al-Mujadila 22 to Al-Hashr 3 · Juz 28', 546: 'Al-Hashr, ayahs 4–9 · Juz 28', 547: 'Al-Hashr, ayahs 10–16 · Juz 28',
  548: 'Al-Hashr, ayahs 17–24 · Juz 28', 549: 'Al-Mumtahanah, ayahs 1–5 · Juz 28', 550: 'Al-Mumtahanah, ayahs 6–11 · Juz 28',
  551: 'Al-Mumtahanah 12 to As-Saf 5 · Juz 28', 552: 'As-Saf, ayahs 6–14 · Juz 28', 553: "Al-Jumu'ah, ayahs 1–8 · Juz 28",
  554: "Al-Jumu'ah 9 to Al-Munafiqun 4 · Juz 28", 555: 'Al-Munafiqun, ayahs 5–11 · Juz 28', 556: 'At-Taghabun, ayahs 1–9 · Juz 28',
  557: 'At-Taghabun, ayahs 10–18 · Juz 28', 558: 'At-Talaq, ayahs 1–5 · Juz 28', 559: 'At-Talaq, ayahs 6–12 · Juz 28',
  560: 'At-Tahrim, ayahs 1–7 · Juz 28', 561: 'At-Tahrim, ayahs 8–12 · Juz 28',
};
const namesOf = (pages) => Object.fromEntries(pages.filter((p) => NAMES[p]).map((p) => [String(p), NAMES[p]]));

// Juz 28 to 30 memorized (60 pages), 20 a day, 6 of today's 20 done, 12 days in a row, two pages weak.
const steady = {
  totals: {
    memorizedPages: 60, revisedWithin7Days: 60, revisedWithin30Days: 60, daysWithSession30: 27, streakDays: 12, sessions30: 27,
    weakPages: 2, moderatePages: 10, strongPages: 48, weakRevisedLast7Days: 4, pagesPerDay7: 17.9, pagesPerDay30: 18.1, plannedPerDay: 20,
  },
  today: { plannedPages: 20, revisedPages: 6, carriedPages: 0, doneEarlier: 0, otherPages: 0, minutes: 14, memorizedPages: 0, nextPages: range(548, 561), weakNext: [548, 549], done: false },
  weakPages: [548, 549],
  week: [...range(-6, -1).map((k) => ({ day: shift(k), pages: 20, planned: 20, done: true })), { day: DAY, pages: 6, planned: 20, done: false }],
  streak: { days: 12, atRisk: null },
  passages: {
    today: 'Juz 28', startsAt: 'Al-Mujadila', next: 'Al-Hashr 17 to At-Tahrim · Juz 28', nextAt: 'Al-Hashr, ayah 17',
    weakNext: 'Al-Hashr 17 to Al-Mumtahanah 5 · Juz 28', weak: 'Al-Hashr 17 to Al-Mumtahanah 5 · Juz 28',
  },
  pageNames: namesOf(range(548, 561)),
  localTime: '18:40',
};

// The morning after a day left at 6 of 20: the streak can still come back today.
const missedYesterday = {
  ...steady,
  totals: { ...steady.totals, streakDays: 0, pagesPerDay7: 15.1 },
  today: { ...steady.today, revisedPages: 0, minutes: 0, nextPages: range(542, 561), weakNext: [548, 549] },
  week: [...range(-6, -2).map((k) => ({ day: shift(k), pages: 20, planned: 20, done: true })), { day: shift(-1), pages: 6, planned: 20, done: false }, { day: DAY, pages: 0, planned: 20, done: false }],
  streak: { days: 0, atRisk: { previous: 11, yesterdayPlanned: 20, yesterdayDone: 6 } },
  passages: { ...steady.passages, next: 'Juz 28', nextAt: 'Al-Mujadila' },
  pageNames: namesOf(range(542, 561)),
  localTime: '07:15',
};

// Two days with nothing revised: the streak is gone.
const missedTwo = {
  ...missedYesterday,
  week: [...range(-6, -3).map((k) => ({ day: shift(k), pages: 20, planned: 20, done: true })), { day: shift(-2), pages: 0, planned: 20, done: false }, { day: shift(-1), pages: 0, planned: 20, done: false }, { day: DAY, pages: 0, planned: 20, done: false }],
  streak: { days: 0, atRisk: null },
  totals: { ...missedYesterday.totals, daysWithSession30: 25 },
};

// Today done: revising ahead is offered.
const doneToday = {
  ...steady,
  today: { ...steady.today, revisedPages: 20, minutes: 41, nextPages: [], weakNext: [], done: true },
  week: [...steady.week.slice(0, 6), { day: DAY, pages: 20, planned: 20, done: true }],
  streak: { days: 13, atRisk: null },
  passages: { today: 'Juz 28', startsAt: 'Al-Mujadila' },
  pageNames: {},
  localTime: '20:05',
};

// ---------------------------------------------------------------------------------------------
// The questions. Each fact is [what the answer must say, a pattern any of the answer's words
// match]; `guide: true` facts must also be in the guide (checked by --dry). `screen` is the
// screen Revo should offer (reported, not a fail).
// ---------------------------------------------------------------------------------------------

const F = (label, re, guide = false) => ({ label, re, guide });
/** A fact the answer must NOT say. */
const NOT = (label, re) => ({ label, re, guide: false, not: true });
// Every how-to answer: nothing about today's pages unless asked (the tone rule; Nov 7 eval: Q4, Q10, Q15, Q23).
const FILLER = /today still has|still (?:have|has) \d+ pages|\d+ (?:of \d+ )?pages (?:left|to go|still|ahead)|pages (?:left|to go|still to go)(?: today)?\b|left today|with \d+ left|done so far|still waiting|you could continue/i;
// Where the guide says it isn't possible, Revo says so plainly, not "I'm not sure".
const UNSURE = NOT('says it plainly, not “I’m not sure” (the guide knows)', /I’m not sure|I am not sure/i);
const SAMPLES = [
  {
    q: 'I want to revise Juz 29 backwards but I don’t see where I can do that',
    ctx: steady,
    note: 'Majd’s first example',
    facts: [
      F('Reverse order, in a new plan', /reverse order/i, true),
      F('where: Edit schedule → Create new plan', /create new plan|edit schedule/i, true),
      F('start at Juz 29 (Today starts at)', /today starts at|start(?:s|ing)? at (?:the end of )?juz 29|juz 29/i, true),
      F('says the whole plan goes backwards (no single-juz reverse)', /whole plan|carries on|then (?:juz 28|the juz before)|rest of|all (?:your )?memorized|not (?:just|only) (?:that|one) juz|only for the whole|(?:just|only) one juz|one juz backwards|no way to/i),
      UNSURE,
    ],
    screen: 'planEditor',
  },
  {
    q: 'Will I keep my streak if I revise yesterday’s stuff?',
    aboutToday: true,
    ctx: missedYesterday,
    note: 'Majd’s second example (yesterday left at 6 of 20)',
    facts: [
      F('yes', /\byes\b|will come back|comes back|brings it back|keep(?:s)? (?:your|the) streak|restore/i),
      F('before today ends', /before today ends|until today ends|by the end of today|today’s revision day ends|before (?:fajr|midnight)|by (?:fajr|midnight)|still today|today, /i),
      F('how: Add to today', /add to today/i, true),
      F('only yesterday’s pages count (not today’s), or two missed days break it', /yesterday’s (?:\w+ ){0,3}pages|only yesterday|two missed days|two days in a row|today’s own pages|still need(?:s)? today/i),
    ],
  },
  {
    q: 'I missed two days. Is my streak gone? Can I get it back?',
    aboutToday: true,
    ctx: missedTwo,
    facts: [
      F('two missed days in a row break the streak', /two missed days|two days in a row|break|gone|can’t (?:get|bring) it back|starts again|start(?:s)? (?:a )?new/i, true),
      F('the missed pages can still be added (Add to today)', /add to today|missed .*offered|catch up/i),
    ],
  },
  {
    q: 'What’s the difference between Keep daily amount and Add?',
    ctx: steady,
    facts: [
      F('Keep daily amount: today stays its usual size', /usual size|same size|stays the same|keeps its size|today’s size/i, true),
      F('…and the rest of the plan moves back', /moves? back|shift|slides? back|pushed back/i, true),
      F('Add (off): on top of today, nothing else moves', /on top|extra|added to today|nothing else moves|plan stays/i, true),
      F('where: Settings → Revision', /settings/i),
    ],
    screen: 'settings',
  },
  {
    q: 'Can I revise tomorrow’s pages today?',
    aboutToday: true,
    ctx: doneToday,
    facts: [
      F('yes, once today is done', /yes|once today is done|today is done|you can/i),
      F('how: Tomorrow starts at … on Home, or Keep going', /tomorrow starts at|keep going/i, true),
      F('they count for the day they’re planned on', /count(?:s)? for (?:the day|tomorrow)|planned|scheduled|tomorrow (?:then )?needs/i),
    ],
  },
  {
    q: 'How do I make a plan where I revise one juz a day?',
    ctx: steady,
    facts: [
      F('Edit schedule', /edit schedule/i, true),
      F('By Juz (Create new plan) or Daily amount → Juz', /by juz|daily amount/i, true),
      F('one juz per day', /juz per day|1 juz|one juz/i),
    ],
    screen: 'planEditor',
  },
  {
    q: 'How do I make my plan go backwards, from An-Nas to Al-Fatiha?',
    ctx: steady,
    facts: [F('Reverse order', /reverse order/i, true), F('Create new plan (in Edit schedule)', /create new plan|edit schedule/i, true)],
    screen: 'planEditor',
  },
  {
    q: 'Where is the Qibla?',
    ctx: steady,
    facts: [F('the compass icon at the top of Home', /compass/i, true), F('Home', /home/i)],
    screen: 'qibla',
  },
  {
    q: 'How do I change the reciter?',
    ctx: steady,
    facts: [F('in the reader', /reader|read tab/i, true), F('the reciter’s name in the player bar, or Audio Options', /reciter’s name|audio options|player/i, true)],
    screen: 'reader',
  },
  {
    q: 'Does the app work offline?',
    ctx: steady,
    facts: [
      F('yes: saved on the phone, sent when back online', /yes|works offline|saved on (?:the|your) phone|syncs?|sent .*online|back online/i, true),
      F('download the mushaf for reading offline', /offline mushaf|download/i, true),
    ],
  },
  {
    q: 'How do I download the Quran so it works without internet?',
    ctx: steady,
    facts: [
      F('Settings → Mushaf → Offline mushaf', /offline mushaf/i, true),
      F('Download now', /download now/i, true),
      F('Wi-Fi unless Download over mobile data', /wi-?fi|mobile data/i),
    ],
    screen: 'settings',
  },
  {
    q: 'What does coverage mean in Insights?',
    ctx: steady,
    facts: [F('share of memorized pages revised', /memorized pages.*revised|revised.*memorized pages|share|percent|%/i, true), F('in the last 7 and 30 days', /7|seven|30|thirty/i)],
  },
  {
    q: 'Can I revise by surah only?',
    ctx: steady,
    facts: [
      F('no surah plan (pages, juz or weakest)', /no surah|not (?:as )?a (?:surah )?(?:plan|mode)|isn’t a surah|there’s no|not possible|can’t/i),
      F('closest: Edit schedule → a day → Add or remove content → Surahs, or Jump to a surah', /add or remove content|jump to/i, true),
      UNSURE,
    ],
  },
  {
    q: 'Can you mark Surah Al-Mulk as memorized for me?',
    ctx: steady,
    note: 'Revo can’t change the app',
    facts: [
      F('Revo can’t do it itself', /can’t|cannot|can not|not able|I’m not able|isn’t something I can/i),
      F('how: Mark memorized pages (the memorized line on Home)', /mark memorized pages|memorized pages|of the quran memorized/i, true),
    ],
    screen: 'memorized',
  },
  {
    q: 'I’m travelling for two weeks. Can I pause my plan?',
    ctx: steady,
    facts: [
      F('no pause', /no pause|can’t pause|isn’t a pause|there’s no|not possible|no way to pause|doesn’t have a pause/i),
      F('the plan doesn’t move by itself; missed days don’t pile up', /doesn’t move|won’t move|don’t pile up|pick up|where you left|carries on/i, true),
      F('closest: Jump to… when back', /jump to/i, true),
      NOT('doesn’t offer rest days as a pause', /(?:^|[.!?]\s)(?![^.!?]*pause)[^.!?]*rest days?[^.!?]*(?:[.!?]|$)/i),
      UNSURE,
    ],
  },
  {
    q: 'How do I start today at Surah Al-Kahf?',
    ctx: steady,
    facts: [F('Jump to…', /jump to/i, true), F('the Surah tab, Al-Kahf', /surah|al-kahf/i)],
    screen: 'jumpTo',
  },
  {
    q: 'How do I change how many pages I revise each day?',
    ctx: steady,
    facts: [F('Edit schedule', /edit schedule/i, true), F('Daily amount → Pages per day', /daily amount|pages per day/i, true)],
    screen: 'planEditor',
  },
  {
    q: 'Where can I write a note about today’s revision?',
    ctx: steady,
    facts: [F('the daily log', /daily log|note/i, true), F('Activity → + → Note, or the day → Write', /activity|write/i, true)],
    screen: 'dailyLog',
  },
  {
    q: 'How do I record my recitation and listen back to it?',
    ctx: steady,
    facts: [F('the mic, in the reader or a session', /mic|record/i, true), F('Listen back (end card or Activity)', /listen back/i, true)],
  },
  {
    q: 'Can I slow down the recitation and repeat each verse three times?',
    ctx: steady,
    facts: [F('Audio Options', /audio options/i, true), F('Playback speed', /speed/i, true), F('Repeat', /repeat/i, true)],
    screen: 'reader',
  },
  {
    q: 'How do I make my day start at Fajr instead of midnight?',
    ctx: steady,
    facts: [F('Start day at fajr', /start day at fajr/i, true), F('Settings → Prayer', /settings/i)],
    screen: 'settings',
  },
  {
    q: 'How do I change the app’s colour?',
    ctx: steady,
    facts: [F('Settings → Appearance', /appearance/i, true), F('Accent: Indigo, Crimson or Jade', /accent|indigo|crimson|jade/i, true)],
    screen: 'settings',
  },
  {
    q: 'Can the app follow my phone’s dark mode automatically?',
    ctx: steady,
    facts: [F('not yet', /not yet|\byet\b|can’t|doesn’t|no,|isn’t|no setting|there’s no/i), F('Light or Dark in Settings → Appearance', /light|dark|appearance|theme/i, true), UNSURE],
  },
  {
    q: 'I’m a tester. How do I reset my data and start onboarding again?',
    ctx: steady,
    facts: [F('Settings → Testing → Reset my data', /reset my data/i, true), F('type RESET', /RESET/, true)],
    screen: 'settings',
  },
  {
    q: 'Can I see today’s prayer times?',
    ctx: steady,
    facts: [F('yes: the compass on Home, Times', /compass|times|prayer sheet/i, true)],
    screen: 'prayerTimes',
  },
  {
    q: 'Can you download the recitation so I can listen on the plane?',
    ctx: steady,
    note: 'not possible',
    facts: [F('not possible: recitation streams', /not possible|can’t|cannot|not yet|isn’t possible|needs (?:the )?internet|streams/i), F('it needs the internet', /internet|online|connection|stream/i, true), UNSURE],
  },
  {
    q: 'How do I rate how strong a page is?',
    ctx: steady,
    facts: [F('turn on Smart Tracking (Settings → Revision)', /smart tracking/i, true), F('⋯ → Rate page strength in a session', /rate page strength/i, true)],
  },
  {
    q: 'Can I send my progress to my teacher from the app?',
    ctx: steady,
    note: 'not possible',
    facts: [F('not possible (yet)', /not possible|can’t|cannot|not yet|isn’t (?:possible|something)|no way|there’s no/i), UNSURE],
  },
];

// ---------------------------------------------------------------------------------------------

async function ask(s) {
  const body = buildAskRequest({ day: DAY, question: s.q, context: s.ctx, attach: null, memory: [], history: [] });
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Anthropic answered ${res.status}: ${json?.error?.type ?? 'error'}`);
  const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  // As the handler reads it: charts and actions only on pages the context named, screens of the list.
  const reply = parseReply(text, new Set(contextPages(s.ctx)), { firstTurn: true });
  return { reply, raw: text, stop: json.stop_reason, usage: json.usage ?? {} };
}

/** Everything the user reads of an answer. */
function said(reply) {
  if (!reply) return '';
  const a = reply.action;
  return [reply.text, reply.textAfter, a?.title, a?.detail].filter(Boolean).join('\n').replace(/'/g, '’');
}

const words = (s) => (s ? s.trim().split(/\s+/).length : 0);

function show(s, r) {
  const lines = [];
  if (!r.reply) {
    lines.push(`> (no answer: ${r.stop}) \`${r.raw.slice(0, 200)}\``);
  } else {
    const { text, textAfter, action, chips } = r.reply;
    lines.push(`> ${text.replace(/\n/g, '\n> ')}`);
    if (textAfter) lines.push(`> ${textAfter}`);
    if (action) {
      const where = action.kind === 'openScreen' ? ` → opens **${action.screen}**${action.section ? ` (${action.section})` : ''}${action.surah ? ` (surah ${action.surah})` : ''}${action.juz ? ` (juz ${action.juz})` : ''}` : ` (${action.kind})`;
      lines.push(`> **[${action.title}]**${action.detail ? ` ${action.detail}` : ''}${where}`);
    }
    if (chips?.length) lines.push(`> Suggestions: ${chips.map((c) => `“${c}”`).join(', ')}`);
  }
  const all = said(r.reply);
  const facts = s.aboutToday
    ? s.facts
    : [...s.facts, NOT('no filler about today’s pages, no “start today’s revision”', FILLER)];
  const results = facts.map((f) => ({ f, ok: f.not ? !f.re.test(all) && !(f.re === FILLER && r.reply?.action?.kind === 'startRevision') : f.re.test(all) }));
  lines.push('');
  for (const { f, ok } of results) lines.push(`- ${ok ? '✅' : '❌'} ${f.label}`);
  if (s.screen) {
    const a = r.reply?.action;
    const offered = a?.kind === 'openScreen' ? a.screen : null;
    lines.push(`- ${offered === s.screen ? '✅' : '◻️'} offers to open ${s.screen}${offered && offered !== s.screen ? ` (offered ${offered})` : offered ? '' : ' (no screen offered)'} *(not counted)*`);
  }
  const cached = r.usage.cache_read_input_tokens ?? 0;
  lines.push('', `<sub>${words(r.reply?.text)} words · ${r.usage.output_tokens ?? '?'} output tokens · ${cached} cached input tokens · stop: ${r.stop}</sub>`);
  return { text: lines.join('\n'), passed: results.every((x) => x.ok), failed: results.filter((x) => !x.ok).length };
}

(async () => {
  const samples = SAMPLES.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => !ONLY || ONLY.includes(s.n));
  if (DRY) {
    const problems = [];
    if (!REVO_SYSTEM_PROMPT.includes(REVO_GUIDE)) problems.push('the system prompt does not carry the guide');
    const guide = REVO_GUIDE.replace(/'/g, '’');
    for (const s of samples) {
      validateContext(s.ctx);
      const body = buildAskRequest({ day: DAY, question: s.q, context: s.ctx, attach: null, memory: [], history: [] });
      if (body.system[0].text !== REVO_SYSTEM_PROMPT) problems.push(`${s.n}: the system prompt differs`);
      if (s.facts.length === 0) problems.push(`${s.n}: no facts`);
      for (const f of s.facts) if (f.guide && !f.re.test(guide)) problems.push(`${s.n}: “${f.label}” is not in the guide`);
    }
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log(`${samples.length} questions build, every context is valid, and every fact marked “in the guide” is in it. The system prompt is ${REVO_SYSTEM_PROMPT.length} characters (about ${Math.round(REVO_SYSTEM_PROMPT.length / 3.6)} tokens).`);
    return;
  }
  const parts = [];
  let passed = 0;
  let facts = 0;
  let failedFacts = 0;
  let offered = 0;
  let wanted = 0;
  for (const s of samples) {
    const r = await ask(s);
    const out = show(s, r);
    if (out.passed) passed++;
    facts += s.facts.length + (s.aboutToday ? 0 : 1);
    failedFacts += out.failed;
    if (s.screen) {
      wanted++;
      if (r.reply?.action?.kind === 'openScreen' && r.reply.action.screen === s.screen) offered++;
    }
    parts.push(`## ${s.n}. “${s.q}”${s.note ? ` (${s.note})` : ''}`, '', out.text, '');
    console.log(`${s.n}/${SAMPLES.length} ${out.passed ? 'pass' : `FAIL (${out.failed})`} ${s.q}`);
  }
  const head = [
    '# Does Revo know how Revisely works?',
    '',
    `Real replies from claude-sonnet-5-5 with the guide in its prompt (functions/src/revo/guide.ts), ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Made-up tester accounts, not anyone’s data. A fact passes when the answer (its text, and the card’s title and detail) says it; the patterns are in functions/scripts/revo-guide-samples.js.`,
    '',
    `**${passed} of ${samples.length} answers have every fact** (${facts - failedFacts} of ${facts} facts). Revo offered the right screen ${offered} of ${wanted} times (not counted).`,
    '',
  ];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, [...head, ...parts].join('\n'));
  console.log(`${passed}/${samples.length} answers with every fact. Wrote ${OUT}`);
})().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
