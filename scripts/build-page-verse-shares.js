#!/usr/bin/env node
// Builds src/data/pageVerseShares.json: how much of each page each of its verses
// fills, per print, in thousandths. A page's list holds one number per verse, in
// order, from the page's first verse (src/data/pageVerses.json) to its last, and
// sums to 1000.
//
// lib/memorizedVerses reads it to count a partly memorized page by its share of
// the page (Al-Mulk 13–20 is about 0.6 of its page), so % memorized and the juz
// dots stay a measure of length: the mushaf's 604 pages are equal, its ayahs are
// not (Juz 30 is 9% of the ayahs but under 4% of the pages). The share is the
// area of the verse's rectangles in the bounds files (src/data/ayahBounds*.json,
// one rectangle per verse per line), which this is built from:
//
//   node scripts/build-page-verse-shares.js
//
// Run it again whenever a bounds file changes; memorizedVerses.test checks they agree.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sources = {
  madani1405: 'src/data/ayahBounds.json',
  madani1441: 'src/data/ayahBounds1441.json',
};

/** Thousandths that sum to exactly 1000 (largest remainders take the rounding). */
function thousandths(areas) {
  const total = areas.reduce((n, a) => n + a, 0);
  const exact = areas.map((a) => (total > 0 ? (a / total) * 1000 : 1000 / areas.length));
  const out = exact.map(Math.floor);
  let left = 1000 - out.reduce((n, a) => n + a, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]] += 1;
  // Every ayah counts for something: one rounded to nothing takes a thousandth from the largest.
  for (let i = 0; i < out.length; i++) {
    if (out[i] > 0) continue;
    const big = out.indexOf(Math.max(...out));
    out[big] -= 1;
    out[i] = 1;
  }
  return out;
}

const out = {};
for (const [edition, file] of Object.entries(sources)) {
  const bounds = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const pages = [];
  for (let page = 1; page <= 604; page++) {
    const d = bounds[String(page)];
    if (!d || d.length < 6) throw new Error(`${file}: page ${page} has no verses`);
    const keys = [];
    const area = new Map();
    for (let i = 0; i < d.length; i += 6) {
      const key = d[i] * 1000 + d[i + 1];
      if (!area.has(key)) keys.push(key);
      area.set(key, (area.get(key) ?? 0) + Math.max(0, d[i + 4] - d[i + 2]) * Math.max(0, d[i + 5] - d[i + 3]));
    }
    // The verses must run in order, one after another, as pageVerses.json assumes.
    for (let k = 1; k < keys.length; k++) {
      if (keys[k] <= keys[k - 1]) throw new Error(`${file}: page ${page} lists verse ${keys[k]} after ${keys[k - 1]}`);
    }
    pages.push(thousandths(keys.map((k) => area.get(k))));
  }
  out[edition] = pages;
}
fs.writeFileSync(path.join(root, 'src/data/pageVerseShares.json'), JSON.stringify(out) + '\n');
console.log('wrote src/data/pageVerseShares.json');
