#!/usr/bin/env node
/**
 * "What's happening here?" answered ahead for every mushaf page (Madani 1405), so the starter Revo offers in the mushaf
 * (REVO-45) answers at once and costs nothing at the tap. Each answer is built exactly as revoAsk builds it, through the
 * Message Batches API (half price) on Sonnet 5.5; the cited reply is mapped back to the books' words at collect time
 * (the selection is deterministic, so the documents are built again the same way).
 *
 *   node scripts/tafsir/answers-batch.js submit  --pages <out>/v1 --state <file> [--max-usd 8]
 *   node scripts/tafsir/answers-batch.js collect --pages <out>/v1 --state <file> --out <dir>   # <dir>/p<page>.json
 *   gcloud storage cp -r <dir> gs://revisely-dev.firebasestorage.app/tafsir/answers/v1   (dev only)
 *
 * Build the functions first (it uses lib/revo/tafsir). Majd's yes for the spend: Nov 26 2026; estimated ~$7.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const lib = (m) => require(path.join(__dirname, '..', '..', 'lib', 'revo', 'tafsir', m));
const { asTafsirPage } = lib('pages');
const { selectPieces } = lib('select');
const { buildTafsirRequest } = lib('request');
const { parseTafsirReply } = lib('reply');
const { PAGE_STARTS } = lib('ayat');

const API = 'https://api.anthropic.com/v1/messages/batches';
/** The mushaf's first starter (src/i18n/en/revo.ts revo.tafsir.startPage1), word for word. */
const QUESTION = 'What’s happening here?';
const IN_USD = 1 / 1e6; // Sonnet 5.5 at batch prices: half of $2 in, $10 out
const OUT_USD = 5 / 1e6;
const arg = (n, f) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : f);
const headers = () => ({ 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });

function built(dir, page) {
  const file = asTafsirPage(JSON.parse(fs.readFileSync(path.join(dir, `p${page}.json`), 'utf8')), page);
  const scope = { start: file.start, end: file.end };
  const books = selectPieces([file], scope, QUESTION, true);
  const last = page < 604 ? PAGE_STARTS[page] - 1 : 114006;
  const place = `surah ${Math.floor(file.start / 1000)}, ayah ${file.start % 1000} to surah ${Math.floor(last / 1000)}, ayah ${last % 1000}`;
  return buildTafsirRequest({ question: QUESTION, place, books });
}

async function submit() {
  const dir = arg('--pages');
  const requests = [];
  let chars = 0;
  for (let page = 1; page <= 604; page++) {
    const { request } = built(dir, page);
    // Batch requests are cached as any other: no cache marks needed for one question a page.
    chars += JSON.stringify(request.messages).length;
    requests.push({ custom_id: `p${page}`, params: request });
  }
  const est = (chars / 1.6) * IN_USD + 604 * 350 * OUT_USD;
  console.log(`604 requests, ~$${est.toFixed(2)} estimated`);
  if (est > Number(arg('--max-usd', '8'))) throw new Error('over --max-usd: not submitted');
  const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ requests }) });
  const body = await res.json();
  if (!res.ok) throw new Error(`batch refused: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  fs.writeFileSync(arg('--state'), JSON.stringify({ batch: body.id, submittedAt: new Date().toISOString(), estimateUsd: est }, null, 2));
  console.log('submitted', body.id);
}

async function collect() {
  const dir = arg('--pages');
  const out = arg('--out');
  const state = JSON.parse(fs.readFileSync(arg('--state'), 'utf8'));
  const info = await (await fetch(`${API}/${state.batch}`, { headers: headers() })).json();
  console.log('batch', info.processing_status, JSON.stringify(info.request_counts));
  if (info.processing_status !== 'ended') return;
  fs.mkdirSync(out, { recursive: true });
  const text = await (await fetch(info.results_url, { headers: headers() })).text();
  let usd = 0;
  let kept = 0;
  for (const row of text.split('\n').filter(Boolean)) {
    const r = JSON.parse(row);
    if (r.result?.type !== 'succeeded') continue;
    const m = r.result.message;
    usd += ((m.usage.input_tokens ?? 0) + (m.usage.cache_read_input_tokens ?? 0) * 0.05 + (m.usage.cache_creation_input_tokens ?? 0) * 1.25) * IN_USD + (m.usage.output_tokens ?? 0) * OUT_USD;
    const page = Number(r.custom_id.slice(1));
    const answer = parseTafsirReply(m.content, built(dir, page).documents);
    if (!answer || answer.sources.length === 0) continue; // only answers that rest on the books
    fs.writeFileSync(path.join(out, `p${page}.json`), JSON.stringify({ v: 1, page, question: QUESTION, ...answer }));
    kept++;
  }
  fs.writeFileSync(arg('--state'), JSON.stringify({ ...state, collectedAt: new Date().toISOString(), usd, kept }, null, 2));
  console.log(`${kept} answers kept; $${usd.toFixed(2)}`);
}

(process.argv[2] === 'collect' ? collect() : submit()).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
