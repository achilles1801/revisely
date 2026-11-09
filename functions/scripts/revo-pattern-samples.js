#!/usr/bin/env node
/**
 * Revo and the patterns in someone's days (REVO-40), from the real model with this checkout's prompt:
 * one question for each pattern, and the cases where it should say nothing (an ordinary week, a how-to
 * question, several patterns at once). Made-up accounts, not anyone's data. Each reply is checked:
 * the pattern it should mention (or none), at most one, no guilt or flattery, nothing about strength
 * with Smart Tracking off, no page numbers on their own. Writes a Markdown page to show the owner
 * before the prompt is recorded and deployed.
 *
 *   cd functions && npm run build && ANTHROPIC_API_KEY=… node scripts/revo-pattern-samples.js [--out <file.md>] [--dry]
 *
 * The key is read from the environment, sent only to api.anthropic.com, and never written or printed.
 * About 10 requests to claude-sonnet-5-5: a few cents. --dry checks every context and request, no call.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const OUT = arg('--out', path.join(os.homedir(), 'Documents/revisely-today-mocks/revo/pattern-samples.md'));
const DRY = process.argv.includes('--dry');

const lib = path.join(__dirname, '..', 'lib');
if (!fs.existsSync(path.join(lib, 'revo/prompt.js'))) {
  console.error('Build the functions first: npm run build');
  process.exit(2);
}
const key = process.env.ANTHROPIC_API_KEY;
if (!key && !DRY) {
  console.error('Set ANTHROPIC_API_KEY (it is never printed or stored), or pass --dry to check the requests.');
  process.exit(2);
}

const { ANTHROPIC_URL, ANTHROPIC_VERSION } = require(path.join(lib, 'coach/call.js'));
const { parseReply } = require(path.join(lib, 'revo/reply.js'));
const { contextPages, validateContext } = require(path.join(lib, 'revo/validate.js'));
const { barePageNumbers, replyWords } = require(path.join(lib, 'revo/pageWords.js'));
const { buildAskRequest, buildReviewRequest } = require(path.join(lib, 'revo/prompt.js'));

// ---------------------------------------------------------------------------------------------
// Made-up accounts, as the app sends them (src/lib/revo/context.ts, lib/revo/patterns.ts): Juz 28
// at 20 pages a day. The day is a Thursday.
// ---------------------------------------------------------------------------------------------

const DAY = '2026-11-05';
const shift = (n) => {
  const [y, m, d] = DAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const NAMES = {
  548: 'Al-Hashr, ayahs 17–24 · Juz 28', 549: 'Al-Mumtahanah, ayahs 1–5 · Juz 28', 550: 'Al-Mumtahanah, ayahs 6–11 · Juz 28',
  551: 'Al-Mumtahanah 12 to As-Saf 5 · Juz 28', 552: 'As-Saf, ayahs 6–14 · Juz 28', 553: "Al-Jumu'ah, ayahs 1–8 · Juz 28",
  554: "Al-Jumu'ah 9 to Al-Munafiqun 4 · Juz 28", 555: 'Al-Munafiqun, ayahs 5–11 · Juz 28', 556: 'At-Taghabun, ayahs 1–9 · Juz 28',
  557: 'At-Taghabun, ayahs 10–18 · Juz 28', 558: 'At-Talaq, ayahs 1–5 · Juz 28', 559: 'At-Talaq, ayahs 6–12 · Juz 28',
  560: 'At-Tahrim, ayahs 1–7 · Juz 28', 561: 'At-Tahrim, ayahs 8–12 · Juz 28',
};
const namesOf = (pages) => Object.fromEntries(pages.map((p) => [String(p), NAMES[p]]));
const day = (k, pages, done, extra = {}) => ({ day: shift(k), pages, planned: 20, done, caughtUp: 0, ahead: 0, started: '07:10', ...extra });

/** Every day done on its own day, mornings; today done; a 5-day streak. Nothing worth saying. */
const ordinary = {
  totals: {
    memorizedPages: 120, revisedWithin7Days: 120, revisedWithin30Days: 120, daysWithSession30: 25, streakDays: 5, sessions30: 25,
    weakPages: 4, moderatePages: 20, strongPages: 96, weakRevisedLast7Days: 4, pagesPerDay7: 20, pagesPerDay30: 17.5, plannedPerDay: 20,
  },
  today: { plannedPages: 20, revisedPages: 20, carriedPages: 0, doneEarlier: 0, otherPages: 0, minutes: 25, memorizedPages: 0, nextPages: [], weakNext: [], done: true },
  weakPages: [548, 549],
  week: [day(-6, 0, false, { started: null }), day(-5, 20, true), day(-4, 20, true), day(-3, 20, true), day(-2, 20, true), day(-1, 20, true), day(0, 20, true)],
  streak: { days: 5, atRisk: null },
  patterns: [],
  passages: { today: 'Al-Hashr 17 to At-Tahrim · Juz 28', weak: 'Al-Hashr 17 to Al-Mumtahanah 5 · Juz 28' },
  pageNames: namesOf([548, 549]),
  localTime: '19:20',
};

/** Tuesday and Wednesday missed; today (Thursday) made up for both, on top of its own; Keep daily amount off. */
const catchingUp = {
  ...ordinary,
  totals: { ...ordinary.totals, streakDays: 1, pagesPerDay7: 17.1 },
  today: { ...ordinary.today, otherPages: 40, minutes: 70 },
  week: [
    day(-6, 20, true),
    day(-5, 20, true),
    day(-4, 20, true),
    day(-3, 20, true),
    day(-2, 0, true, { started: null }),
    day(-1, 0, true, { started: null }),
    day(0, 60, true, { caughtUp: 40, started: '19:05' }),
  ],
  streak: { days: 1, atRisk: null },
  patterns: [{ kind: 'catchingUp', day: DAY, pages: 40, forDays: [shift(-2), shift(-1)], keepDailyAmount: false }],
};

/** Monday revised the next 6 days ahead (120 pages); Tuesday to today had nothing left to revise. */
const aheadBurst = {
  ...ordinary,
  today: { ...ordinary.today, revisedPages: 20, doneEarlier: 20, minutes: 0 },
  week: [day(-6, 20, true), day(-5, 20, true), day(-4, 20, true), day(-3, 140, true, { ahead: 120, started: '20:30' }), day(-2, 0, true, { started: null }), day(-1, 0, true, { started: null }), day(0, 0, true, { started: null })],
  patterns: [{ kind: 'aheadBurst', day: shift(-3), pages: 120, days: 6, quietDays: 3 }],
};

/** Every day done, but most started late at night. */
const lateNights = {
  ...ordinary,
  week: [day(-6, 20, true, { started: '23:40' }), day(-5, 20, true, { started: '00:20' }), day(-4, 20, true, { started: '18:00' }), day(-3, 20, true, { started: '23:15' }), day(-2, 20, true, { started: '22:50' }), day(-1, 20, true, { started: '23:55' }), day(0, 20, true, { started: '22:40' })],
  streak: { days: 9, atRisk: null },
  totals: { ...ordinary.totals, streakDays: 9 },
  patterns: [{ kind: 'lateNights', late: 6, of: 7 }],
  localTime: '23:10',
};

/** Fifteen days in a row, each on its own day. */
const steady = {
  ...ordinary,
  week: range(-6, 0).map((k) => day(k, 20, true)),
  streak: { days: 15, atRisk: null },
  totals: { ...ordinary.totals, streakDays: 15 },
  patterns: [{ kind: 'steady', days: 15 }],
};

/** Catching up and late nights at once: at most one may be said. */
const both = { ...catchingUp, patterns: [...catchingUp.patterns, { kind: 'lateNights', late: 4, of: 6 }] };

// What each pattern sounds like in a reply (any of them counts as a mention).
const SAID = {
  catchingUp: /making up|made up|catch(?:ing)? up|caught up|catch-up|missed (?:days|tuesday|wednesday)/i,
  aheadBurst: /\bahead\b|in one go|all at once|spread/i,
  // Whole words: "tonight" and "later" aren't about late nights (samples at 0a7fba6b, #1).
  lateNights: /late at night|late-night|\bat night\b|\blate\b|\bnights?\b/i,
  steady: /in a row|every day|steady|consistent|each day/i,
};
const FLATTERY = /amazing|keep it up|journey|incredible|fantastic|proud of you|superstar/i;
const GUILT = /you should have|you failed|disappoint|lazy|no excuse/i;
const STRENGTH = /weak|strong|strength|rating/i;
// A week with days made up later wasn't done every day (samples at 0a7fba6b, #1: "you finished the whole plan every day,
// and tonight you made up for Tuesday and yesterday").
const EVERY_DAY = /(?:whole|full|entire) plan every day|every day (?:this|of the) week|done every day|finished (?:it )?every day|all (?:seven|7) days/i;

const SAMPLES = [
  { q: 'How did my week go?', ctx: catchingUp, expect: 'catchingUp', note: 'Tuesday and Wednesday made up on Thursday, Keep daily amount off' },
  { q: 'Why was today so long?', ctx: catchingUp, expect: 'catchingUp', mustSay: /keep daily amount/i, note: 'the suggestion should be Keep daily amount' },
  { q: 'How is my revision going?', ctx: aheadBurst, expect: 'aheadBurst', note: 'six days revised ahead on Monday, quiet since' },
  { q: 'Any tips for my routine?', ctx: lateNights, expect: 'lateNights', note: 'six of seven days started after 10 PM' },
  { q: 'How am I doing?', ctx: steady, expect: 'steady', note: 'a 15-day streak: one honest word, no flattery' },
  { q: 'How was my week?', ctx: ordinary, expect: null, note: 'an ordinary week: nothing to point out' },
  { q: 'How do I change the reciter?', ctx: catchingUp, expect: null, note: 'a how-to question: no pattern, even with one in the context' },
  { q: 'How was my week?', ctx: both, expect: 'one', note: 'two patterns in the context: at most one said' },
  { q: 'How is my revision going?', ctx: aheadBurst, expect: 'aheadBurst', smartTracking: false, note: 'Smart Tracking off: nothing about strength' },
  { review: true, ctx: catchingUp, expect: 'catchingUp', note: 'the Day in review of the day that caught up' },
];

function request(s) {
  if (s.review) return buildReviewRequest({ day: DAY, context: s.ctx, memory: [], smartTracking: s.smartTracking, tester: true });
  return buildAskRequest({ day: DAY, question: s.q, context: s.ctx, attached: [], memory: [], history: [], smartTracking: s.smartTracking, tester: true });
}

async function ask(s) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify(request(s)),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Anthropic answered ${res.status}: ${json?.error?.type ?? 'error'}`);
  const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { reply: parseReply(text, new Set(contextPages(s.ctx)), { firstTurn: true }), raw: text, stop: json.stop_reason };
}

/** What the reply mentions, and whether that's what the sample expects. */
function checks(s, r) {
  if (!r.reply) return [`❌ no answer (${r.stop})`];
  const words = replyWords(r.reply);
  const said = Object.keys(SAID).filter((k) => SAID[k].test(words));
  const named = said.filter((k) => k !== 'steady');
  const out = [];
  if (s.expect === null) out.push(named.length === 0 ? '✅ no pattern mentioned' : `❌ mentions ${named.join(', ')}`);
  else if (s.expect === 'one') out.push(named.length <= 1 ? `✅ at most one pattern (${named.join(', ') || 'none'})` : `❌ mentions ${named.join(' and ')}`);
  else out.push(said.includes(s.expect) ? `✅ mentions ${s.expect}` : `❌ doesn’t mention ${s.expect}`);
  if (s.expect && s.expect !== 'one' && named.filter((k) => k !== s.expect).length > 0) out.push(`❌ also mentions ${named.filter((k) => k !== s.expect).join(', ')}`);
  if (s.mustSay) out.push(s.mustSay.test(words) ? `✅ says ${s.mustSay.source}` : `❌ doesn’t say ${s.mustSay.source}`);
  if (FLATTERY.test(words)) out.push(`❌ flattery: ${words.match(FLATTERY)[0]}`);
  if (GUILT.test(words)) out.push(`❌ guilt: ${words.match(GUILT)[0]}`);
  if ((s.ctx.patterns ?? []).some((p) => p.kind === 'catchingUp') && EVERY_DAY.test(words)) {
    out.push(`❌ says every day was done, but days were made up later: ${words.match(EVERY_DAY)[0]}`);
  }
  if (s.smartTracking === false && STRENGTH.test(words)) out.push(`❌ strength with Smart Tracking off: ${words.match(STRENGTH)[0]}`);
  const bare = barePageNumbers(words);
  if (bare.length) out.push(`❌ page numbers on their own: ${bare.join(', ')}`);
  return out;
}

function show(r) {
  if (!r.reply) return `> (no answer: ${r.stop}) \`${r.raw.slice(0, 200)}\``;
  const { text, chart, textAfter, action, chips } = r.reply;
  const out = [`> ${text.replace(/\n/g, '\n> ')}`];
  if (chart) out.push(`> *[chart: ${chart.title}]*`);
  if (textAfter) out.push(`> ${textAfter}`);
  if (action) out.push(`> **[${action.title}]**${action.detail ? ` ${action.detail}` : ''}`);
  if (chips?.length) out.push(`> Suggestions: ${chips.map((c) => `“${c}”`).join(', ')}`);
  return out.join('\n');
}

(async () => {
  for (const s of SAMPLES) {
    validateContext(s.ctx);
    request(s);
  }
  if (DRY) {
    const r = request(SAMPLES[0]);
    console.log(`${SAMPLES.length} samples build. What the model reads with sample 1:\n\n${r.messages[r.messages.length - 1].content}`);
    return;
  }
  const lines = [
    '# Revo and the patterns in someone’s days (REVO-40)',
    '',
    `Real replies from claude-sonnet-5-5 with this checkout’s prompt, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Made-up accounts (Juz 28, 20 pages a day), not anyone’s data. The day is a Thursday. Each reply is checked automatically: the pattern it should mention (or none), at most one, no flattery or guilt, nothing about strength with Smart Tracking off, no page numbers on their own.`,
    '',
  ];
  let failed = 0;
  for (const [i, s] of SAMPLES.entries()) {
    const r = await ask(s);
    const c = checks(s, r);
    failed += c.some((x) => x.startsWith('❌')) ? 1 : 0;
    lines.push(`## ${i + 1}. ${s.review ? 'Day in review' : `“${s.q}”`} (${s.note})`, '', show(r), '', c.map((x) => `- ${x}`).join('\n'), '');
    console.log(`${i + 1}/${SAMPLES.length} ${s.review ? 'Day in review' : s.q}: ${c.join(' · ')}`);
  }
  lines.splice(4, 0, failed ? `**❌ ${failed} of ${SAMPLES.length} replies failed a check.**` : `**✅ All ${SAMPLES.length} replies passed their checks.**`, '');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`Wrote ${OUT}`);
  if (failed) process.exit(1);
})().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
