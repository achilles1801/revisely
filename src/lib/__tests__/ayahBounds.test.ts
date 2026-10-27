import { ayahAt, ayahRects, versesOnPage } from '../ayahBounds';

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

  // The opening pages, measured on the app's own images (1024-wide units):
  // Al-Fatihah's lines are centred at y 203 (the Basmala), 281 (Al-Hamd), 372…;
  // Al-Baqarah's first line at 280. Holding Al-Hamd used to pick the Basmala.
  it('pages 1 and 2: a verse is found where the image draws it', () => {
    expect(ayahAt(1, 512, 203)).toEqual({ page: 1, sura: 1, ayah: 1 });
    expect(ayahAt(1, 512, 281)).toEqual({ page: 1, sura: 1, ayah: 2 });
    expect(ayahAt(1, 700, 372)).toEqual({ page: 1, sura: 1, ayah: 3 });
    expect(ayahAt(1, 512, 717)).toEqual({ page: 1, sura: 1, ayah: 7 });
    expect(ayahAt(2, 740, 280)).toEqual({ page: 2, sura: 2, ayah: 1 });
    // The surah header above stays empty.
    expect(ayahAt(1, 512, 95)).toBeNull();
  });

  it('lists the verses on a page in order, once each', () => {
    const p3 = versesOnPage(3);
    expect(p3[0]).toEqual({ page: 3, sura: 2, ayah: 6 });
    expect(p3.map((v) => v.ayah)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(versesOnPage(999)).toEqual([]);
  });
});
