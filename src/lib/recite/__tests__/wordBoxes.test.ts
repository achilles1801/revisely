// Where words are drawn: the word boxes (masks, mistake tints) and the verse
// highlight boxes come from the same glyph data and must agree, and both must
// sit on the page images. Page 3's image is laid out larger than the glyph
// data's own rendering; its boxes are corrected in the build scripts (PAGE_FIX).
import { ayahRects, BOUNDS_WIDTH, PAGE_IMAGE_ASPECT } from '../../ayahBounds';
import { quranWords } from '../__fixtures__/quranWords';

const words = quranWords();
const PAGE_HEIGHT = BOUNDS_WIDTH / PAGE_IMAGE_ASPECT;

describe('word boxes', () => {
  it('lie inside their verse’s highlight on every page', () => {
    const outside: string[] = [];
    for (let w = 0; w < words.count; w++) {
      const r = words.rect(w);
      const { sura, ayah } = words.ref(w);
      const rects = ayahRects(words.pageOf(w), sura, ayah);
      const inside = rects.some(
        (h) => r.x0 >= h.x0 - 1 && r.x1 <= h.x1 + 1 && r.y0 >= h.y0 - 1 && r.y1 <= h.y1 + 1,
      );
      if (!inside) outside.push(`${sura}:${ayah} word ${w}`);
    }
    expect(outside.slice(0, 5)).toEqual([]);
  });

  it('lie on the page', () => {
    const off: number[] = [];
    for (let w = 0; w < words.count; w++) {
      const r = words.rect(w);
      const ok = r.x0 >= 0 && r.x1 <= BOUNDS_WIDTH && r.y0 >= 0 && r.y1 <= PAGE_HEIGHT && r.x1 > r.x0 && r.y1 > r.y0;
      if (!ok) off.push(w);
    }
    expect(off.slice(0, 5)).toEqual([]);
  });

  // Ink of mushaf/003.png, measured (1024-wide units): the first line's ink is at
  // 16-109, the last at 1566-1649, and the text spans x 43-982.
  it('match the ink of page 3 (laid out larger than the glyph data)', () => {
    const [from, to] = words.pageRange(3);
    const rects = Array.from({ length: to - from }, (_, k) => words.rect(from + k));
    const top = Math.min(...rects.map((r) => r.y0));
    const bottom = Math.max(...rects.map((r) => r.y1));
    const left = Math.min(...rects.map((r) => r.x0));
    const right = Math.max(...rects.map((r) => r.x1));
    expect(Math.abs(top - 16)).toBeLessThanOrEqual(4);
    expect(Math.abs(bottom - 1649)).toBeLessThanOrEqual(6);
    expect(Math.abs(left - 44)).toBeLessThanOrEqual(6);
    expect(Math.abs(right - 980)).toBeLessThanOrEqual(6);
    // The highlight of the last verse on the page sits on the same lines.
    const last = words.ref(to - 1);
    const hl = ayahRects(3, last.sura, last.ayah);
    expect(Math.max(...hl.map((r) => r.y1))).toBe(bottom);
  });

  it('page 4 keeps the glyph data as it was (only pages 1-3 are corrected)', () => {
    const [from, to] = words.pageRange(4);
    const rects = Array.from({ length: to - from }, (_, k) => words.rect(from + k));
    // Ink of mushaf/004.png: lines from about 17 to 1600.
    expect(Math.min(...rects.map((r) => r.y0))).toBeLessThan(40);
    expect(Math.max(...rects.map((r) => r.y1))).toBeLessThan(1620);
  });
});
