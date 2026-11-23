// The lines of a mushaf page, for hiding the words while reciting (as Tarteel
// does): each line is covered whole, from the top of its glyphs to the bottom
// and across the text, so no letter, dot or vowel mark shows beside a cover;
// only the verse-end markers are left open, so the verses can be told apart.
//
// src/data/pageLines.json is built by scripts/build-page-lines.ts from the word
// boxes of the same glyph data as ayahBounds.json, in the same 1024-wide space.
// src/data/markerRows.json holds each marker's rows (its ink, top to bottom),
// measured on the page images by scripts/check-page-markers.py: a marker is open
// in its own rows only, so a stroke over or under it (a sajdah's overline, a
// word's dot) stays covered.

/** An interval along a line, in bounds space. */
export type Span = [number, number];

export interface PageLine {
  line: number;
  /** The band of its glyphs (the verse boxes on it span the same band). */
  y0: number;
  y1: number;
  /** What a cover takes vertically: a little past the band, never into the next line's. */
  coverTop: number;
  coverBottom: number;
  /** Horizontal extent of the line's text (words and markers). */
  x0: number;
  x1: number;
  /** Verse markers on the line, left open. */
  markers: Span[];
  /** Each marker's rows (top, bottom), in the order of `markers`: the cover's rows where none was measured. */
  markerRows: Span[];
}

type LinesFile = Record<string, number[]>;
let file: LinesFile | null = null;
let rowsFile: LinesFile | null = null;
const cache = new Map<number, PageLine[]>();

/** A page's lines, top to bottom (loaded on first use: ~300 KB). */
export function pageLines(page: number): PageLine[] {
  const hit = cache.get(page);
  if (hit) return hit;
  if (!file) file = require('../../data/pageLines.json') as LinesFile;
  if (!rowsFile) rowsFile = require('../../data/markerRows.json') as LinesFile;
  const flat = file[String(page)] ?? [];
  // The page's markers' rows, top and bottom each, in the order the lines list them.
  const rows = rowsFile[String(page)] ?? [];
  let k = 0;
  const lines: PageLine[] = [];
  let i = 0;
  while (i + 8 <= flat.length) {
    const n = flat[i + 7];
    const markers: Span[] = [];
    const markerRows: Span[] = [];
    for (let m = 0; m < n; m++, k++) {
      markers.push([flat[i + 8 + 2 * m], flat[i + 9 + 2 * m]]);
      const top = rows[2 * k];
      const bottom = rows[2 * k + 1];
      markerRows.push(top != null && bottom != null ? [Math.max(top, flat[i + 3]), Math.min(bottom, flat[i + 4])] : [flat[i + 3], flat[i + 4]]);
    }
    lines.push({
      line: flat[i],
      y0: flat[i + 1],
      y1: flat[i + 2],
      coverTop: flat[i + 3],
      coverBottom: flat[i + 4],
      x0: flat[i + 5],
      x1: flat[i + 6],
      markers,
      markerRows,
    });
    i += 8 + 2 * n;
  }
  cache.set(page, lines);
  return lines;
}

/**
 * The parts of [x0, x1] left after taking out `holes` (any order, may overlap),
 * left to right.
 */
export function subtractSpans(x0: number, x1: number, holes: Span[]): Span[] {
  const out: Span[] = [];
  let at = x0;
  for (const [h0, h1] of [...holes].sort((a, b) => a[0] - b[0])) {
    if (h1 <= at) continue;
    if (h0 >= x1) break;
    if (h0 > at) out.push([at, h0]);
    at = Math.max(at, h1);
  }
  if (at < x1) out.push([at, x1]);
  return out;
}
