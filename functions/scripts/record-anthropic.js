#!/usr/bin/env node
/**
 * Records real Messages API replies for the functions emulator (functions/src/emulator.ts,
 * TESTING.md): one per kind of request our functions send (Revo's question, Revo's day in review,
 * the Ask coach), built with the functions' own request builders for a made-up account's numbers
 * (no user's data), plus Anthropic's real answer to a rejected key. Each is written to
 * functions/test-recordings/anthropic/<kind>.json with the request it was made with, so the
 * emulator can say when the functions' request has moved on from it ("drift").
 *
 * Run it again when a request changes (model, max_tokens, thinking, the system prompt): the
 * scenario test "[TEST-1]" fails on drift until then. It costs a few cents.
 *
 *   cd functions && npm run build && ANTHROPIC_API_KEY=… node scripts/record-anthropic.js [kind…]
 *   (--dry builds every request without a call)
 *
 * The key is read from the environment, sent only to api.anthropic.com, and never written or
 * printed. Response headers are not kept (they carry request ids and rate-limit state).
 */
const fs = require('fs');
const path = require('path');

const lib = path.join(__dirname, '..', 'lib');
if (!fs.existsSync(path.join(lib, 'emulator.js'))) {
  console.error('Build the functions first: npm run build');
  process.exit(2);
}
const { ANTHROPIC_URL, ANTHROPIC_VERSION } = require(path.join(lib, 'coach/call.js'));
const { buildAskRequest, buildReviewRequest } = require(path.join(lib, 'revo/prompt.js'));
const { buildCoachRequest } = require(path.join(lib, 'coach/prompt.js'));
const { shortRequest, kindOf } = require(path.join(lib, 'emulator.js'));
const { validateContext } = require(path.join(lib, 'revo/validate.js'));

const OUT = path.join(__dirname, '..', 'test-recordings', 'anthropic');
const DAY = '2026-11-03';

// A made-up account: 120 pages memorized, 10 a day, part of today done (Juz 30's end), as the app
// sends it today (src/lib/revo/context.ts): Home's numbers, the week with its plan, the streak, and
// the parts of the Qur'an worded surah and juz first. The words are the app's own contextWords()
// (src/lib/revo/words.ts) for these pages: today 583–592, next 587–592, weak next 589, weak 589, 12,
// 595 and 3. Change the pages, change the words with them (Nov 7 2026: a fixture with page numbers
// alone got replies saying "page 587", which no tester's app would get).
const context = {
  totals: {
    memorizedPages: 120,
    revisedWithin7Days: 64,
    revisedWithin30Days: 118,
    daysWithSession30: 24,
    streakDays: 2,
    sessions30: 27,
    weakPages: 4,
    moderatePages: 18,
    strongPages: 98,
    weakRevisedLast7Days: 2,
    pagesPerDay7: 9,
    pagesPerDay30: 8.4,
    plannedPerDay: 10,
  },
  today: {
    plannedPages: 10,
    revisedPages: 4,
    carriedPages: 0,
    doneEarlier: 0,
    otherPages: 0,
    minutes: 22,
    memorizedPages: 0,
    nextPages: [587, 588, 589, 590, 591, 592],
    weakNext: [589],
    done: false,
  },
  weakPages: [589, 12, 595, 3],
  week: [
    { day: '2026-10-28', pages: 10, planned: 10, done: true },
    { day: '2026-10-29', pages: 9, planned: 10, done: false },
    { day: '2026-10-30', pages: 10, planned: 10, done: true },
    { day: '2026-10-31', pages: 0, planned: 10, done: false },
    { day: '2026-11-01', pages: 10, planned: 10, done: true },
    { day: '2026-11-02', pages: 10, planned: 10, done: true },
    { day: DAY, pages: 4, planned: 10, done: false },
  ],
  streak: { days: 2, atRisk: null },
  passages: {"today": "An-Naba 31 to Al-Ghashiyah · Juz 30", "startsAt": "An-Naba, ayah 31", "next": "Al-Infitar to Al-Ghashiyah · Juz 30", "nextAt": "Al-Infitar", "weakNext": "Al-Mutaffifin 35 to Al-Inshiqaq · Juz 30", "weak": "Al-Baqarah 6–16, Al-Baqarah 77–83 and 2 more"},
  pageNames: {"3": "Al-Baqarah, ayahs 6–16 · Juz 1", "12": "Al-Baqarah, ayahs 77–83 · Juz 1", "587": "Al-Infitar to Al-Mutaffifin 6 · Juz 30", "588": "Al-Mutaffifin, ayahs 7–34 · Juz 30", "589": "Al-Mutaffifin 35 to Al-Inshiqaq · Juz 30", "590": "Al-Buruj · Juz 30", "591": "At-Tariq to Al-A'la 15 · Juz 30", "592": "Al-A'la 16 to Al-Ghashiyah · Juz 30", "595": "Ash-Shams to Al-Layl 14 · Juz 30"},
  localTime: '19:40',
};

const REQUESTS = {
  'revo-ask': () =>
    buildAskRequest({ day: DAY, question: 'How was my week?', context, attached: [], memory: [], history: [], chat: null }),
  'revo-review': () => buildReviewRequest({ day: DAY, context: { ...context, localTime: '21:10' }, memory: [] }),
  coach: () => buildCoachRequest('pace', { pagesPerDay7: 9.1, pagesPerDay30: 8.4, plannedPerDay: 10 }),
};

async function post(body, key) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function write(name, rec) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), `${JSON.stringify(rec, null, 2)}\n`);
  const usage = rec.body && rec.body.usage ? JSON.stringify(rec.body.usage) : '';
  console.log(`${name}: ${rec.status} ${rec.body.stop_reason ?? rec.body.error?.type ?? ''} ${usage}`);
}

(async () => {
  // --dry: build every request and check the emulator reads it as its kind; no call, no key.
  if (process.argv.includes('--dry')) {
    validateContext(context);
    for (const [name, build] of Object.entries(REQUESTS)) {
      const request = build();
      if (kindOf(request) !== name) throw new Error(`${name}: the emulator would read this request as ${kindOf(request)}`);
    }
    console.log(`${Object.keys(REQUESTS).join(', ')}: every request builds and reads as its kind.`);
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error('Set ANTHROPIC_API_KEY, or pass --dry to check the requests.');
    process.exit(2);
  }
  const only = process.argv.slice(2);
  const want = (k) => only.length === 0 || only.includes(k);
  for (const [name, build] of Object.entries(REQUESTS)) {
    if (!want(name)) continue;
    const request = build();
    if (kindOf(request) !== name) throw new Error(`${name}: the emulator would read this request as ${kindOf(request)}`);
    const { status, body } = await post(request, key);
    if (status !== 200) throw new Error(`${name}: Anthropic answered ${status} ${JSON.stringify(body).slice(0, 300)}`);
    write(name, { recordedAt: new Date().toISOString(), how: 'functions/scripts/record-anthropic.js', request: shortRequest(request), status, body });
  }
  if (want('error-401')) {
    // Anthropic's real answer to a key it doesn't know (the emulator's `rejected` mode).
    const request = REQUESTS.coach();
    const { status, body } = await post(request, 'sk-ant-not-a-key');
    if (status !== 401) throw new Error(`error-401: Anthropic answered ${status}`);
    write('error-401', { recordedAt: new Date().toISOString(), how: 'functions/scripts/record-anthropic.js (an unknown key)', request: shortRequest(request), status, body });
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
