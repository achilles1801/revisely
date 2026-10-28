import {
  hiddenPageLayout,
  hidePageAgain,
  NOTHING_REVEALED,
  nextHiddenVerse,
  revealedOn,
  revealVerse,
  verseKey,
} from '../hiddenPage';
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
      // Covered: the whole line less its markers.
      const markers = pageLines(1).find((p) => p.line === l.line)!.markers;
      expect(total(l.covers)).toBe(l.x1 - l.x0 - total(markers));
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
    // 1:4 (left of 1:3, the text runs right to left) is covered, up to 1:3
    // (its marker, at its left end, stays open).
    const covered = (x: number) => line.covers.some(([a, b]) => x >= a && x <= b);
    expect(covered((r4.x0 + r4.x1) / 2) && covered(r4.x1 - 3)).toBe(true);
    // Most of 1:3 is open.
    expect(covered((r3.x0 + r3.x1) / 2)).toBe(false);
  });

  it('everything revealed: nothing covered, no band, nothing next', () => {
    const all = new Set(versesOnPage(1).map(verseKey));
    const { lines, next } = hiddenPageLayout(1, all);
    expect(next).toBeNull();
    expect(lines.every((l) => l.covers.length === 0 && !l.current)).toBe(true);
  });

  it('the reveal state: per page, once each, in order; covered again', () => {
    let s = revealVerse(NOTHING_REVEALED, 1, { sura: 1, ayah: 2 });
    s = revealVerse(s, 1, { sura: 1, ayah: 1 });
    expect(revealVerse(s, 1, { sura: 1, ayah: 1 })).toBe(s);
    expect(s[1].verses).toEqual(['1:2', '1:1']);
    expect([...revealedOn(s, 2)]).toEqual([]);
    expect(nextHiddenVerse(s, 1) && verseKey(nextHiddenVerse(s, 1)!)).toBe('1:3');
    expect(hidePageAgain(s, 1)).toEqual({});
  });

  it('a page whose first verse began on the page before starts with it', () => {
    // Page 3 begins mid-verse (2:6 starts on page 3? its first verse is 2:6).
    const first = versesOnPage(3)[0];
    expect(nextHiddenVerse(NOTHING_REVEALED, 3)).toEqual(first);
  });
});
