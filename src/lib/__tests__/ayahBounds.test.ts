import { ayahAt, ayahRects, firstVerseOnPage } from '../ayahBounds';

describe('ayahBounds', () => {
  // Page 50 opens Aal-i-Imraan; the first glyph of 3:1 spans x 920–979, y 251–301.
  it('finds the verse under a point', () => {
    expect(ayahAt(50, 950, 280)).toEqual({ page: 50, sura: 3, ayah: 1 });
  });

  it('finds nothing in the margin or the surah header', () => {
    expect(ayahAt(50, 5, 5)).toBeNull();
  });

  it('gives one rectangle per line a verse occupies', () => {
    const rects = ayahRects(50, 3, 7);
    expect(rects.length).toBeGreaterThanOrEqual(4);
    for (const r of rects) {
      expect(r.x1).toBeGreaterThan(r.x0);
      expect(r.y1).toBeGreaterThan(r.y0);
    }
  });

  it('covers a verse that continues onto the next page', () => {
    // Al-Baqarah 2:6 starts on page 2 and ends on page 3.
    expect(ayahRects(3, 2, 6).length).toBeGreaterThan(0);
  });

  it('gives the first verse on a page (where ▶ starts), even one begun on the page before', () => {
    expect(firstVerseOnPage(1)).toEqual({ page: 1, sura: 1, ayah: 1 });
    expect(firstVerseOnPage(3)).toEqual({ page: 3, sura: 2, ayah: 6 });
    expect(firstVerseOnPage(604)).toEqual({ page: 604, sura: 112, ayah: 1 });
    expect(firstVerseOnPage(999)).toBeNull();
  });
});
