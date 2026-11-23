#!/usr/bin/env node
// Builds src/data/pageFirstWords.json: the first words of every page as printed, for naming a place by how its page
// begins (lib/passages firstWordsOfPage; NAME-2). quranWords.dat holds the text but is a 3.6 MB asset loaded on demand,
// and passages is synchronous, so the words a page opens with live in this small table:
//
//   { "madani1405": [604 strings], "madani1441": { "<page>": string } }
//
// The 1441 print lists only the pages that open on a different ayah. Run it again whenever pageVerses.json or
// quranWords.dat changes; passages.test checks they agree.
//
//   node scripts/build-page-first-words.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
/** Up to this many words: fewer when the ayah is shorter, never part of a word. */
const FIRST_WORDS = 4;
// prettier-ignore
const AYAHS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227,
  93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78,
  96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25,
  22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

const verses = JSON.parse(fs.readFileSync(path.join(root, 'src/data/pageVerses.json'), 'utf8'));
const { uthmani } = JSON.parse(fs.readFileSync(path.join(root, 'src/data/quranWords.dat'), 'utf8'));
if (AYAHS.length !== 114 || AYAHS.reduce((a, b) => a + b, 0) !== uthmani.length) throw new Error('ayah counts disagree');

const surahStart = [];
AYAHS.reduce((at, n, i) => ((surahStart[i + 1] = at), at + n), 0);
// Words are separated by plain spaces; a no-break space sits inside one word (يا أيها).
const wordsOf = (key) =>
  uthmani[surahStart[Math.floor(key / 1000)] + (key % 1000) - 1].split(' ').slice(0, FIRST_WORDS).join(' ');

const base = verses.madani1405.map(wordsOf);
const other = {};
verses.madani1441.forEach((key, i) => {
  if (key !== verses.madani1405[i]) other[i + 1] = wordsOf(key);
});
fs.writeFileSync(
  path.join(root, 'src/data/pageFirstWords.json'),
  JSON.stringify({ madani1405: base, madani1441: other }) + '\n',
);
console.log(`wrote src/data/pageFirstWords.json (${base.length} pages, ${Object.keys(other).length} differ in 1441)`);
