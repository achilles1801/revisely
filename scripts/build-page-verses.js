#!/usr/bin/env node
// Builds src/data/pageVerses.json: the first verse of every page, per print, as
// sura * 1000 + ayah. Every page of both prints ends at the end of a verse, so a
// page holds its first verse up to the verse before the next page's first.
// lib/passages reads it to name pages by surah and ayah without loading the
// ~300 KB bounds files (src/data/ayahBounds*.json), which it is built from:
//
//   node scripts/build-page-verses.js
//
// Run it again whenever a bounds file changes; passages.test checks they agree.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sources = {
  madani1405: 'src/data/ayahBounds.json',
  madani1441: 'src/data/ayahBounds1441.json',
};

const out = {};
for (const [edition, file] of Object.entries(sources)) {
  const bounds = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const starts = [];
  for (let page = 1; page <= 604; page++) {
    const d = bounds[String(page)];
    if (!d || d.length < 6) throw new Error(`${file}: page ${page} has no verses`);
    starts.push(d[0] * 1000 + d[1]);
  }
  out[edition] = starts;
}
fs.writeFileSync(path.join(root, 'src/data/pageVerses.json'), JSON.stringify(out) + '\n');
console.log('wrote src/data/pageVerses.json');
