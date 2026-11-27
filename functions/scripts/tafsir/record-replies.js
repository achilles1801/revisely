#!/usr/bin/env node
/**
 * Records the two model replies the emulator answers Revo's tafsir requests with (functions/src/emulator.ts):
 * `revo-tafsir` (the gift question on An-Naml 23–35, built from test-recordings/tafsir/p379.json exactly as revoAsk
 * builds it for the books everyone starts with, Ibn Kathir alone: REVO-47) and `revo-locate` (a question that isn't
 * about the Qur'an). Two real calls on Haiku 5.5, about $0.001.
 *
 *   ANTHROPIC_API_KEY=… node scripts/tafsir/record-replies.js      # build the functions first
 */
'use strict';
const fs = require('fs');
const path = require('path');
const lib = (m) => require(path.join(__dirname, '..', '..', 'lib', m));
const { asTafsirPage } = lib('revo/tafsir/pages');
const { selectPieces } = lib('revo/tafsir/select');
const { buildTafsirRequest } = lib('revo/tafsir/request');
const { parseTafsirReply } = lib('revo/tafsir/reply');
const { buildLocateRequest } = lib('revo/tafsir/locate');
const { DEFAULT_TAFSIR_BOOKS } = lib('revo/tafsir/books');
const { shortRequest } = lib('emulator');

const ROOT = path.join(__dirname, '..', '..', 'test-recordings');

async function record(name, request, how) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  fs.writeFileSync(path.join(ROOT, 'anthropic', `${name}.json`), JSON.stringify({ recordedAt: new Date().toISOString(), how, request: shortRequest(request), status: res.status, body }, null, 2) + '\n');
  console.log(name, JSON.stringify(body.usage));
  return body;
}

(async () => {
  const page = asTafsirPage(JSON.parse(fs.readFileSync(path.join(ROOT, 'tafsir', 'p379.json'), 'utf8')), 379);
  const q = 'Why did she send a gift instead of answering?';
  const { request, documents } = buildTafsirRequest({ question: q, place: 'surah 27, ayat 23 to 35', books: selectPieces([page], { start: page.start, end: page.end }, q, true, DEFAULT_TAFSIR_BOOKS) });
  const how = 'scripts/tafsir/record-replies.js: the real API, the request revoAsk builds for the gift question on page 379 (test-recordings/tafsir/p379.json), from Ibn Kathir alone (the books everyone starts with).';
  const body = await record('revo-tafsir', request, how);
  const answer = parseTafsirReply(body.content, documents);
  if (!answer || answer.sources.length === 0) throw new Error('the recorded answer has no source: look at it before using it');
  // Ibn Kathir's answer written ahead for page 379 in the scenarios (REVO-47), from this real reply. All four's
  // (answers/p379.json) was written from the reply recorded with all four, Nov 26 2026, and stays as it is.
  fs.mkdirSync(path.join(ROOT, 'tafsir', 'answers', 'ibnKathir'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'tafsir', 'answers', 'ibnKathir', 'p379.json'), JSON.stringify({ v: 1, page: 379, question: 'What’s happening here?', ...answer }) + '\n');
  console.log('answer:', answer.text, '\nsources:', answer.sources.map((s) => `${s.book}: ${s.quote.slice(0, 60)}`).join(' | '));
  await record('revo-locate', buildLocateRequest('How was my week?'), 'scripts/tafsir/record-replies.js: the real API, a question that is not about the Qur’an.');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
