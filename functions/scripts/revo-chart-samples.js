#!/usr/bin/env node
/**
 * Does Revo still answer with its JSON object, and pick a fitting chart, now that it has six chart
 * kinds? Eight chart-shaped questions, each asked a few times of the real model with this
 * checkout's prompt, against a made-up tester account (no user's data). Counts the replies that are
 * the one JSON object, those wrapped in a fence or words, and those in plain prose (no chart, no
 * action, no chips), and which chart each picks. Exits 1 if any reply isn't the bare JSON object.
 * The requests are the functions' own (buildAskRequest), structured output included.
 *
 *   cd functions && npm run build && ANTHROPIC_API_KEY=… node scripts/revo-chart-samples.js \
 *     [--times 3] [--out <file.md>] [--dry]
 *
 * The key is read from the environment, sent only to api.anthropic.com, and never written or
 * printed. 24 requests to claude-sonnet-5-5 by default (the system prompt cached after the first):
 * a few cents.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const TIMES = Math.max(1, Number(arg('--times', '3')) || 3);
const OUT = arg('--out', path.join(os.homedir(), 'Documents/revisely-today-mocks/revo/charts/chart-samples.md'));
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
const { buildAskRequest } = require(path.join(lib, 'revo/prompt.js'));
const { parseReply } = require(path.join(lib, 'revo/reply.js'));
const { contextPages, validateContext } = require(path.join(lib, 'revo/validate.js'));
const { barePageNumbers, replyWords } = require(path.join(lib, 'revo/pageWords.js'));

// ---------------------------------------------------------------------------------------------
// A made-up account, as the app sends it (src/lib/revo/context.ts): the Revo mocks' Maryam, Juz 28
// at 20 pages a day, the end of Al-Hashr and the start of Al-Mumtahanah weak, 6 of 20 done today.
// ---------------------------------------------------------------------------------------------

const DAY = '2026-11-05'; // a Thursday
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
const context = {
  totals: {
    memorizedPages: 100, revisedWithin7Days: 60, revisedWithin30Days: 92, daysWithSession30: 26, streakDays: 12, sessions30: 27,
    weakPages: 2, moderatePages: 14, strongPages: 84, weakRevisedLast7Days: 2, pagesPerDay7: 17.9, pagesPerDay30: 16.4, plannedPerDay: 20,
  },
  today: { plannedPages: 20, revisedPages: 6, carriedPages: 0, doneEarlier: 0, otherPages: 0, minutes: 14, memorizedPages: 0, nextPages: range(548, 561), weakNext: [548, 549], done: false },
  weakPages: [548, 549],
  week: [
    ...range(-6, -1).map((k) => ({ day: shift(k), pages: k === -5 ? 0 : 20, planned: 20, done: k !== -5 })),
    { day: DAY, pages: 6, planned: 20, done: false },
  ],
  streak: { days: 4, atRisk: null },
  passages: {
    today: 'Juz 28',
    startsAt: 'Al-Mujadila',
    next: 'Al-Hashr 17 to At-Tahrim · Juz 28',
    nextAt: 'Al-Hashr, ayah 17',
    weakNext: 'Al-Hashr 17 to Al-Mumtahanah 5 · Juz 28',
    weak: 'Al-Hashr 17 to Al-Mumtahanah 5 · Juz 28',
  },
  pageNames: Object.fromEntries(range(548, 561).map((p) => [String(p), NAMES[p]])),
  localTime: '18:40',
};

/** The questions the charts are for, and the kinds that would fit each (any of them). */
const SAMPLES = [
  { q: 'How was my week?', fits: ['dailyPages'] },
  { q: 'Have I kept up this month?', fits: ['dailyPages', 'weeks'] },
  { q: 'Which juz haven’t I revised lately?', fits: ['juzMap', 'table'] },
  { q: 'Where do I stand across the Qur’an?', fits: ['juzMap'] },
  { q: 'How often do I revise Al-Hashr?', fits: ['timeline'] },
  { q: 'Which days do I usually miss?', fits: ['weeks'] },
  { q: 'Compare Juz 26, 27 and 28.', fits: ['table'] },
  { q: 'Why do the end of Al-Hashr and the start of Al-Mumtahanah keep slipping?', fits: ['pageRatings', 'timeline'] },
];

const request = (q) => buildAskRequest({ day: DAY, question: q, context, attach: null, attached: [], memory: [], history: [] });

/**
 * What the reply is: the bare JSON object (as the prompt asks), the object in a fence or with words
 * around it (read anyway, the words dropped), or plain prose (no chart, no action, no chips).
 */
function shapeOf(raw) {
  const t = raw.trim();
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const o = JSON.parse(t);
      if (o && typeof o === 'object' && typeof o.text === 'string') return 'json';
    } catch {
      // not the object: fall through
    }
  }
  if (/^```(?:json)?\s*\{[\s\S]*\}\s*```$/i.test(t)) return 'fenced';
  return /\{[\s\S]*"text"\s*:/.test(t) ? 'mixed' : 'prose';
}

async function ask(q) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify(request(q)),
  });
  const json = await res.json();
  // The API's own message (never the key): a 400 here says which part of the request it refused.
  if (!res.ok) throw new Error(`Anthropic answered ${res.status}: ${json?.error?.type ?? 'error'}${json?.error?.message ? ` (${String(json.error.message).slice(0, 300)})` : ''}`);
  const raw = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  // As the handler reads it: charts and actions only on pages the context named.
  const reply = parseReply(raw, new Set(contextPages(context)), { firstTurn: true });
  const chart = reply?.visual ?? reply?.chart ?? null;
  return { raw, reply, chart, shape: shapeOf(raw), stop: json.stop_reason, out: json.usage?.output_tokens };
}

const describe = (c) => {
  if (!c) return 'none';
  const extra = c.kind === 'dailyPages' ? ` ${c.days}d` : c.kind === 'timeline' ? ` ${c.surah ? `surah ${c.surah}` : `juz ${c.juz}`} ${c.days}d` : c.kind === 'weeks' ? ` ${c.weeks}w` : c.kind === 'table' ? ` ${c.juz ? `juz ${c.juz.join(',')}` : `surahs ${c.surahs.join(',')}`} [${c.columns.join(',')}]` : c.kind === 'pageRatings' ? ` ${c.pages.join(',')}` : '';
  return `${c.kind}${extra}`;
};

(async () => {
  validateContext(context);
  if (DRY) {
    for (const s of SAMPLES) request(s.q);
    const r = request(SAMPLES[0].q);
    console.log(`${SAMPLES.length} questions build (× ${TIMES} when run). What the model reads with the first:\n\n${r.messages[r.messages.length - 1].content}`);
    return;
  }
  const counts = { json: 0, fenced: 0, mixed: 0, prose: 0 };
  const lines = [
    '# Revo’s charts: does it still answer in JSON, and which chart does it pick?',
    '',
    `Real replies from claude-sonnet-5-5 with this checkout’s prompt, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Each question asked ${TIMES} times; a made-up account (Juz 28, 20 pages a day, the end of Al-Hashr weak).`,
    '',
  ];
  const off = [];
  const fitsMissed = [];
  for (const s of SAMPLES) {
    lines.push(`## “${s.q}” (fits: ${s.fits.join(' or ')})`, '');
    for (let i = 1; i <= TIMES; i++) {
      const r = await ask(s.q);
      counts[r.shape]++;
      const fits = r.chart ? s.fits.includes(r.chart.kind) : false;
      if (r.shape !== 'json') off.push(`“${s.q}” #${i}: ${r.shape}`);
      if (!fits) fitsMissed.push(`“${s.q}” #${i}: ${describe(r.chart)}`);
      const bare = r.reply ? barePageNumbers(replyWords(r.reply)) : [];
      console.log(`${s.q} #${i}: ${r.shape} · chart ${describe(r.chart)}${fits ? '' : ' (doesn’t fit)'} · ${r.out} tokens${bare.length ? ` · PAGE NUMBERS: ${bare.join(', ')}` : ''}`);
      lines.push(
        `**#${i}** · ${r.shape === 'json' ? 'JSON' : `❌ ${r.shape}`} · chart: \`${describe(r.chart)}\`${fits ? '' : ' (doesn’t fit)'}${r.chart ? ` “${r.chart.title}”` : ''} · ${r.out} output tokens · stop: ${r.stop}`,
        '',
        `> ${(r.reply?.text ?? r.raw).replace(/\n/g, '\n> ')}`,
        '',
      );
    }
  }
  const total = SAMPLES.length * TIMES;
  const summary = [
    `**${counts.json} of ${total} replies were the bare JSON object**${counts.json === total ? ' ✅' : ` ❌ (fenced ${counts.fenced}, words around it ${counts.mixed}, plain prose ${counts.prose})`}.`,
    '',
    fitsMissed.length ? `Charts that don’t fit the question (or none): ${fitsMissed.length} of ${total}:\n${fitsMissed.map((x) => `- ${x}`).join('\n')}` : 'Every reply picked a fitting chart.',
    '',
  ];
  lines.splice(4, 0, ...summary);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`\n${summary.join('\n')}\nWrote ${OUT}`);
  if (off.length) {
    console.error(`Not the bare JSON object:\n${off.join('\n')}`);
    process.exit(1);
  }
})().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
