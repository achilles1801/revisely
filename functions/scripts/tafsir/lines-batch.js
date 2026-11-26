#!/usr/bin/env node
/**
 * An English line for every piece of al-Tabari, Ibn Kathir and al-Qurtubi (Anthropic's Contextual Retrieval), so an
 * English question can find the Arabic pieces that answer it (revo/tafsir/select.ts ranks them). One Haiku 5.5 request
 * per passage, through the Message Batches API (half price). al-Sa'di is given whole and needs none; Ibn Kathir's
 * English is ranked on its own words.
 *
 *   node scripts/tafsir/lines-batch.js submit  --pages <out>/v1 --state <file> [--max-usd 3.5]
 *   node scripts/tafsir/lines-batch.js collect --pages <out>/v1 --state <file>     # writes `lines` into the page files
 *
 * The key is ANTHROPIC_API_KEY (the coach key). Majd's yes for the spend: Nov 26 2026 ("yes spend the $13 for revo
 * tafsir"); estimated ~$2.20 (measured sizes), and `submit` refuses above --max-usd.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const API = 'https://api.anthropic.com/v1/messages/batches';
const MODEL = 'claude-haiku-5-5';
const BOOKS = new Set(['tabari', 'ibnKathir', 'qurtubi']);
const MARK = /[ؐ-ًؚ-ٰٟـۖ-ۜ۟-۪ۨ-ۭ]/g;
// Batch prices: half of Haiku 5.5's $0.10 in and $0.50 out a million tokens.
const IN_USD = 0.05 / 1e6;
const OUT_USD = 0.25 / 1e6;

const SYSTEM = [
  'You index a passage of classical tafsir (Arabic) for search in English. The passage is split into numbered pieces.',
  'For each piece, in order, write one English line of at most 15 words saying what that piece is about: the ayah or words it explains, the people, events, rulings, reports or grammar it discusses.',
  'Plain, specific words someone would search with ("why the queen sent a gift; testing whether Sulayman was a king or a prophet"). Do not translate the piece; describe it.',
  'Reply with the JSON object only: one line per piece, as many lines as pieces.',
].join('\n');
const SCHEMA = { type: 'object', properties: { lines: { type: 'array', items: { type: 'string' } } }, required: ['lines'], additionalProperties: false };
// The second pass (passages whose first reply had a different number of lines): each line names its piece.
const NUMBERED = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: { type: 'object', properties: { piece: { type: 'integer' }, line: { type: 'string' } }, required: ['piece', 'line'], additionalProperties: false },
    },
  },
  required: ['lines'],
  additionalProperties: false,
};
const NUMBERED_SYSTEM = SYSTEM.replace('one line per piece, as many lines as pieces.', 'one line per piece, each with its piece number, for every piece from 1 to the last.');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const key = () => {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY is not set');
  return k;
};
const headers = () => ({ 'x-api-key': key(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
const idOf = (p) => `${p.book}-${p.from[0] * 1000 + p.from[1]}`;

/** Every passage of the three books, once, with the pages it is in. */
function passages(dir) {
  const out = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    for (const p of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).passages) {
      if (!BOOKS.has(p.book)) continue;
      const id = idOf(p);
      if (!out.has(id)) out.set(id, p);
    }
  }
  return out;
}

function request(id, p, numbered = false) {
  const pieces = p.pieces.map(([a, b], i) => `[${i + 1}] ${p.text.slice(a, b).replace(MARK, '')}`).join('\n');
  return {
    custom_id: id,
    params: {
      model: MODEL,
      max_tokens: Math.min(16000, 200 + 30 * p.pieces.length),
      thinking: { type: 'disabled' },
      system: numbered ? NUMBERED_SYSTEM : SYSTEM,
      messages: [{ role: 'user', content: `Tafsir passage on surah ${p.from[0]}, ayat ${p.from[1]} to ${p.to[1]}: ${p.pieces.length} pieces.\n\n${pieces}` }],
      output_config: { format: { type: 'json_schema', schema: numbered ? NUMBERED : SCHEMA } },
    },
  };
}

async function submit() {
  const dir = arg('--pages');
  const state = arg('--state');
  const max = Number(arg('--max-usd', '3.5'));
  const all = passages(dir);
  // --ids <file>: only these passages (a JSON list of ids), with numbered lines.
  const only = arg('--ids') ? new Set(JSON.parse(fs.readFileSync(arg('--ids'), 'utf8'))) : null;
  if (only) for (const id of [...all.keys()]) if (!only.has(id)) all.delete(id);
  const reqs = [...all].map(([id, p]) => request(id, p, only !== null));
  const chars = reqs.reduce((n, r) => n + r.params.messages[0].content.length + SYSTEM.length, 0);
  const pieces = [...all.values()].reduce((n, p) => n + p.pieces.length, 0);
  const est = (chars / 1.3) * IN_USD + pieces * 22 * OUT_USD;
  console.log(`${reqs.length} requests, ${pieces} pieces, ~$${est.toFixed(2)} estimated`);
  if (est > max) throw new Error(`estimated $${est.toFixed(2)} is over --max-usd ${max}: not submitted`);
  const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ requests: reqs }) });
  const body = await res.json();
  if (!res.ok) throw new Error(`batch refused: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  fs.writeFileSync(state, JSON.stringify({ batch: body.id, submittedAt: new Date().toISOString(), estimateUsd: est }, null, 2));
  console.log('submitted', body.id, body.processing_status);
}

async function collect() {
  const dir = arg('--pages');
  const state = JSON.parse(fs.readFileSync(arg('--state'), 'utf8'));
  const info = await (await fetch(`${API}/${state.batch}`, { headers: headers() })).json();
  console.log('batch', info.processing_status, JSON.stringify(info.request_counts));
  if (info.processing_status !== 'ended') return;
  const text = await (await fetch(info.results_url, { headers: headers() })).text();
  const lines = new Map();
  let input = 0;
  let output = 0;
  let bad = 0;
  for (const row of text.split('\n').filter(Boolean)) {
    const r = JSON.parse(row);
    if (r.result?.type !== 'succeeded') {
      bad++;
      continue;
    }
    const m = r.result.message;
    input += (m.usage?.input_tokens ?? 0) + (m.usage?.cache_read_input_tokens ?? 0) + (m.usage?.cache_creation_input_tokens ?? 0);
    output += m.usage?.output_tokens ?? 0;
    const raw = (m.content.find((b) => b.type === 'text') || {}).text || '';
    try {
      const got = JSON.parse(raw).lines;
      if (Array.isArray(got)) lines.set(r.custom_id, got);
    } catch {
      // A numbered reply cut off at max_tokens: its complete lines still name their pieces, so they are kept.
      const salvaged = [...raw.matchAll(/\{"piece":\s*(\d+),\s*"line":\s*"((?:[^"\\]|\\.)*)"\}/g)].map((x) => ({ piece: Number(x[1]), line: JSON.parse(`"${x[2]}"`) }));
      if (salvaged.length > 0) lines.set(r.custom_id, salvaged);
      else bad++;
    }
  }
  let written = 0;
  const mismatched = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const file = path.join(dir, f);
    const page = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = false;
    for (const p of page.passages) {
      const got = lines.get(idOf(p));
      if (!got) continue;
      let byPiece = null;
      if (got.length > 0 && typeof got[0] === 'object') {
        // Numbered: each line goes to the piece it names.
        byPiece = p.pieces.map(() => '');
        for (const g of got) if (Number.isInteger(g && g.piece) && g.piece >= 1 && g.piece <= p.pieces.length) byPiece[g.piece - 1] = String(g.line || '').slice(0, 200);
      } else if (got.length === p.pieces.length) {
        byPiece = got.map((l) => String(l).slice(0, 200));
      }
      if (byPiece) {
        p.lines = byPiece;
      } else {
        // A different number of lines can't be matched to the pieces: none until the numbered pass.
        mismatched.add(idOf(p));
        p.lines = undefined;
      }
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(file, JSON.stringify(page));
      written++;
    }
  }
  const usd = input * IN_USD + output * OUT_USD;
  fs.writeFileSync(arg('--state'), JSON.stringify({ ...state, collectedAt: new Date().toISOString(), input, output, usd, failed: bad, mismatched: [...mismatched] }, null, 2));
  console.log(`lines for ${lines.size} passages (${bad} failed, ${mismatched.size} with a different count); ${written} page files; ${input} in, ${output} out: $${usd.toFixed(2)}`);
}

(process.argv[2] === 'collect' ? collect() : submit()).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
