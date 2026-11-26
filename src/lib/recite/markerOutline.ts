// A verse marker's outline, for a hidden page (pure).
//
// A marker's opening in the cover is a rectangle (src/data/pageLines.json, its rows in markerRows.json), but the marker
// is round, with its crown above and its ears at the sides. A word's stroke that reaches into the rectangle's corners
// beside the marker (a damma, the end of a kaf's top) showed on a hidden page (Majd, Nov 25 2026: "hidden view shows a lot
// of pieces of letters meaning it's not being hidden correctly ... this also applies for the tracker and following along
// when hidden"). So the cover also takes each corner, in steps that follow the outline.
//
// MARKER_OUTLINE is the ornament's own shape, measured on the page images with scripts/check-page-markers.py's template
// (its area, grown about a unit): 24 columns from left to right, each column's top and bottom as a share of the marker's
// height, each taken over its column and 1% of the width either side. Measured Nov 25 2026 on the originals, all 604
// pages: the word ink showing in the text lines went from 853 bits on 201 pages to under a tenth, with none of a marker's
// own ink covered.

import type { Rect } from '../ayahBounds';

export const MARKER_OUTLINE: readonly (readonly [number, number])[] = [
  [0.289, 0.545], [0.262, 0.701], [0.219, 0.786], [0.112, 0.845], [0.112, 0.888], [0.128, 0.92],
  [0.134, 0.947], [0.123, 0.968], [0.016, 0.984], [0.0, 0.989], [0.0, 0.995], [0.005, 1.0],
  [0.005, 1.0], [0.0, 0.995], [0.0, 0.989], [0.016, 0.984], [0.123, 0.968], [0.134, 0.947],
  [0.128, 0.925], [0.112, 0.888], [0.112, 0.845], [0.219, 0.786], [0.262, 0.701], [0.289, 0.545],
];

/** Room left above and below the outline (bounds units), so a marker's own edge is never covered (0.5 covered a row of
 * a few small markers' ink in Juz 30; at 1, 4 pixels on all 604 pages, none of them visible). */
const ROOM = 1;
/** How far inside the opening's sides the outline's columns start: the opening is the marker's ink and some room. */
const INSET = 2;
/** An opening this much wider than tall holds a sajdah sign beside its marker: it stays a rectangle. */
const SAJDAH_WIDTH = 1.3;

/**
 * The corners of a marker's opening that its outline leaves empty, as covers: `box` is the opening (its sides, in the
 * marker's rows). Each step is on one side of the marker's middle (`side`), so it can go with that side's word.
 */
export function markerCorners(box: Rect): { rect: Rect; side: 'left' | 'right' }[] {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  if (width <= 0 || height <= 0 || width > SAJDAH_WIDTH * height) return [];
  const n = MARKER_OUTLINE.length;
  const a = box.x0 + INSET;
  const b = box.x1 - INSET;
  const mid = (box.x0 + box.x1) / 2;
  const out: { rect: Rect; side: 'left' | 'right' }[] = [];
  MARKER_OUTLINE.forEach(([top, bottom], i) => {
    const x0 = i === 0 ? box.x0 : a + ((b - a) * i) / n;
    const x1 = i === n - 1 ? box.x1 : a + ((b - a) * (i + 1)) / n;
    const side = (x0 + x1) / 2 < mid ? 'left' : 'right';
    const over = box.y0 + top * height - ROOM;
    const under = box.y0 + bottom * height + ROOM;
    if (over > box.y0) out.push({ rect: { x0, x1, y0: box.y0, y1: over }, side });
    if (under < box.y1) out.push({ rect: { x0, x1, y0: under, y1: box.y1 }, side });
  });
  return out;
}
