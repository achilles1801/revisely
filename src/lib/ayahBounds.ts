// Where each verse sits on a mushaf page image, for press-and-hold on a verse.
//
// src/data/ayahBounds.json is built by scripts/build-ayah-bounds.py from the glyph
// bounds that github.com/quran/quran.com-images records while drawing the same
// page images the app shows. Coordinates are in a 1024-wide page; one rectangle
// per verse per line, spanning the line's full height.

/** Width of the coordinate space in ayahBounds.json. */
export const BOUNDS_WIDTH = 1024;
/** The page images are 2600×4206. */
export const PAGE_IMAGE_ASPECT = 2600 / 4206;

export interface AyahRef {
  page: number;
  sura: number;
  ayah: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type BoundsFile = Record<string, number[]>;
let bounds: BoundsFile | null = null;
function pageData(page: number): number[] {
  // Loaded on first use: ~300 KB of JSON that most screens never need.
  if (!bounds) bounds = require('../data/ayahBounds.json') as BoundsFile;
  return bounds[String(page)] ?? [];
}

/** The first verse on a page (it may have begun on the page before): where
 *  "play this page" starts. Null for a page with no verse data. */
export function firstVerseOnPage(page: number): AyahRef | null {
  const d = pageData(page);
  return d.length >= 2 ? { page, sura: d[0], ayah: d[1] } : null;
}

/** The rectangles (bounds space) covering one verse on a page. */
export function ayahRects(page: number, sura: number, ayah: number): Rect[] {
  const d = pageData(page);
  const out: Rect[] = [];
  for (let i = 0; i < d.length; i += 6) {
    if (d[i] === sura && d[i + 1] === ayah) {
      out.push({ x0: d[i + 2], y0: d[i + 3], x1: d[i + 4], y1: d[i + 5] });
    }
  }
  return out;
}

/**
 * The verse under a point (bounds space). A point in the gap between lines or
 * beside the text snaps to the nearest verse within `tolerance`; further away
 * (the margins, a surah header) there is none.
 */
export function ayahAt(page: number, x: number, y: number, tolerance = 24): AyahRef | null {
  const d = pageData(page);
  let best: AyahRef | null = null;
  let bestDist = tolerance;
  for (let i = 0; i < d.length; i += 6) {
    const dx = Math.max(d[i + 2] - x, 0, x - d[i + 4]);
    const dy = Math.max(d[i + 3] - y, 0, y - d[i + 5]);
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return { page, sura: d[i], ayah: d[i + 1] };
    if (dist < bestDist) {
      bestDist = dist;
      best = { page, sura: d[i], ayah: d[i + 1] };
    }
  }
  return best;
}
