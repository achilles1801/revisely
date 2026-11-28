#!/usr/bin/env node
/**
 * "What's happening here?" answered ahead for every mushaf page (Madani 1405), so the starter Revo offers in the mushaf
 * (REVO-45) answers at once and costs nothing at the tap. Each answer is built exactly as revoAsk builds it, through the
 * Message Batches API (half price); the cited reply is mapped back to the books' words at collect time (the selection
 * is deterministic, so the documents are built again the same way). All four books' (v1, Nov 26 2026, on Sonnet 5.5,
 * Majd's yes, $6.98), or one book's alone with `--book` (REVO-47: served to accounts that chose that book; on the
 * request's own model, Haiku 5.5).
 *
 *   node scripts/tafsir/answers-batch.js estimate --pages <pages dir> [--book ibnKathir]      # no call, no cost
 *   node scripts/tafsir/answers-batch.js submit   --pages <pages dir> --state <file> [--book ibnKathir] [--max-usd 8]
 *   node scripts/tafsir/answers-batch.js collect  --pages <pages dir> --state <file> --out <dir> [--book ibnKathir]
 *   then copy <dir> to the dev bucket's tafsir/answers/v1/ (all four) or tafsir/answers/v1/<book>/ (one book).
 *
 * Build the functions first (it uses lib/revo/tafsir). A batch costs money: ask Majd first, with its estimate.
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
const { isTafsirBook } = lib('books');
const { PRICES } = require(path.join(__dirname, '..', '..', 'lib', 'coach', 'pricing'));

const API = 'https://api.anthropic.com/v1/messages/batches';
/** The mushaf's first starter (src/i18n/en/revo.ts revo.tafsir.startPage1), word for word. */
const QUESTION = 'What’s happening here?';
const arg = (n, f) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : f);
/** One book alone (REVO-47), or all four. */
const BOOK = arg('--book', null);
if (BOOK != null && !isTafsirBook(BOOK)) throw new Error(`--book must be one of the four: ${BOOK}`);
const headers = () => ({ 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });

function built(dir, page) {
  const file = asTafsirPage(JSON.parse(fs.readFileSync(path.join(dir, `p${page}.json`), 'utf8')), page);
  const scope = { start: file.start, end: file.end };
  const books = selectPieces([file], scope, QUESTION, true, ...(BOOK ? [[BOOK]] : []));
  const last = page < 604 ? PAGE_STARTS[page] - 1 : 114006;
  const place = `surah ${Math.floor(file.start / 1000)}, ayah ${file.start % 1000} to surah ${Math.floor(last / 1000)}, ayah ${last % 1000}`;
  return buildTafsirRequest({ question: QUESTION, place, books });
}

/** Batch prices for the request's model: half the usual. */
const priceOf = (model) => ({ in: PRICES[model].inputPerMTok / 2e6, out: PRICES[model].outputPerMTok / 2e6 });

function requestsAndEstimate() {
  const dir = arg('--pages');
  const requests = [];
  let chars = 0;
  for (let page = 1; page <= 604; page++) {
    const { request } = built(dir, page);
    // Batch requests are cached as any other: no cache marks needed for one question a page.
    chars += JSON.stringify(request.messages).length + request.system[0].text.length;
    requests.push({ custom_id: `p${page}`, params: request });
  }
  const price = priceOf(requests[0].params.model);
  // ~1.6 characters a token over the mix of Arabic and English (count_tokens, Nov 26 2026); ~500 tokens out.
  const est = (chars / 1.6) * price.in + 604 * 500 * price.out;
  const each = Math.round(chars / 1.6 / 604);
  console.log(`604 requests on ${requests[0].params.model}${BOOK ? `, ${BOOK} alone` : ''}: ~${each} tokens in each, ~$${est.toFixed(2)} estimated`);
  return { requests, est };
}

async function submit() {
  const { requests, est } = requestsAndEstimate();
  if (est > Number(arg('--max-usd', '8'))) throw new Error('over --max-usd: not submitted');
  const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ requests }) });
  const body = await res.json();
  if (!res.ok) throw new Error(`batch refused: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  fs.writeFileSync(arg('--state'), JSON.stringify({ batch: body.id, book: BOOK, submittedAt: new Date().toISOString(), estimateUsd: est }, null, 2));
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
  let price = null;
  for (const row of text.split('\n').filter(Boolean)) {
    const r = JSON.parse(row);
    if (r.result?.type !== 'succeeded') continue;
    const m = r.result.message;
    price ??= priceOf(m.model);
    usd += ((m.usage.input_tokens ?? 0) + (m.usage.cache_read_input_tokens ?? 0) * 0.1 + (m.usage.cache_creation_input_tokens ?? 0) * 1.25) * price.in + (m.usage.output_tokens ?? 0) * price.out;
    const page = Number(r.custom_id.slice(1));
    const answer = parseTafsirReply(m.content, built(dir, page).documents);
    if (!answer || answer.sources.length === 0) continue; // only answers that rest on the books
    fs.writeFileSync(path.join(out, `p${page}.json`), JSON.stringify({ v: 1, page, question: QUESTION, ...answer }));
    kept++;
  }
  fs.writeFileSync(arg('--state'), JSON.stringify({ ...state, collectedAt: new Date().toISOString(), usd, kept }, null, 2));
  console.log(`${kept} answers kept; $${usd.toFixed(2)}`);
}

const command = process.argv[2];
(command === 'collect' ? collect() : command === 'estimate' ? Promise.resolve(requestsAndEstimate()) : submit()).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
