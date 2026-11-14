// Where the live check draws on a page (pure), in bounds space (1024 wide, as ayahBounds): MushafPager scales by the
// page's size. Only the 1405 print has word boxes (MushafEdition.reciteData), as for hidden recite mode.
//
// A word's box takes its x from the word data (src/data/quranWords.dat) and its y from the page's line band
// (src/data/pageLines.json): the word data fits pages 1 and 2 a few units off develop's verse boxes, and the line
// bands were moved onto them (scripts/build-page-lines.ts).

import { ayahRects, Rect } from '../ayahBounds';
import { pageLines } from '../recite/pageLines';
import type { QuranWords } from '../recite/quranWords';
import type { Mark } from './contract';

/** A word's box on its page, the full height of its line. */
export function wordBox(words: QuranWords, w: number): Rect {
  const r = words.rect(w);
  const line = pageLines(words.pageOf(w)).find((l) => l.line === words.lineOf(w));
  return line ? { x0: r.x0, x1: r.x1, y0: line.y0, y1: line.y1 } : r;
}

/** A rect grown by `dx` each side and `dy` above and below. */
export function grow(r: Rect, dx: number, dy: number): Rect {
  return { x0: r.x0 - dx, x1: r.x1 + dx, y0: r.y0 - dy, y1: r.y1 + dy };
}

/** The box that follows the reciter: the word, a little wider and taller. */
export const cursorBox = (words: QuranWords, w: number): Rect => grow(wordBox(words, w), 5, 3);

/** The current ayah's band: its verse boxes (each line it covers, its end marker included), with room around. */
export function ayahBand(page: number, sura: number, ayah: number): Rect[] {
  return ayahRects(page, sura, ayah).map((r) => grow(r, 6, 6));
}

/** Where a mark is drawn. */
export type MarkShape =
  | { mark: Mark; type: 'word'; box: Rect }
  /** An added word: a point in the gap after the word it came after (to its left, in the line's foot). */
  | { mark: Mark; type: 'gap'; x: number; y: number };

export function markShape(words: QuranWords, mark: Mark): MarkShape {
  const box = wordBox(words, mark.w);
  if (mark.kind === 'added') return { mark, type: 'gap', x: box.x0, y: box.y1 };
  return { mark, type: 'word', box };
}

/** The mark under a point on a page (bounds space), if any: a word's box, or near an added word's gap. */
export function markAt(words: QuranWords, marks: Mark[], x: number, y: number, slop = 14): Mark | null {
  let best: { mark: Mark; d: number } | null = null;
  for (const mark of marks) {
    const s = markShape(words, mark);
    let d: number;
    if (s.type === 'word') {
      const b = grow(s.box, slop, slop / 2);
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      d = Math.abs(x - (s.box.x0 + s.box.x1) / 2);
    } else {
      d = Math.hypot(x - s.x, y - s.y);
      if (d > slop * 2) continue;
    }
    if (!best || d < best.d) best = { mark, d };
  }
  return best?.mark ?? null;
}
