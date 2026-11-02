// The lines of a mushaf page, for hiding the words while reciting (as Tarteel
// does): each line is covered whole, from the top of its glyphs to the bottom
// and across the text, so no letter, dot or vowel mark shows beside a cover;
// only the verse-end markers are left open, so the verses can be told apart.
//
// src/data/pageLines.json is built by scripts/build-page-lines.ts from the word
// boxes of the same glyph data as ayahBounds.json, in the same 1024-wide space.

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
}

type LinesFile = Record<string, number[]>;
let file: LinesFile | null = null;
const cache = new Map<number, PageLine[]>();

/** A page's lines, top to bottom (loaded on first use: ~300 KB). */
export function pageLines(page: number): PageLine[] {
  const hit = cache.get(page);
  if (hit) return hit;
  if (!file) file = require('../../data/pageLines.json') as LinesFile;
  const flat = file[String(page)] ?? [];
  const lines: PageLine[] = [];
  let i = 0;
  while (i + 8 <= flat.length) {
    const n = flat[i + 7];
    const markers: Span[] = [];
    for (let m = 0; m < n; m++) markers.push([flat[i + 8 + 2 * m], flat[i + 9 + 2 * m]]);
    lines.push({
      line: flat[i],
      y0: flat[i + 1],
      y1: flat[i + 2],
      coverTop: flat[i + 3],
      coverBottom: flat[i + 4],
      x0: flat[i + 5],
      x1: flat[i + 6],
      markers,
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
