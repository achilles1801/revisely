// Placement of the menu that opens on a held verse.

import { spacing } from '../theme/spacing';

export const MENU_WIDTH = 250;
export const MENU_HEIGHT = 112;
const GAP = 16;

/** Where to put the menu for a press at `point`: beside it, kept on screen. */
export function menuPosition(
  point: { x: number; y: number },
  screen: { width: number; height: number },
  insetTop = 60,
  insetBottom = 40,
): { left: number; top: number } {
  const left = Math.min(Math.max(point.x - MENU_WIDTH / 2, spacing.md), screen.width - MENU_WIDTH - spacing.md);
  const below = point.y + GAP;
  const top =
    below + MENU_HEIGHT <= screen.height - insetBottom
      ? below
      : Math.max(insetTop, point.y - GAP - MENU_HEIGHT);
  return { left, top };
}

