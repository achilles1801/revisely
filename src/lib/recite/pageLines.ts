// The lines of a mushaf page, for hiding the words while reciting (as Tarteel
// does): each line is covered whole, from the top of its glyphs to the bottom
// and across the text, so no letter, dot or vowel mark can show beside a
// cover; only the verse-end markers are left open, so the verses can be told
// apart. Recited words are then opened in place.
//
// The verse markers are not words in the word data, but they are part of their
// verse's rectangle in ayahBounds: on a verse's last line, the part of its
// rectangle before (left of) its first word is its marker.

import { pageAyahRects } from '../ayahBounds';
import type { QuranWords } from './quranWords';

/** An interval along a line, in bounds space. */
export type Span = [number, number];

export interface PageLine {
  line: number;
  /** The band of its glyphs. */
  y0: number;
  y1: number;
  /** What a cover takes vertically: a little past the band, but never into
   *  the next or previous line's band. */
  coverTop: number;
  coverBottom: number;
  /** Horizontal extent of the line's text (words and markers). */
  x0: number;
  x1: number;
  /** Words on the line: [first, end). */
  from: number;
  to: number;
  /** Verse markers on the line, left uncovered. */
  markers: Span[];
}

/** Points a cover reaches beyond the glyph band and the text (bounds space). */
const COVER_PAD_Y = 4;
const COVER_PAD_X = 6;
/** Room left between a marker and the word beside it (the word stays covered). */
const MARKER_GAP = 5;
/** A gap narrower than this before a verse's first word is spacing, not a marker. */
const MIN_MARKER = 12;
/** Lines this wide share of the widest line are full lines: covered across the
 *  whole text block (a stray stroke past the data's own extent stays hidden). */
const FULL_LINE = 0.8;

const cache = new WeakMap<QuranWords, Map<number, PageLine[]>>();

export function pageLines(words: QuranWords, page: number): PageLine[] {
  let byPage = cache.get(words);
  if (!byPage) cache.set(words, (byPage = new Map()));
  const hit = byPage.get(page);
  if (hit) return hit;

  const [from, to] = words.pageRange(page);
  const byLine = new Map<number, { from: number; to: number }>();
  for (let w = from; w < to; w++) {
    const l = words.lineOf(w);
    const e = byLine.get(l);
    if (e) e.to = w + 1;
    else byLine.set(l, { from: w, to: w + 1 });
  }
  const rects = pageAyahRects(page);
  const lines: PageLine[] = [];
  for (const [line, range] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    const band = words.lineBand(page, line);
    if (!band) continue;
    const [y0, y1] = band;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (let w = range.from; w < range.to; w++) {
      const r = words.rect(w);
      x0 = Math.min(x0, r.x0);
      x1 = Math.max(x1, r.x1);
    }
    const markers: Span[] = [];
    for (const r of rects) {
      if (r.y0 !== y0 || r.y1 !== y1) continue;
      x0 = Math.min(x0, r.x0);
      x1 = Math.max(x1, r.x1);
      // The verse's words on this line; the marker is left of the leftmost.
      let first = Infinity;
      let lastWordOfVerse = false;
      for (let w = range.from; w < range.to; w++) {
        const ref = words.ref(w);
        if (ref.sura !== r.sura || ref.ayah !== r.ayah) continue;
        first = Math.min(first, words.rect(w).x0);
        if (w + 1 >= words.count || !words.sameVerse(w, w + 1)) lastWordOfVerse = true;
      }
      // A verse ending at the left edge of a line has its marker at the start
      // of the next: there its rectangle holds no words, only the marker.
      const markerOnly = first === Infinity;
      if (!markerOnly && !lastWordOfVerse) continue;
      // Clear of every word on the line, the next verse's too (a verse's
      // rectangle can reach a unit or two into its neighbour's first word).
      const wordSpans: Span[] = [];
      for (let w = range.from; w < range.to; w++) {
        const b = words.rect(w);
        wordSpans.push([b.x0 - MARKER_GAP, b.x1 + MARKER_GAP]);
      }
      const free = subtractSpans(r.x0, markerOnly ? r.x1 : first, wordSpans);
      const widest = free.reduce<Span | null>((best, sp) => (!best || sp[1] - sp[0] > best[1] - best[0] ? sp : best), null);
      if (widest && widest[1] - widest[0] >= MIN_MARKER) markers.push(widest);
    }
    lines.push({ line, y0, y1, coverTop: y0, coverBottom: y1, x0, x1, from: range.from, to: range.to, markers });
  }

  // Full lines span the whole text block; covers reach a little past each band
  // without reaching into the next line's.
  const blockX0 = Math.min(...lines.map((l) => l.x0));
  const blockX1 = Math.max(...lines.map((l) => l.x1));
  lines.forEach((l, i) => {
    if (l.x1 - l.x0 >= FULL_LINE * (blockX1 - blockX0)) {
      l.x0 = blockX0;
      l.x1 = blockX1;
    }
    l.x0 -= COVER_PAD_X;
    l.x1 += COVER_PAD_X;
    const prev = lines[i - 1];
    const next = lines[i + 1];
    // Always the whole band, even where two lines' bands overlap.
    l.coverTop = Math.min(l.y0, Math.max(l.y0 - COVER_PAD_Y, prev ? prev.y1 : -Infinity));
    l.coverBottom = Math.max(l.y1, Math.min(l.y1 + COVER_PAD_Y, next ? next.y0 : Infinity));
  });
  byPage.set(page, lines);
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
