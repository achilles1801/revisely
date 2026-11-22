import { hiddenPageLayout, verseKey } from '../hiddenPage';
import { pageLines, subtractSpans } from '../pageLines';
import { ayahRects, versesOnPage } from '../../ayahBounds';

const total = (spans: [number, number][]) => spans.reduce((n, [a, b]) => n + (b - a), 0);

describe('pageLines', () => {
  it('every page has its lines, top to bottom, the covers around their bands', () => {
    for (const page of [1, 2, 3, 50, 300, 604]) {
      const lines = pageLines(page);
      // Surah headers and the basmala aren't verse text: fewer lines on those pages.
      expect(lines.length).toBeGreaterThanOrEqual(6);
      expect(lines.length).toBeLessThanOrEqual(15);
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        expect(l.coverTop).toBeLessThanOrEqual(l.y0);
        expect(l.coverBottom).toBeGreaterThanOrEqual(l.y1);
        expect(l.x1).toBeGreaterThan(l.x0);
        if (i > 0) expect(l.y0).toBeGreaterThan(lines[i - 1].y0);
      }
    }
  });

  it('the bands are the verse boxes’ (pages 1 and 2 moved onto develop’s fit)', () => {
    for (const page of [1, 2, 3, 77, 604]) {
      const bands = new Set(pageLines(page).map((l) => `${l.y0}-${l.y1}`));
      for (const v of versesOnPage(page)) {
        for (const r of ayahRects(page, v.sura, v.ayah)) {
          const near = pageLines(page).some((l) => Math.abs(l.y0 - r.y0) <= 1 && Math.abs(l.y1 - r.y1) <= 1);
          expect({ page, verse: verseKey(v), near, bands: bands.size > 0 }).toEqual({ page, verse: verseKey(v), near: true, bands: true });
        }
      }
    }
  });

  it('a marker for every verse that ends on the page (Al-Fatihah: 7)', () => {
    expect(pageLines(1).reduce((n, l) => n + l.markers.length, 0)).toBe(7);
  });

  it('every marker’s opening is at least as wide as the smallest marker (pages 1 and 2: 60 units)', () => {
    // Before Nov 15 2026 page 236's held 43 units of an 80-unit ring.
    for (let page = 1; page <= 604; page++) {
      for (const l of pageLines(page)) {
        for (const [a, b] of l.markers) expect({ page, line: l.line, wide: b - a >= 60 }).toEqual({ page, line: l.line, wide: true });
      }
    }
  });

  it('subtractSpans', () => {
    expect(subtractSpans(0, 100, [[10, 20], [15, 30], [90, 120]])).toEqual([[0, 10], [30, 90]]);
    expect(subtractSpans(0, 100, [])).toEqual([[0, 100]]);
  });
});

describe('hidden page', () => {
  it('all hidden: every line covered but its markers; the band on the first verse’s line', () => {
    const { lines, next } = hiddenPageLayout(1, new Set());
    expect(next && verseKey(next)).toBe('1:1');
    for (const l of lines) {
      expect(l.covers.length).toBeGreaterThanOrEqual(1);
      // Covered: the whole line less its markers (a sliver beside a marker with no verse in it needs no cover).
      const markers = pageLines(1).find((p) => p.line === l.line)!.markers;
      expect(total(l.covers)).toBeLessThanOrEqual(l.x1 - l.x0 - total(markers) + 1e-6);
      for (const v of versesOnPage(1)) {
        for (const r of ayahRects(1, v.sura, v.ayah).filter((r) => Math.abs(r.y0 - l.y0) <= 1)) {
          for (const [a, b] of subtractSpans(r.x0, r.x1, markers)) {
            expect(l.covers.some(([c0, c1]) => c0 <= a && c1 >= b)).toBe(true);
          }
        }
      }
    }
    expect(lines.filter((l) => l.current)).toHaveLength(1);
    expect(lines[0].current).toBe(true);
  });

  it('a revealed verse opens in place; the band moves to the next verse’s line', () => {
    const shown = new Set(['1:1', '1:2']);
    const { lines, next } = hiddenPageLayout(1, shown);
    expect(next && verseKey(next)).toBe('1:3');
    // 1:1 and 1:2 are alone on their lines: nothing covered there.
    const r1 = ayahRects(1, 1, 1)[0];
    const line1 = lines.find((l) => Math.abs(l.y0 - r1.y0) <= 1)!;
    expect(line1.covers).toEqual([]);
    const r3 = ayahRects(1, 1, 3)[0];
    expect(lines.find((l) => l.current)!.y0).toBe(lines.find((l) => Math.abs(l.y0 - r3.y0) <= 1)!.y0);
  });

  it('a revealed verse beside a hidden one on the same line: the hidden one stays covered', () => {
    // On page 1, 1:3 and 1:4 share a line.
    const r3 = ayahRects(1, 1, 3)[0];
    const r4 = ayahRects(1, 1, 4)[0];
    expect(Math.abs(r3.y0 - r4.y0)).toBeLessThanOrEqual(1);
    const { lines } = hiddenPageLayout(1, new Set(['1:1', '1:2', '1:3']));
    const line = lines.find((l) => Math.abs(l.y0 - r3.y0) <= 1)!;
    // 1:4 (left of 1:3, the text runs right to left) is covered, up to 1:3's marker (at 1:3's left end, open; its
    // left ear reaches a little into 1:4's box).
    const covered = (x: number) => line.covers.some(([a, b]) => x >= a && x <= b);
    const marker3 = pageLines(1).find((p) => p.line === line.line)!.markers.find(([a, b]) => a < r3.x0 && b > r3.x0)!;
    expect(covered((r4.x0 + r4.x1) / 2) && covered(marker3[0] - 0.5)).toBe(true);
    expect(covered(marker3[0] + 0.5)).toBe(false);
    // Most of 1:3 is open.
    expect(covered((r3.x0 + r3.x1) / 2)).toBe(false);
  });

  it('everything revealed: nothing covered, no band, nothing next', () => {
    const all = new Set(versesOnPage(1).map(verseKey));
    const { lines, next } = hiddenPageLayout(1, all);
    expect(next).toBeNull();
    expect(lines.every((l) => l.covers.length === 0 && !l.current)).toBe(true);
  });

  it('a page whose first verse began on the page before starts with it', () => {
    // Page 3 begins mid-verse (2:6 starts on page 3? its first verse is 2:6).
    const first = versesOnPage(3)[0];
    expect(hiddenPageLayout(3, new Set()).next).toEqual(first);
  });
});

describe('hidden page, word by word (following the reciter)', () => {
  const fs = require('fs');
  const path = require('path');
  const { setQuranWordsForTests, getQuranWords } = require('../quranWords');
  beforeAll(() => {
    setQuranWordsForTests(JSON.parse(fs.readFileSync(path.join(__dirname, '../../../data/quranWords.dat'), 'utf8')));
  });
  afterAll(() => setQuranWordsForTests(null));
  const covered = (lines: { covers: [number, number][]; line: number }[], line: number, x: number) =>
    lines.find((l) => l.line === line)!.covers.some(([a, b]) => x >= a && x <= b);

  it('the words recited open in place, the rest of the line stays covered; the band follows the next word', () => {
    const words = getQuranWords();
    const [from] = words.pageRange(1);
    // The first two words of Al-Fatihah recited; the third is next.
    const shown = new Set([from, from + 1]);
    const { lines } = hiddenPageLayout(1, new Set(), { words, shown: (w: number) => shown.has(w), next: from + 2 });
    const mid = (w: number) => (words.rect(w).x0 + words.rect(w).x1) / 2;
    const line = words.lineOf(from);
    expect(covered(lines, line, mid(from))).toBe(false);
    expect(covered(lines, line, mid(from + 1))).toBe(false);
    expect(covered(lines, words.lineOf(from + 2), mid(from + 2))).toBe(true);
    expect(lines.filter((l) => l.current).map((l) => l.line)).toEqual([words.lineOf(from + 2)]);
  });

  it('nothing recited: every word covered (markers open), as the verse mode', () => {
    const words = getQuranWords();
    const [from, to] = words.pageRange(50);
    const { lines } = hiddenPageLayout(50, new Set(), { words, shown: () => false, next: null });
    for (let w = from; w < to; w++) {
      const r = words.rect(w);
      expect(covered(lines, words.lineOf(w), (r.x0 + r.x1) / 2)).toBe(true);
    }
  });

  it('a whole page recited: nothing covered, no band', () => {
    const words = getQuranWords();
    const { lines, next } = hiddenPageLayout(50, new Set(), { words, shown: () => true, next: null });
    expect(lines.every((l) => l.covers.length === 0 && !l.current)).toBe(true);
    expect(next).toBeNull();
  });

  // Each marker's ink across the rows a cover takes, measured on the page images by scripts/check-page-markers.py
  // (which checks every marker on every page). Majd's screenshot (Nov 15 2026): page 2's ۱ ۲ ۳ were cut on the left,
  // only ۴ (its line's end) was whole; the openings sat 7 units right of the markers on nearly every page.
  const MEASURED: { why: string; page: number; line: number; ink: [number, number] }[] = [
    { why: '۱, cut by 8.3', page: 2, line: 3, ink: [672.69, 732.95] },
    { why: '۲, cut by 6.7', page: 2, line: 4, ink: [652.21, 712.47] },
    { why: '۳, cut by 7.1', page: 2, line: 5, ink: [500.97, 561.23] },
    { why: '۴, at its line’s end', page: 2, line: 6, ink: [211.1, 271.36] },
    { why: 'page 3’s wider print', page: 3, line: 7, ink: [267.03, 353.28] },
    { why: 'the opening held part of the ring', page: 236, line: 5, ink: [552.96, 633.3] },
    { why: 'a sajdah sign beside the ring', page: 416, line: 8, ink: [359.19, 502.15] },
    { why: 'a word touching the marker', page: 577, line: 2, ink: [906.24, 988.16] },
    { why: 'smaller markers', page: 596, line: 14, ink: [98.07, 171.72] },
    { why: 'smaller markers, touching on both sides', page: 596, line: 14, ink: [711.29, 784.54] },
  ];
  const cut = (lines: { covers: [number, number][]; line: number }[], line: number, [x0, x1]: [number, number]) =>
    lines.find((l) => l.line === line)!.covers.filter(([a, b]) => Math.min(b, x1) > Math.max(a, x0));

  it('no cover reaches into a verse marker, by verse or word by word, whatever is shown', () => {
    const words = getQuranWords();
    for (const m of MEASURED) {
      const [from] = words.pageRange(m.page);
      const layouts = {
        verses: hiddenPageLayout(m.page, new Set()).lines,
        nothingRecited: hiddenPageLayout(m.page, new Set(), { words, shown: () => false, next: from }).lines,
        everyOtherWord: hiddenPageLayout(m.page, new Set(), { words, shown: (w: number) => w % 2 === 0, next: null }).lines,
      };
      for (const [name, lines] of Object.entries(layouts)) {
        expect({ marker: m.why, name, cut: cut(lines, m.line, m.ink) }).toEqual({ marker: m.why, name, cut: [] });
      }
    }
  });

  it('a verse shown by a tap shows all its words, beside the ones recited', () => {
    const words = getQuranWords();
    const [a, b] = words.verseRange(1, 3);
    const { lines } = hiddenPageLayout(1, new Set(['1:3']), { words, shown: () => false, next: null });
    for (let w = a; w < b; w++) {
      const r = words.rect(w);
      expect(covered(lines, words.lineOf(w), (r.x0 + r.x1) / 2)).toBe(false);
    }
    const r4 = words.rect(words.verseRange(1, 4)[0]);
    expect(covered(lines, words.lineOf(words.verseRange(1, 4)[0]), (r4.x0 + r4.x1) / 2)).toBe(true);
  });

  // Each word's ink across the rows a cover takes, measured on the page images by scripts/check-word-boxes.py (which
  // checks every word on every page). Majd, Nov 21 2026: the word just recited was "partially cut off" by the next
  // word's cover. The glyph data's boxes sat 2–12 units off the ink, and a hidden word's cover took 2 units more.
  const WORDS: { why: string; page: number; line: number; ref: [number, number, number]; ink: [number, number] }[] = [
    { why: 'its box reached 12 units into the ۱ marker', page: 2, line: 3, ref: [2, 2, 1], ink: [603.37, 664.02] },
    { why: 'its ink began 2.3 units left of its box', page: 2, line: 3, ref: [2, 2, 2], ink: [453.71, 601.01] },
    { why: 'page 3’s own rendering', page: 3, line: 7, ref: [2, 11, 1], ink: [187.08, 255.61] },
    { why: 'a silah’s small yeh in the gap after it', page: 50, line: 12, ref: [3, 7, 37], ink: [422.6, 478.13] },
    { why: 'under a sajdah’s overline', page: 416, line: 7, ref: [32, 15, 9], ink: [288.69, 388.73] },
    { why: 'its box sat inside its neighbour’s', page: 450, line: 14, ref: [37, 124, 2], ink: [891.27, 948.38] },
    { why: 'touching its verse marker', page: 577, line: 12, ref: [75, 10, 5], ink: [878.67, 950.74] },
    { why: 'smaller print', page: 596, line: 14, ref: [94, 5, 1], ink: [356.82, 404.09] },
  ];
  const wordOf = (words: { verseFirstWord: (s: number, a: number) => number }, [s, a, p]: [number, number, number]) =>
    words.verseFirstWord(s, a) + p - 1;
  /** What of [x0, x1] shows: outside every cover and in no marker's opening is open; this is the rest. */
  const showing = (lines: { covers: [number, number][]; line: number }[], page: number, line: number, [x0, x1]: [number, number]) =>
    subtractSpans(x0, x1, [...lines.find((l) => l.line === line)!.covers, ...pageLines(page).find((l) => l.line === line)!.markers]);

  it('a word recited is whole beside the next word’s cover, and the next word wholly covered', () => {
    const words = getQuranWords();
    for (const m of WORDS) {
      const w = wordOf(words, m.ref);
      expect({ word: m.why, line: words.lineOf(w) }).toEqual({ word: m.why, line: m.line });
      // Recited up to it, the next to say after it: none of its ink under a cover.
      const recited = hiddenPageLayout(m.page, new Set(), { words, shown: (v: number) => v <= w, next: w + 1 }).lines;
      expect({ word: m.why, cut: cut(recited, m.line, m.ink) }).toEqual({ word: m.why, cut: [] });
      // It is next: all its ink covered (a unit at each end is its faint edge, and the next ink can be that close).
      const next = hiddenPageLayout(m.page, new Set(), { words, shown: (v: number) => v < w, next: w }).lines;
      expect({ word: m.why, shows: showing(next, m.page, m.line, [m.ink[0] + 1, m.ink[1] - 1]) }).toEqual({ word: m.why, shows: [] });
    }
  });

  it('two words whose ink shares columns (a kaf’s top stroke over the word before): the one recited stays whole', () => {
    // 12:6, page 236 line 4: كَمَآ’s kaf reaches over يَعْقُوبَ’s last letter. No straight edge keeps both whole, so the
    // edge leaves the stroke’s tip (about 18 units) over يَعْقُوبَ rather than cut يَعْقُوبَ (check-word-boxes.py).
    const words = getQuranWords();
    const yaqub = wordOf(words, [12, 6, 13]);
    const lines = hiddenPageLayout(236, new Set(), { words, shown: (v: number) => v <= yaqub, next: yaqub + 1 }).lines;
    expect(cut(lines, 4, [701.05, 825.5])).toEqual([]);
    const tip = total(showing(lines, 236, 4, [646.3, 719.95]));
    expect(tip).toBeGreaterThan(0);
    expect(tip).toBeLessThanOrEqual(19);
  });
});
