// How Recite's highlights are drawn on a page (pure), in bounds space (1024 wide, as geometry.ts): a soft pastel wash
// behind the word, never a box (Majd, Nov 21 2026: Tarteel's shading "is way more elegant than ours and also seems like
// a blurb or splash which im guessing they did on purpose to avoid the mis shaded words … They dont even use shades when
// ur reciting with the page shown ie not hidden, which is actually really nice. I also like their color shades its like
// more pastel which is what we should aim for as well"). Our own design: a rounded core with a soft edge all round,
// reaching a little past the word on every side, so a word box a few units off never shows an edge.

import type { Rect } from '../ayahBounds';

/** A wash: a pill-shaped core at full strength, and a soft edge (`soft`, a blur radius) fading to nothing around it. */
export interface Wash {
  core: Rect;
  /** How far the soft edge reaches past the core, fading out (bounds units). */
  soft: number;
}

/** Of the box's height: the core sits this far in from its top and bottom… */
const INSET_Y = 0.2;
/** …and this far in from each end. */
const INSET_X = 0.08;
/** The soft edge, as a share of the box's height. */
const SOFT = 0.32;

/**
 * The wash for a highlight's box (a word's box grown a little: markHighlight, cursorBox, offBox). The core is the box's
 * middle, at least as wide as it is tall (a short word is a round blob); the soft edge reaches past the box on every
 * side (by about a tenth of its height above and below, a quarter at the ends), so the wash is wider than its word and
 * forgives a box that is a little off.
 */
export function washOf(box: Rect): Wash {
  const h = box.y1 - box.y0;
  const y0 = box.y0 + INSET_Y * h;
  const y1 = box.y1 - INSET_Y * h;
  const coreH = y1 - y0;
  const mid = (box.x0 + box.x1) / 2;
  const half = Math.max(coreH / 2, (box.x1 - box.x0) / 2 - INSET_X * h);
  return { core: { x0: mid - half, x1: mid + half, y0, y1 }, soft: SOFT * h };
}

/** How far a wash shows, its soft edge included. */
export function washReach(wash: Wash): Rect {
  const { core, soft } = wash;
  return { x0: core.x0 - soft, x1: core.x1 + soft, y0: core.y0 - soft, y1: core.y1 + soft };
}

/**
 * What follows the reciter on a page during a take (Majd, Nov 21 2026: no shades with the page shown): with the page
 * shown, only the quiet band on the line being recited (`band`, the cursor's word) and no word is washed; with it
 * hidden, no band, and the newest word shown (`newest`) has the grey wash, so the reciter sees where they are.
 */
export function followCues(hidden: boolean, cursor: number | null, newest: number | null): { band: number | null; word: number | null } {
  return hidden ? { band: null, word: newest } : { band: cursor, word: null };
}
