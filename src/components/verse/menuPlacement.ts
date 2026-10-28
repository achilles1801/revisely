// Where the held verse's menu goes: next to the verse, not over it.
//
// Below the verse if it fits, else above it; a verse too tall for either
// (2:282 fills page 48) gets the menu beside the finger instead, on the side
// with more room. Always inside the safe area, clamped left and right.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Where it grows from, in the menu's own coordinates (towards the finger). */
  origin: { x: number; y: number };
  side: 'below' | 'above' | 'beside';
}

export const MENU_GAP = 8;
export const MENU_MARGIN = 12;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function placeMenu({
  menu,
  verse,
  point,
  screen,
  insets,
}: {
  menu: { width: number; height: number };
  /** The verse's lines on screen; null when unknown. */
  verse: Box | null;
  /** Where the finger pressed. */
  point: { x: number; y: number };
  screen: { width: number; height: number };
  insets: { top: number; bottom: number; left: number; right: number };
}): Placement {
  const minTop = insets.top + MENU_MARGIN;
  const maxBottom = screen.height - insets.bottom - MENU_MARGIN;
  const minLeft = insets.left + MENU_MARGIN;
  const maxLeft = Math.max(minLeft, screen.width - insets.right - MENU_MARGIN - menu.width);
  const left = clamp(point.x - menu.width / 2, minLeft, maxLeft);
  const originX = clamp(point.x - left, 0, menu.width);

  if (verse) {
    const below = verse.y + verse.height + MENU_GAP;
    if (below + menu.height <= maxBottom) {
      return { left, top: below, origin: { x: originX, y: 0 }, side: 'below' };
    }
    const above = verse.y - MENU_GAP - menu.height;
    if (above >= minTop) {
      return { left, top: above, origin: { x: originX, y: menu.height }, side: 'above' };
    }
  }

  // Beside the finger, where there is more room; never off screen.
  const roomBelow = maxBottom - point.y;
  const roomAbove = point.y - minTop;
  const wanted = roomBelow >= roomAbove ? point.y + MENU_GAP * 3 : point.y - MENU_GAP * 3 - menu.height;
  const top = clamp(wanted, minTop, Math.max(minTop, maxBottom - menu.height));
  return { left, top, origin: { x: originX, y: clamp(point.y - top, 0, menu.height) }, side: 'beside' };
}

/** The smallest box around a verse's line rectangles. */
export function unionBox(rects: { x: number; y: number; width: number; height: number }[]): Box | null {
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.width));
  const y1 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
