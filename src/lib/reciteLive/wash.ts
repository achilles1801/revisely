// How Recite's highlights are drawn on a page (pure), in bounds space (1024 wide, as geometry.ts): a soft pastel wash
// behind the word, never a box (Majd, Nov 21 2026: Tarteel's shading "is way more elegant than ours and also seems like
// a blurb or splash which im guessing they did on purpose to avoid the mis shaded words … They dont even use shades when
// ur reciting with the page shown ie not hidden, which is actually really nice. I also like their color shades its like
// more pastel which is what we should aim for as well"). Our own design: a rounded core with a soft edge all round,
// reaching a little past the word on every side, so a word box a few units off never shows an edge.

import type { Rect } from '../ayahBounds';

/**
 * A wash: a pill-shaped core at full strength, and a soft edge fading to nothing around it: the core's colour spread
 * out by `spread`, then blurred over `soft` (a blur radius). The spread keeps the edge at about full strength where the
 * core ends, so the wash fades smoothly from its middle instead of showing the core as a pill with a glow around it.
 */
export interface Wash {
  core: Rect;
  /** How far the colour is spread past the core before it is blurred (bounds units). */
  spread: number;
  /** The blur radius of the edge, past the spread (bounds units). */
  soft: number;
}

/** Of the box's height: the core sits this far in from its top and bottom… */
const INSET_Y = 0.26;
/** …and this far in from each end. */
const INSET_X = 0.08;
/** The soft edge's blur, as a share of the box's height; the spread is half of it. */
const SOFT = 0.26;

/**
 * The wash for a highlight's box (a word's box grown a little: markHighlight, cursorBox, offBox). The core is the box's
 * middle, at least as wide as it is tall (a short word is a round blob); the soft edge reaches past the box on every
 * side (by about an eighth of its height above and below, nearly a third at the ends), so the wash is wider than its
 * word and forgives a box that is a little off.
 */
export function washOf(box: Rect): Wash {
  const h = box.y1 - box.y0;
  const y0 = box.y0 + INSET_Y * h;
  const y1 = box.y1 - INSET_Y * h;
  const coreH = y1 - y0;
  const mid = (box.x0 + box.x1) / 2;
  const half = Math.max(coreH / 2, (box.x1 - box.x0) / 2 - INSET_X * h);
  return { core: { x0: mid - half, x1: mid + half, y0, y1 }, spread: (SOFT / 2) * h, soft: SOFT * h };
}

/** How far a wash shows, its soft edge included. */
export function washReach(wash: Wash): Rect {
  const { core, spread, soft } = wash;
  const d = spread + soft;
  return { x0: core.x0 - d, x1: core.x1 + d, y0: core.y0 - d, y1: core.y1 + d };
}

/**
 * What follows the reciter on a page during a take: with the page shown, only the flat band behind the ayah being recited
 * (`band`, the cursor's word, whose ayah it is; Majd, Nov 21 and 22 2026: no shades with the page shown, the band as
 * Tarteel's); with it hidden, no band, and the newest
 * word shown (`newest`) in its own ink in the following colour (`ink`; Majd, Nov 22 2026, of Tarteel's hidden page: "i
 * dont see the words being a different color as its recited"), unless it carries a mark (`marked`): its wash says more.
 * The words recited before it are in the page's own ink. No word is washed to follow the reciter.
 */
export function followCues(
  hidden: boolean,
  cursor: number | null,
  newest: number | null,
  marked: (w: number) => boolean = () => false,
): { band: number | null; ink: number | null } {
  if (!hidden) return { band: cursor, ink: null };
  return { band: null, ink: newest != null && !marked(newest) ? newest : null };
}
