// Where each verse sits on a mushaf page image, for press-and-hold on a verse.
//
// src/data/ayahBounds.json is built by scripts/build-ayah-bounds.py from the glyph
// bounds that github.com/quran/quran.com-images records while drawing the same
// page images the app shows. Coordinates are in a 1024-wide page; one rectangle
// per verse per line, spanning the line's full height.
//
// The 1441 print (lib/mushafEdition) has its own, src/data/ayahBounds1441.json,
// measured from its pages by scripts/build-mushaf-1441.py in the same format and
// the same 1024-wide space (its pages are nearly the same shape: 0.620 against
// 0.618). Everything here reads the edition chosen, unless one is named.

import { getMushafEdition, MushafEditionId, mushafEdition } from './mushafEdition';

/** Width of the coordinate space in ayahBounds.json. */
export const BOUNDS_WIDTH = 1024;
/** The 1405 page images are 2600×4206. */
export const PAGE_IMAGE_ASPECT = 2600 / 4206;

/** Width / height of the chosen edition's pages (their bounds space is 1024 × 1024 / aspect). */
export function pageAspect(edition: MushafEditionId = getMushafEdition()): number {
  return mushafEdition(edition).aspect;
}

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

export type BoundsFile = Record<string, number[]>;
const bounds = new Map<MushafEditionId, BoundsFile>();

/** An edition's whole bounds file. Loaded on first use: ~300 KB of JSON that most screens never need. */
export function boundsFile(edition: MushafEditionId = getMushafEdition()): BoundsFile {
  let b = bounds.get(edition);
  if (!b) {
    b = (edition === 'madani1441'
      ? require('../data/ayahBounds1441.json')
      : require('../data/ayahBounds.json')) as BoundsFile;
    bounds.set(edition, b);
  }
  return b;
}

function pageData(page: number, edition?: MushafEditionId): number[] {
  return boundsFile(edition)[String(page)] ?? [];
}

/** The verses on a page, top to bottom (the first may have begun on the page before). */
export function versesOnPage(page: number, edition?: MushafEditionId): AyahRef[] {
  const d = pageData(page, edition);
  const out: AyahRef[] = [];
  for (let i = 0; i < d.length; i += 6) {
    const last = out[out.length - 1];
    if (!last || last.sura !== d[i] || last.ayah !== d[i + 1]) out.push({ page, sura: d[i], ayah: d[i + 1] });
  }
  return out;
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
