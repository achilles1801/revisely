// Builds src/data/pageLines.json: the lines of every mushaf page for the hidden
// recite mode (src/lib/recite/pageLines.ts). Per page a flat list, per line:
// line, y0, y1, coverTop, coverBottom, x0, x1, marker count, then each verse
// marker's x0, x1 (1024-wide bounds space, as ayahBounds.json).
//
// The covers come from the word boxes of the mistake-detection work
// (feature/mistake-detection: src/data/quranWords.dat and its pageLines()),
// which aren't on develop yet. Run it from that branch's checkout, which has
// sucrase-node, with this checkout at ~/revisely:
//
//   cd ~/revisely-mistakes && ./node_modules/.bin/sucrase-node ~/revisely/scripts/build-page-lines.ts
//
// The branch fits pages 1 and 2 a few units differently (−58/−58 vs develop's
// −61/−57); each page is moved onto develop's verse boxes, and the run fails
// if a page differs by more than a plain vertical shift (page 3 matches to a
// tenth).
import * as fs from 'fs';
const BR = process.env.HOME + '/revisely-mistakes';
const DEV = process.env.HOME + '/revisely';
const { QuranWords } = require(BR + '/src/lib/recite/quranWords');
const { pageLines } = require(BR + '/src/lib/recite/pageLines');
const words = new QuranWords(JSON.parse(fs.readFileSync(BR + '/src/data/quranWords.dat', 'utf8')));
const brBounds: Record<string, number[]> = JSON.parse(fs.readFileSync(BR + '/src/data/ayahBounds.json', 'utf8'));
const devBounds: Record<string, number[]> = JSON.parse(fs.readFileSync(DEV + '/src/data/ayahBounds.json', 'utf8'));

const out: Record<string, number[]> = {};
const shifted: string[] = [];
for (let page = 1; page <= 604; page++) {
  const br = brBounds[String(page)];
  const dev = devBounds[String(page)];
  if (br.length !== dev.length) throw new Error(`page ${page}: verse boxes differ in count`);
  const dys = new Set<number>();
  const dxs = new Set<number>();
  for (let i = 0; i < br.length; i += 6) {
    if (br[i] !== dev[i] || br[i + 1] !== dev[i + 1]) throw new Error(`page ${page}: verse order differs`);
    dxs.add(dev[i + 2] - br[i + 2]);
    dxs.add(dev[i + 4] - br[i + 4]);
    dys.add(dev[i + 3] - br[i + 3]);
    dys.add(dev[i + 5] - br[i + 5]);
  }
  // The same fit up to rounding (page 3 is fitted in both, to a tenth).
  const near = (vals: Set<number>, to: number) => [...vals].every((v) => Math.abs(v - to) <= 1);
  const ys = [...dys].sort((a, b) => a - b);
  const dy = Math.round(ys[Math.floor(ys.length / 2)]);
  if (!near(dxs, 0) || !near(dys, dy)) throw new Error(`page ${page}: not a plain vertical shift ${[...dxs]} ${[...dys]}`);
  if (dy !== 0) shifted.push(`${page}:${dy}`);
  const flat: number[] = [];
  for (const l of pageLines(words, page)) {
    flat.push(l.line, l.y0 + dy, l.y1 + dy, l.coverTop + dy, l.coverBottom + dy, l.x0, l.x1, l.markers.length);
    for (const [a, b] of l.markers) flat.push(a, b);
  }
  out[String(page)] = flat.map((n) => Math.round(n));
}
fs.writeFileSync(DEV + '/src/data/pageLines.json', JSON.stringify(out));
console.log('pages', Object.keys(out).length, 'shifted', shifted.join(' '), 'bytes', fs.statSync(DEV + '/src/data/pageLines.json').size);
const lineCounts = Object.values(out).map((f) => { let n = 0, i = 0; while (i < f.length) { n++; i += 8 + 2 * f[i + 7]; } return n; });
console.log('lines per page min/max', Math.min(...lineCounts), Math.max(...lineCounts));
let markers = 0; for (const f of Object.values(out)) { let i = 0; while (i < f.length) { markers += f[i + 7]; i += 8 + 2 * f[i + 7]; } }
console.log('markers', markers);
