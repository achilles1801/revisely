#!/usr/bin/env node
/**
 * Records one real streamed answer from the tafsir (`stream: true`): the request revoAsk builds for the gift question on
 * An-Naml 23–35 (as record-replies.js), its server-sent events kept exactly as the API sent them in
 * test-recordings/anthropic/revo-tafsir.stream.txt. coach/stream.test.ts reads them, so the stream reader is tested on
 * what the API really sends. One call on Haiku 5.5, about $0.002.
 *
 *   ANTHROPIC_API_KEY=… node scripts/tafsir/record-stream.js      # build the functions first
 */
'use strict';
const fs = require('fs');
const path = require('path');
const lib = (m) => require(path.join(__dirname, '..', '..', 'lib', m));
const { asTafsirPage } = lib('revo/tafsir/pages');
const { selectPieces } = lib('revo/tafsir/select');
const { buildTafsirRequest } = lib('revo/tafsir/request');

const ROOT = path.join(__dirname, '..', '..', 'test-recordings');

(async () => {
  const page = asTafsirPage(JSON.parse(fs.readFileSync(path.join(ROOT, 'tafsir', 'p379.json'), 'utf8')), 379);
  const q = 'Why did she send a gift instead of answering?';
  const { request } = buildTafsirRequest({ question: q, place: 'surah 27, ayat 23 to 35', books: selectPieces([page], { start: page.start, end: page.end }, q, true) });
  const started = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, stream: true }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let first = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const piece = decoder.decode(value, { stream: true });
    if (first == null && piece.includes('text_delta')) first = Date.now() - started;
    text += piece;
  }
  fs.writeFileSync(path.join(ROOT, 'anthropic', 'revo-tafsir.stream.txt'), text);
  const types = {};
  for (const m of text.matchAll(/"type":"(content_block_delta|message_start|message_delta|content_block_start|ping|error)"[^}]*?(?:"type":"(\w+_delta)")?/g)) {
    const k = m[2] ? `${m[1]}:${m[2]}` : m[1];
    types[k] = (types[k] ?? 0) + 1;
  }
  console.log(`${text.length} characters; first text after ${first} ms, all after ${Date.now() - started} ms`);
  console.log(JSON.stringify(types));
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
