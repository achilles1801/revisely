#!/usr/bin/env node
// Writes src/data/mushafSizes.json: the size in bytes of every page image in
// each set (lib/quranImages: the originals, Android's w1080 and w1440, and the
// 1441 print's w1080 and w1440),
// read from Storage with HEAD requests. The app uses it to show how much the
// offline mushaf is and how much is left. Run it again whenever the images in
// Storage change (scripts/build-mushaf-variants.py).
//
//   node scripts/mushaf-sizes.js

const fs = require('fs');
const path = require('path');

const BASE = 'https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf';
// The 1405 pages (the originals and Android's copies), then the 1441 print's two widths.
const SETS = {
  full: '',
  w1080: 'w1080/',
  w1440: 'w1440/',
  '1441/w1080': '1441/w1080/',
  '1441/w1440': '1441/w1440/',
};
const PAGES = 604;
const PARALLEL = 16;

async function size(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (!res.ok) throw new Error(`${res.status} for ${url}`);
      const n = Number(res.headers.get('content-length'));
      if (!Number.isFinite(n) || n <= 0) throw new Error(`No length for ${url}`);
      return n;
    } catch (err) {
      if (attempt >= 3) throw err;
    }
  }
}

async function sizesOf(prefix) {
  const out = new Array(PAGES);
  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < PAGES) {
        const i = next++;
        out[i] = await size(`${BASE}/${prefix}${String(i + 1).padStart(3, '0')}.png`);
      }
    }),
  );
  return out;
}

(async () => {
  const result = {};
  for (const [set, prefix] of Object.entries(SETS)) {
    result[set] = await sizesOf(prefix);
    const total = result[set].reduce((a, b) => a + b, 0);
    console.log(`${set}: ${(total / 1e6).toFixed(1)} MB`);
  }
  const file = path.join(__dirname, '..', 'src', 'data', 'mushafSizes.json');
  fs.writeFileSync(file, JSON.stringify(result) + '\n');
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
