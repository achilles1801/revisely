// Placement of the menu that opens on a held verse.

import { spacing } from '../theme/spacing';

export const MENU_WIDTH = 250;
export const MENU_HEIGHT = 112;
const GAP = 16;

/**
 * Where to put the menu for a press at `point`: beside it, kept on screen.
 * `height` is the menu's measured height (large text makes it taller).
 */
export function menuPosition(
  point: { x: number; y: number },
  screen: { width: number; height: number },
  insetTop = 60,
  insetBottom = 40,
  height = MENU_HEIGHT,
): { left: number; top: number } {
  const left = Math.min(Math.max(point.x - MENU_WIDTH / 2, spacing.md), screen.width - MENU_WIDTH - spacing.md);
  const below = point.y + GAP;
  const above = point.y - GAP - height;
  const lowest = screen.height - insetBottom - height;
  const top =
    below <= lowest
      ? below
      : above >= insetTop
        ? above
        : // Neither side has room: as low as it fits, never above the top inset.
          Math.max(insetTop, lowest);
  return { left, top };
}

