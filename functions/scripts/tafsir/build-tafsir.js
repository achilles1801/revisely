#!/usr/bin/env node
/**
 * Builds Revo's copy of the four tafsirs, one file per mushaf page (handbook/revo.md, "Answers from the tafsir").
 *
 *   node scripts/tafsir/build-tafsir.js --raw <dir> --out <dir>      # download (once, cached in --raw), then build
 *   gcloud storage cp -r <out>/v1 gs://revisely-dev.firebasestorage.app/tafsir/   # upload (dev only)
 *
 * The texts are QUL's (Tarteel's Quranic Universal Library), as spa5k/tafsir_api publishes them per surah (one entry
 * per ayah; an entry that covers several ayat repeats its text on each). Each page file holds the passages that touch
 * that page (Madani 1405 pages), from al-Tabari, Ibn Kathir, al-Qurtubi, al-Sa'di and Ibn Kathir's abridged English,
 * each passage with the ayat it covers, its text as the book has it (harakat kept; the editors' notes `[[...]]`
 * removed), and its pieces: about a sentence each, as [start, end) offsets into the text. Revo cites pieces.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// jsDelivr first; GitHub's raw files when jsDelivr refuses (it answered 403 for some files, Nov 26 2026).
const SOURCES = ['https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir', 'https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir'];
const EDITIONS = [
  { book: 'tabari', slug: 'ar-tafsir-al-tabari' },
  { book: 'ibnKathir', slug: 'ar-tafsir-ibn-kathir' },
  { book: 'qurtubi', slug: 'ar-tafseer-al-qurtubi' },
  { book: 'saadi', slug: 'ar-tafseer-al-saddi' },
  { book: 'ibnKathirEn', slug: 'en-tafisr-ibn-kathir' },
];
const PIECE_MIN = 250; // characters: about a sentence of tafsir
const PIECE_MAX = 700;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** The page each ayah starts on: src/data/pageVerses.json's madani1405, surah * 1000 + ayah per page. */
function pageStarts() {
  const file = path.join(__dirname, '..', '..', '..', 'src', 'data', 'pageVerses.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')).madani1405;
}

async function download(raw, slug, surah) {
  const file = path.join(raw, slug, `${surah}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${SOURCES[(attempt - 1) % SOURCES.length]}/${slug}/${surah}.json`);
    if (res.ok) {
      const text = await res.text();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      return JSON.parse(text);
    }
    if (attempt >= 6) throw new Error(`${slug}/${surah}: ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

/** The editors' notes out, whitespace tidied; nothing else changes (harakat stay). */
function clean(text) {
  return text
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Pieces of about a sentence: [start, end) into the text, cut after . ؟ ! : or a line end. */
function pieces(text) {
  const out = [];
  let start = 0;
  const re = /[.؟!:](?=\s)|\n/g;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + 1;
    if (end - start >= PIECE_MIN) {
      out.push([start, end]);
      start = end;
    }
  }
  if (start < text.length) out.push([start, text.length]);
  // A piece too long for a quote is cut at the nearest space before PIECE_MAX.
  const split = [];
  for (let [a, b] of out) {
    while (b - a > PIECE_MAX) {
      let cut = text.lastIndexOf(' ', a + PIECE_MAX);
      if (cut <= a + PIECE_MIN) cut = a + PIECE_MAX;
      split.push([a, cut]);
      a = cut;
    }
    split.push([a, b]);
  }
  // Leading whitespace is never part of a piece.
  return split
    .map(([a, b]) => {
      while (a < b && /\s/.test(text[a])) a++;
      return [a, b];
    })
    .filter(([a, b]) => b > a);
}

/** One surah's entries as passages: consecutive ayat with the same text are one passage. */
function passagesOf(entries, book) {
  const out = [];
  for (const e of entries) {
    const text = clean(e.text || '');
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.raw === e.text && last.to[0] === e.surah && last.to[1] === e.ayah - 1) {
      last.to = [e.surah, e.ayah];
    } else {
      out.push({ book, from: [e.surah, e.ayah], to: [e.surah, e.ayah], raw: e.text, text });
    }
  }
  return out;
}

async function main() {
  const raw = arg('--raw');
  const outDir = arg('--out');
  if (!raw || !outDir) throw new Error('usage: build-tafsir.js --raw <dir> --out <dir>');
  const starts = pageStarts();
  const key = (s, a) => s * 1000 + a;
  const pageOf = (k) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= k) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const byPage = Array.from({ length: 605 }, () => []);
  const sizes = {};
  for (const { book, slug } of EDITIONS) {
    sizes[book] = 0;
    for (let surah = 1; surah <= 114; surah++) {
      const entries = await download(raw, slug, surah);
      for (const p of passagesOf(entries, book)) {
        const first = pageOf(key(...p.from));
        const last = pageOf(key(...p.to));
        const entry = { book, from: p.from, to: p.to, text: p.text, pieces: pieces(p.text) };
        sizes[book] += p.text.length;
        for (let page = first; page <= last; page++) byPage[page].push(entry);
      }
      process.stdout.write(`\r${slug} ${surah}/114   `);
    }
  }
  process.stdout.write('\n');
  const dir = path.join(outDir, 'v1');
  fs.mkdirSync(dir, { recursive: true });
  let bytes = 0;
  for (let page = 1; page <= 604; page++) {
    const next = page < 604 ? starts[page] : 115000;
    const body = JSON.stringify({ v: 1, page, start: starts[page - 1], end: next, passages: byPage[page] });
    fs.writeFileSync(path.join(dir, `p${page}.json`), body);
    bytes += Buffer.byteLength(body);
  }
  console.log(`604 pages, ${(bytes / 1e6).toFixed(1)} MB; characters per book:`, sizes);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
