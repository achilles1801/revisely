#!/usr/bin/env node
/**
 * Revo's tone, before and after a prompt change, from the real model: ten questions, each asked
 * with the deployed prompt (`--before <git ref>`, see BEFORE_REF) and with this checkout's, against
 * made-up tester accounts (no user's data). Writes a Markdown page to show the owner before the
 * prompt is deployed (functions deploy by hand, after his OK).
 *
 *   cd functions && npm run build && ANTHROPIC_API_KEY=… node scripts/revo-tone-samples.js \
 *     [--before <git ref>] [--same-context] [--out <file.md>] [--dry]
 *
 * The key is read from the environment, sent only to api.anthropic.com, and never written or
 * printed. 20 requests to claude-sonnet-5-5: a few cents.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
// The prompt deployed now (ad395e1, Nov 7 2026).
const BEFORE_REF = arg('--before', 'ad395e1');
const OUT = arg('--out', path.join(os.homedir(), 'Documents/revisely-today-mocks/revo/tone-samples.md'));
// Both sides with today's context (to compare two new prompts); otherwise "before" gets the older app's.
const SAME_CONTEXT = process.argv.includes('--same-context');

const lib = path.join(__dirname, '..', 'lib');
if (!fs.existsSync(path.join(lib, 'revo/prompt.js'))) {
  console.error('Build the functions first: npm run build');
  process.exit(2);
}
const DRY = process.argv.includes('--dry');
const key = process.env.ANTHROPIC_API_KEY;
if (!key && !DRY) {
  console.error('Set ANTHROPIC_API_KEY (it is never printed or stored), or pass --dry to check the requests.');
  process.exit(2);
}

const { ANTHROPIC_URL, ANTHROPIC_VERSION } = require(path.join(lib, 'coach/call.js'));
const { parseReply } = require(path.join(lib, 'revo/reply.js'));
const { contextPages, validateContext } = require(path.join(lib, 'revo/validate.js'));
const { barePageNumbers, replyWords } = require(path.join(lib, 'revo/pageWords.js'));
const after = require(path.join(lib, 'revo/prompt.js'));

/** The prompt module as it was at `ref`, compiled next to the built one (so its imports resolve). */
function promptAt(ref) {
  const ts = require('typescript');
  const source = execFileSync('git', ['show', `${ref}:functions/src/revo/prompt.ts`], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const file = path.join(lib, 'revo', '__prompt_before.js');
  fs.writeFileSync(file, js);
  try {
    return require(file);
  } finally {
    fs.unlinkSync(file);
  }
}
const before = promptAt(BEFORE_REF);

// ---------------------------------------------------------------------------------------------
// Made-up accounts, as the app would send them (src/lib/revo/context.ts). The older app sent the
// same numbers without today's carried/other pages, the week's plan and the streak at risk.
// ---------------------------------------------------------------------------------------------

const DAY = '2026-11-05'; // a Thursday
const shift = (n) => {
  const [y, m, d] = DAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Back to the shape an app from before Nov 7 2026 sent. */
function older(c) {
  const { carriedPages, doneEarlier, otherPages, ...today } = c.today;
  const { streak, passages, pageNames, ...rest } = c;
  return { ...rest, today, week: c.week.map(({ day, pages }) => ({ day, pages })) };
}

// Words for pages, as the app's lib/passages writes them (#317).
const NAMES = {
  542: 'Al-Mujadila, ayahs 1–6 · Juz 28', 543: 'Al-Mujadila, ayahs 7–11 · Juz 28', 544: 'Al-Mujadila, ayahs 12–21 · Juz 28',
  545: 'Al-Mujadila 22 to Al-Hashr 3 · Juz 28', 546: 'Al-Hashr, ayahs 4–9 · Juz 28', 547: 'Al-Hashr, ayahs 10–16 · Juz 28',
  548: 'Al-Hashr, ayahs 17–24 · Juz 28', 549: 'Al-Mumtahanah, ayahs 1–5 · Juz 28', 550: 'Al-Mumtahanah, ayahs 6–11 · Juz 28',
  551: 'Al-Mumtahanah 12 to As-Saf 5 · Juz 28', 552: 'As-Saf, ayahs 6–14 · Juz 28', 553: "Al-Jumu'ah, ayahs 1–8 · Juz 28",
  554: "Al-Jumu'ah 9 to Al-Munafiqun 4 · Juz 28", 555: 'Al-Munafiqun, ayahs 5–11 · Juz 28', 556: 'At-Taghabun, ayahs 1–9 · Juz 28',
  557: 'At-Taghabun, ayahs 10–18 · Juz 28', 558: 'At-Talaq, ayahs 1–5 · Juz 28', 559: 'At-Talaq, ayahs 6–12 · Juz 28',
  560: 'At-Tahrim, ayahs 1–7 · Juz 28', 561: 'At-Tahrim, ayahs 8–12 · Juz 28',
  584: "An-Nazi'at, ayahs 16–46 · Juz 30", 585: "'Abasa · Juz 30", 586: 'At-Takwir · Juz 30',
  587: 'Al-Infitar to Al-Mutaffifin 6 · Juz 30', 588: 'Al-Mutaffifin, ayahs 7–34 · Juz 30',
};
const namesOf = (pages) => Object.fromEntries(pages.map((p) => [String(p), NAMES[p]]));

// Majd's evening (Nov 6): 21 pages added at sign-up today (the end of Juz 30), 5 a day, 3 pages
// revised outside today's five, 1 minute, nothing before today.
const justStarted = {
  totals: {
    memorizedPages: 21, revisedWithin7Days: 3, revisedWithin30Days: 3, daysWithSession30: 1, streakDays: 0, sessions30: 1,
    weakPages: 0, moderatePages: 0, strongPages: 21, weakRevisedLast7Days: 0, pagesPerDay7: 0.4, pagesPerDay30: 0.1, plannedPerDay: 5,
  },
  today: { plannedPages: 5, revisedPages: 0, carriedPages: 0, doneEarlier: 0, otherPages: 3, minutes: 1, memorizedPages: 21, nextPages: range(584, 588), weakNext: [], done: false },
  weakPages: [],
  week: [...range(-6, -1).map((k) => ({ day: shift(k), pages: 0, planned: 0, done: false })), { day: DAY, pages: 3, planned: 5, done: false }],
  streak: { days: 0, atRisk: null },
  passages: { today: "An-Nazi'at 16 to Al-Mutaffifin 34 · Juz 30", startsAt: "An-Nazi'at, ayah 16", next: "An-Nazi'at 16 to Al-Mutaffifin 34 · Juz 30", nextAt: "An-Nazi'at, ayah 16" },
  pageNames: namesOf(range(584, 588)),
  localTime: '23:31',
};

// The Revo mocks' Maryam: Juz 28 at 20 a day, 548–549 weak, 6 of 20 today, 12 days in a row.
const steady = {
  totals: {
    memorizedPages: 20, revisedWithin7Days: 20, revisedWithin30Days: 20, daysWithSession30: 27, streakDays: 12, sessions30: 27,
    weakPages: 2, moderatePages: 4, strongPages: 14, weakRevisedLast7Days: 12, pagesPerDay7: 17.9, pagesPerDay30: 18.1, plannedPerDay: 20,
  },
  today: { plannedPages: 20, revisedPages: 6, carriedPages: 0, doneEarlier: 0, otherPages: 0, minutes: 14, memorizedPages: 0, nextPages: range(548, 561), weakNext: [548, 549], done: false },
  weakPages: [548, 549],
  week: [...range(-6, -1).map((k) => ({ day: shift(k), pages: 20, planned: 20, done: true })), { day: DAY, pages: 6, planned: 20, done: false }],
  streak: { days: 12, atRisk: null },
  passages: {
    today: 'Juz 28',
    startsAt: 'Al-Mujadila',
    next: 'Al-Hashr 17 to At-Tahrim · Juz 28',
    nextAt: 'Al-Hashr, ayah 17',
    weakNext: 'Al-Hashr 17 to Al-Mumtahanah 5 · Juz 28',
    weak: 'Al-Hashr 17 to Al-Mumtahanah 5 · Juz 28',
  },
  pageNames: namesOf(range(548, 561)),
  localTime: '18:40',
};

// The same account the morning after a day left at 6 of 20: the streak can still be kept today.
const missed = {
  ...steady,
  totals: { ...steady.totals, streakDays: 0, pagesPerDay7: 15.1 },
  today: { ...steady.today, plannedPages: 20, revisedPages: 0, nextPages: range(542, 561), weakNext: [548, 549], minutes: 0 },
  week: [...range(-6, -2).map((k) => ({ day: shift(k), pages: 20, planned: 20, done: true })), { day: shift(-1), pages: 6, planned: 20, done: false }, { day: DAY, pages: 0, planned: 20, done: false }],
  streak: { days: 0, atRisk: { previous: 11, yesterdayPlanned: 20, yesterdayDone: 6 } },
  passages: { ...steady.passages, next: 'Juz 28', nextAt: 'Al-Mujadila' },
  pageNames: namesOf(range(542, 561)),
  localTime: '07:15',
};

const SAMPLES = [
  { q: 'How am I doing today?', ctx: justStarted, note: 'Majd’s first question (Nov 6, 23:31), on an account like his' },
  { q: 'Why is my streak at 0?', ctx: justStarted, note: 'Majd’s second question, same account' },
  { q: 'How was my week?', ctx: steady },
  { q: 'Which pages are weakest?', ctx: steady },
  { q: 'How do I keep my streak going?', ctx: steady },
  { q: 'I missed yesterday. What should I do?', ctx: missed },
  { q: 'Where does today start?', ctx: missed, note: 'surah and juz first' },
  { q: 'What’s on page 548?', ctx: steady, note: 'asked in page numbers' },
  { q: 'Can you help me with my maths homework?', ctx: steady, note: 'off-topic' },
  { q: 'If I carry on like this, will I keep all of Juz 28 for good?', ctx: steady, note: 'long-term' },
];

async function ask(build, ctx) {
  const body = build({ day: DAY, question: this.q, context: ctx, attach: null, attached: [], memory: [], history: [] });
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Anthropic answered ${res.status}: ${json?.error?.type ?? 'error'}`);
  const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  // As the handler reads it: charts and actions only on pages the context named.
  const reply = parseReply(text, new Set(contextPages(ctx)), { firstTurn: true });
  return { reply, raw: text, stop: json.stop_reason, out: json.usage?.output_tokens };
}

const words = (s) => (s ? s.trim().split(/\s+/).length : 0);
// Surah-first (the owner's rule): does the answer name a surah or juz, and does it give page numbers?
const SURAH_OR_JUZ = /\b(?:Al|An|At|As|Ash|Ad|Adh|Ar|Az)-[A-Z]|'Abasa|\bJuz \d/;
/** Page numbers on their own (NAME-1): a page number may only follow the surah's name ("Al-Hashr, p. 548"). */
const barePages = (r) => (r.reply ? barePageNumbers(replyWords(r.reply)) : []);
function namesNote(r) {
  if (!r.reply) return '';
  const bare = barePages(r);
  return ` · names a surah or juz: ${SURAH_OR_JUZ.test(replyWords(r.reply)) ? 'yes' : 'no'} · page numbers on their own: ${bare.length ? `❌ ${bare.join(', ')}` : 'none'}`;
}

function show(r) {
  if (!r.reply) return `> (no answer: ${r.stop}) \`${r.raw.slice(0, 200)}\``;
  const { text, chart, textAfter, action, chips } = r.reply;
  const out = [`> ${text.replace(/\n/g, '\n> ')}`];
  if (chart) out.push(`> *[chart: ${chart.title}]*`);
  if (textAfter) out.push(`> ${textAfter}`);
  if (action) out.push(`> **[${action.title}]**${action.detail ? ` ${action.detail}` : ''}`);
  if (chips?.length) out.push(`> Suggestions: ${chips.map((c) => `“${c}”`).join(', ')}`);
  out.push('', `<sub>${words(text)} words · ${r.out} output tokens · stop: ${r.stop}${namesNote(r)}</sub>`);
  return out.join('\n');
}

(async () => {
  if (DRY) {
    // Every context as the server would take it, and both requests built; no call.
    for (const s of SAMPLES) {
      validateContext(s.ctx);
      validateContext(older(s.ctx));
      before.buildAskRequest({ day: DAY, question: s.q, context: older(s.ctx), attach: null, attached: [], memory: [], history: [] });
      after.buildAskRequest({ day: DAY, question: s.q, context: s.ctx, attach: null, attached: [], memory: [], history: [] });
    }
    const r = after.buildAskRequest({ day: DAY, question: SAMPLES[2].q, context: SAMPLES[2].ctx, attach: null, attached: [], memory: [], history: [] });
    console.log(`${SAMPLES.length} samples build. What the model reads with sample 3 (after):\n\n${r.messages[r.messages.length - 1].content}`);
    return;
  }
  const lines = [
    '# Revo’s tone: before and after',
    '',
    `Real replies from claude-sonnet-5-5, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. **Before**: the prompt at ${BEFORE_REF}, with ${SAME_CONTEXT ? 'the same context as after' : 'the context today’s app sends'}. **After**: the new prompt, with the context as the app will send it (today’s numbers as Home shows them, parts of the Qur’an named by surah and juz) written out in plain words. Made-up accounts, not anyone’s data. The day is a Thursday. Questions 1–2 are reconstructed from Majd’s screenshots.`,
    '',
  ];
  const withPages = [];
  for (const [i, s] of SAMPLES.entries()) {
    const b = await ask.call(s, before.buildAskRequest, SAME_CONTEXT ? s.ctx : older(s.ctx));
    const a = await ask.call(s, after.buildAskRequest, s.ctx);
    lines.push(`## ${i + 1}. “${s.q}”${s.note ? ` (${s.note})` : ''}`, '', '**Before**', '', show(b), '', '**After**', '', show(a), '');
    if (barePages(a).length) withPages.push(i + 1);
    console.log(`${i + 1}/${SAMPLES.length} ${s.q}: before ${words(b.reply?.text)} words, after ${words(a.reply?.text)}${barePages(a).length ? ` · PAGE NUMBERS: ${barePages(a).join(', ')}` : ''}`);
  }
  // NAME-1: the new prompt's answers name the surah; a page number only after it.
  lines.splice(4, 0, withPages.length ? `**❌ Page numbers on their own in the new prompt’s answers: ${withPages.join(', ')}.**` : '**✅ No page numbers on their own in the new prompt’s answers.**', '');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`Wrote ${OUT}`);
  if (withPages.length) {
    console.error(`Page numbers on their own (NAME-1) in answers ${withPages.join(', ')}.`);
    process.exit(1);
  }
})().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
