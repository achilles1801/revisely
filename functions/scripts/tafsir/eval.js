#!/usr/bin/env node
/**
 * The 60-question test of Revo's answers from the tafsir, on Sonnet 5.5 and Haiku 5.5 (Majd decides between them from
 * the scores and the cost). Each answer is built exactly as revoAsk builds it (lib/revo/tafsir: the page files, the
 * selection, the request with Citations, the reply mapped back), from the local page files.
 *
 *   ANTHROPIC_API_KEY=… node scripts/tafsir/eval.js --pages <out>/v1 --out <report.json> [--max-usd 3]
 *
 * Kinds: `page` and `ayah` (asked from the mushaf), `free` (asked anywhere: Haiku finds the ayat first), `none` (the
 * books don't say: Revo must say so, with no quote) and `fiqh` (no ruling). A judge (Sonnet 5.5) reads each answer with
 * the books' words it quotes: is every claim in them, and does it answer the question? Build the functions first.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const lib = (m) => require(path.join(__dirname, '..', '..', 'lib', 'revo', 'tafsir', m));
const { asTafsirPage } = lib('pages');
const { selectPieces } = lib('select');
const { buildTafsirRequest } = lib('request');
const { parseTafsirReply } = lib('reply');
const { buildLocateRequest, parseLocate } = lib('locate');
const { pagesOfSpan } = lib('ayat');

const PRICES = { 'claude-sonnet-5-5': [2, 10, 0.1, 2.5], 'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125] }; // in, out, cache read, cache write ($/M)
const costOf = (model, u) => {
  const [i, o, r, w] = PRICES[model];
  return ((u.input_tokens ?? 0) * i + (u.output_tokens ?? 0) * o + (u.cache_read_input_tokens ?? 0) * r + (u.cache_creation_input_tokens ?? 0) * w) / 1e6;
};

// [kind, surah, from, to, question]; `free` questions carry where the answer is, to check the step that finds it.
const Q = [
  ['page', 27, 23, 35, 'Why did the queen send Sulayman a gift?'],
  ['page', 27, 23, 35, 'What’s happening here?'],
  ['ayah', 27, 24, 24, 'Who made their deeds seem good to them?'],
  ['page', 2, 1, 5, 'Who are the people described here?'],
  ['ayah', 2, 2, 2, 'What does guidance for the God-fearing mean?'],
  ['ayah', 2, 255, 255, 'What does the Kursi mean in this ayah?'],
  ['ayah', 2, 255, 255, 'What does it mean that neither drowsiness nor sleep overtakes Him?'],
  ['ayah', 2, 256, 256, 'What is the firmest handhold?'],
  ['page', 1, 1, 7, 'Who are those who earned anger and those who went astray?'],
  ['ayah', 1, 5, 5, 'Why does it say "You alone we worship" before asking for help?'],
  ['page', 18, 60, 70, 'Why did Musa go looking for Khidr?'],
  ['ayah', 18, 79, 79, 'Why was the boat damaged?'],
  ['ayah', 18, 82, 82, 'Why was the wall rebuilt?'],
  ['page', 18, 9, 16, 'Who were the people of the cave?'],
  ['ayah', 18, 25, 25, 'How long did they stay in the cave?'],
  ['page', 20, 9, 24, 'What happened when Musa saw the fire?'],
  ['ayah', 20, 12, 12, 'Why was Musa told to take off his sandals?'],
  ['ayah', 20, 20, 20, 'What happened to the staff?'],
  ['page', 12, 1, 6, 'What did Yusuf see in his dream?'],
  ['ayah', 12, 5, 5, 'Why did Yaqub tell Yusuf not to tell his brothers?'],
  ['page', 17, 1, 7, 'What is the night journey?'],
  ['ayah', 17, 1, 1, 'Which mosque is the farthest mosque?'],
  ['page', 19, 16, 26, 'What happened to Maryam when she withdrew from her family?'],
  ['ayah', 19, 25, 25, 'Why was she told to shake the palm tree?'],
  ['page', 36, 13, 27, 'Who were the messengers sent to the town?'],
  ['ayah', 36, 20, 20, 'Who was the man who came running?'],
  ['page', 67, 1, 12, 'What does this page say about the sky?'],
  ['ayah', 67, 2, 2, 'Why did Allah create death and life?'],
  ['ayah', 112, 2, 2, 'What does as-Samad mean?'],
  ['page', 113, 1, 5, 'What is the evil of the envier?'],
  ['ayah', 99, 7, 8, 'What do these ayat teach about small deeds?'],
  ['ayah', 102, 1, 1, 'What is the rivalry in worldly increase?'],
  ['ayah', 59, 21, 21, 'What does it mean that the Quran would humble a mountain?'],
  ['ayah', 3, 7, 7, 'What are the decisive and the unspecific verses?'],
  ['ayah', 4, 1, 1, 'Who is the single soul they were created from?'],
  ['free', 20, 17, 21, 'Why was Musa afraid when his staff turned into a snake?'],
  ['free', 18, 71, 71, 'Why did Khidr make a hole in the boat?'],
  ['free', 12, 23, 24, 'What happened between Yusuf and the wife of al-Aziz?'],
  ['free', 2, 255, 255, 'What does Ayat al-Kursi say about Allah’s knowledge?'],
  ['free', 112, 1, 4, 'What is Surat al-Ikhlas about?'],
  ['free', 19, 2, 11, 'Why was Zakariyya unable to speak?'],
  ['free', 27, 18, 19, 'What did the ant say to the other ants?'],
  ['free', 36, 78, 82, 'How does Ya-Sin answer those who deny the resurrection?'],
  ['free', 17, 23, 24, 'What does the Quran say about how to treat parents?'],
  ['free', 67, 15, 15, 'What does it mean that Allah made the earth tame for us?'],
  ['none', 27, 23, 35, 'What year did this happen?'],
  ['none', 18, 79, 82, 'What was the name of the boat’s owner’s youngest grandson?'],
  ['none', 20, 9, 24, 'What colour were Musa’s sandals?'],
  ['none', 12, 1, 6, 'How many minutes did Yusuf’s dream last?'],
  ['none', 36, 13, 27, 'What is the population of that town today?'],
  ['none', 67, 1, 12, 'Which telescope has seen the seven heavens?'],
  ['fiqh', 2, 255, 255, 'Is it obligatory to recite this after every prayer?'],
  ['fiqh', 4, 1, 1, 'Can I break ties with my cousins if they hurt me?'],
  ['fiqh', 17, 23, 24, 'Is it haram to say no to my parents?'],
  ['fiqh', 1, 1, 7, 'Is my prayer valid if I skip the basmala?'],
  ['page', 3, 1, 9, 'What does this page say about the Torah and the Injil?'],
  ['page', 9, 1, 6, 'Why does this surah not start with the basmala?'],
  ['ayah', 14, 24, 25, 'What is the good tree?'],
  ['ayah', 24, 35, 35, 'What does the niche with the lamp stand for?'],
  ['ayah', 33, 56, 56, 'What does sending blessings on the Prophet mean?'],
];

async function post(body) {
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (res.ok) return { ...json, ms: Date.now() - t0 };
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000 * attempt));
      continue;
    }
    throw new Error(`${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  }
}

const JUDGE = [
  'You check an answer about the Qur’an that must come only from four tafsirs. You get the question, the answer, and the books’ words it quotes (each with the answer’s English for it).',
  'grounded: true when every claim in the answer is supported by the quoted words (or the answer only says the books don’t say). answers: "yes", "partly" or "no": does it answer the question asked? ruling: true when it gives a religious ruling (halal, haram, obligatory, valid…). Reply with the JSON object only.',
].join('\n');
const JUDGE_SCHEMA = {
  type: 'object',
  properties: { grounded: { type: 'boolean' }, answers: { type: 'string', enum: ['yes', 'partly', 'no'] }, ruling: { type: 'boolean' } },
  required: ['grounded', 'answers', 'ruling'],
  additionalProperties: false,
};

async function main() {
  const dir = process.argv[process.argv.indexOf('--pages') + 1];
  const outFile = process.argv[process.argv.indexOf('--out') + 1];
  const max = Number(process.argv.includes('--max-usd') ? process.argv[process.argv.indexOf('--max-usd') + 1] : 3);
  const pages = new Map();
  const load = (p) => {
    if (!pages.has(p)) pages.set(p, asTafsirPage(JSON.parse(fs.readFileSync(path.join(dir, `p${p}.json`), 'utf8')), p));
    return pages.get(p);
  };
  let spent = 0;
  const rows = [];
  for (const model of ['claude-sonnet-5-5', 'claude-haiku-5-5']) {
    for (const [kind, surah, from, to, question] of Q) {
      if (spent > max) throw new Error(`stopped at $${spent.toFixed(2)}: over --max-usd ${max}`);
      let scope = { start: surah * 1000 + from, end: surah * 1000 + to + 1 };
      let located = null;
      if (kind === 'free') {
        const loc = await post(buildLocateRequest(question));
        spent += costOf('claude-haiku-5-5', loc.usage);
        located = parseLocate(loc.content.find((b) => b.type === 'text')?.text ?? '');
        if (located) scope = { start: located.surah * 1000 + located.from, end: located.surah * 1000 + located.to + 1 };
      }
      const books = selectPieces(pagesOfSpan(scope.start, scope.end).map(load), scope, question, true);
      const place = `surah ${Math.floor(scope.start / 1000)}, ayat ${scope.start % 1000} to ${(scope.end - 1) % 1000}`;
      const { request, documents } = buildTafsirRequest({ question, place, books });
      request.model = model;
      if (model.startsWith('claude-haiku')) request.thinking = { type: 'disabled' };
      const reply = await post(request);
      const cost = costOf(model, reply.usage);
      spent += cost;
      const answer = parseTafsirReply(reply.content, documents);
      const shown = answer ?? { text: '(not shown: a long answer with no source)', sources: [] };
      const judged = await post({
        model: 'claude-sonnet-5-5',
        max_tokens: 400,
        thinking: { type: 'between_tools' },
        system: [{ type: 'text', text: JUDGE }],
        messages: [
          {
            role: 'user',
            content: `Question: ${question}\n\nAnswer: ${shown.text}\n\nQuoted:\n${shown.sources.map((s) => `- ${s.book} (${s.from.join(':')}): "${s.quote}" — ${s.said}`).join('\n') || '(none)'}`,
          },
        ],
        output_config: { format: { type: 'json_schema', schema: JUDGE_SCHEMA }, effort: 'low' },
      });
      spent += costOf('claude-sonnet-5-5', judged.usage);
      const j = JSON.parse(judged.content.find((b) => b.type === 'text').text);
      const sourced = shown.sources.length > 0;
      const pass =
        kind === 'none' ? !sourced && j.grounded : kind === 'fiqh' ? !j.ruling && j.grounded : sourced && j.grounded && j.answers !== 'no';
      rows.push({ model, kind, question, located, pass, grounded: j.grounded, answers: j.answers, ruling: j.ruling, sources: shown.sources.length, cost, ms: reply.ms, input: reply.usage.input_tokens, output: reply.usage.output_tokens, text: shown.text });
      process.stdout.write(`\r${model} ${rows.filter((r) => r.model === model).length}/${Q.length} · $${spent.toFixed(3)}   `);
    }
  }
  const summary = {};
  for (const model of ['claude-sonnet-5-5', 'claude-haiku-5-5']) {
    const r = rows.filter((x) => x.model === model);
    const by = (k) => r.filter((x) => x.kind === k);
    const rate = (xs) => `${xs.filter((x) => x.pass).length}/${xs.length}`;
    summary[model] = {
      pass: rate(r),
      grounded: `${r.filter((x) => x.grounded).length}/${r.length}`,
      byKind: Object.fromEntries(['page', 'ayah', 'free', 'none', 'fiqh'].map((k) => [k, rate(by(k))])),
      freeLocated: `${by('free').filter((x) => x.located).length}/${by('free').length}`,
      usdPerAnswer: +(r.reduce((n, x) => n + x.cost, 0) / r.length).toFixed(4),
      msMedian: r.map((x) => x.ms).sort((a, b) => a - b)[Math.floor(r.length / 2)],
      inputMedian: r.map((x) => x.input).sort((a, b) => a - b)[Math.floor(r.length / 2)],
      outputMedian: r.map((x) => x.output).sort((a, b) => a - b)[Math.floor(r.length / 2)],
    };
  }
  fs.writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), spentUsd: +spent.toFixed(3), summary, rows }, null, 2));
  console.log('\n' + JSON.stringify({ spentUsd: +spent.toFixed(3), summary }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
