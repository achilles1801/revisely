import { ayahAt, ayahRects, versesOnPage } from '../ayahBounds';
import bounds from '../../data/ayahBounds.json';

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

// Measured on the app's own page images (mushaf/NNN.png), in the bounds'
// 1024-wide units: the middle half of each verse line's ink, top to bottom, and
// the text block's left and right edges. Page 3's image is a different
// rendering from the glyph data's (its text 7% wider, 3% taller); before its
// fit, every highlight there sat high, the words' lower halves below it, and the
// line ends outside it. The other pages are controls. scripts/check-ayah-bounds.py
// measures all 604 pages the same way.
const INK: Record<number, { cores: [number, number][]; left: number; right: number }> = {
  3: {
    cores: [[44, 72], [160, 185], [267, 293], [378, 403], [486, 513], [596, 624], [707, 735], [818, 846], [928, 956], [1037, 1065], [1148, 1177], [1262, 1288], [1371, 1399], [1483, 1510], [1593, 1621]],
    left: 43,
    right: 983,
  },
  4: {
    cores: [[52, 78], [162, 187], [267, 294], [378, 401], [479, 506], [587, 614], [695, 722], [798, 828], [906, 936], [1013, 1042], [1120, 1148], [1233, 1258], [1339, 1365], [1442, 1471], [1546, 1577]],
    left: 61,
    right: 974,
  },
  50: {
    cores: [[265, 293], [377, 401], [481, 508], [588, 614], [697, 722], [800, 828], [907, 935], [1015, 1043], [1123, 1149], [1232, 1258], [1335, 1364], [1445, 1471], [1555, 1579]],
    left: 54,
    right: 981,
  },
  300: {
    cores: [[58, 80], [161, 187], [266, 294], [371, 401], [486, 510], [584, 615], [696, 723], [806, 830], [908, 937], [1017, 1043], [1125, 1152], [1232, 1258], [1338, 1365], [1441, 1472], [1554, 1580]],
    left: 56,
    right: 981,
  },
  604: {
    cores: [[260, 292], [366, 399], [692, 722], [806, 830], [907, 936], [1229, 1259], [1334, 1365], [1448, 1476], [1550, 1581]],
    left: 64,
    right: 965,
  },
};

describe('the boxes sit where the page images draw the text', () => {
  const lines = (page: number) => {
    const d = (bounds as Record<string, number[]>)[String(page)];
    const rects: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let i = 0; i < d.length; i += 6) rects.push({ x0: d[i + 2], y0: d[i + 3], x1: d[i + 4], y1: d[i + 5] });
    const bands = [...new Map(rects.map((r) => [`${r.y0}:${r.y1}`, r])).values()].sort((a, b) => a.y0 - b.y0);
    return { rects, bands };
  };

  it.each(Object.keys(INK).map(Number))('page %i: every line’s box holds the middle of its ink, and spans the text edge to edge', (page) => {
    const { rects, bands } = lines(page);
    const ink = INK[page];
    expect(bands).toHaveLength(ink.cores.length);
    bands.forEach((band, i) => {
      const [top, bottom] = ink.cores[i];
      expect(band.y0).toBeLessThanOrEqual(top + 1);
      expect(band.y1).toBeGreaterThanOrEqual(bottom - 1);
    });
    expect(Math.abs(Math.min(...rects.map((r) => r.x0)) - ink.left)).toBeLessThanOrEqual(8);
    expect(Math.abs(Math.max(...rects.map((r) => r.x1)) - ink.right)).toBeLessThanOrEqual(8);
  });
});
