// Revo's sheet with the keyboard up (components/revo/RevoSheetFrame), kept apart so it can be
// tested without React Native.

/** Below the status bar, the sheet keeps this much of the screen above it. */
export const REVO_TOP_GAP = 8;
/** The sheet's bottom padding while it sits on the keyboard (the home indicator is under the keyboard). */
export const REVO_KEYBOARD_PAD = 8;

/**
 * The sheet's two heights, from the frame it sits in (the modal's root, measured with the keyboard
 * down) rather than the window: on Android the window React Native reports leaves the system bars
 * out (about 97pt on a Pixel), so a full sheet worked out from it stopped that much short of the top
 * with Home's header showing above it (Nov 7 2026). Until the frame is measured, the window.
 */
export function revoHeights(o: { window: number; frame: number; top: number; medium: number }): { full: number; medium: number; span: number } {
  const span = Math.max(o.window, o.frame);
  return { full: span - o.top - REVO_TOP_GAP, medium: Math.round(span * o.medium), span };
}

/**
 * Where the sheet goes with the keyboard up: it sits on the keyboard and gets shorter, so its header
 * and conversation stay on screen and only the composer rides up (before, the whole sheet was
 * pushed up and its top went off the screen). `keyboard` is how much of the frame the keyboard
 * covers: 0 when it's down, or when the window was already resized for it (Android).
 */
export function revoSheetFit(o: { frameHeight: number; top: number; keyboard: number; target: number }): { height: number; lift: number } {
  const room = Math.max(0, o.frameHeight - o.top - REVO_TOP_GAP - o.keyboard);
  return { height: Math.min(o.target, room), lift: o.keyboard };
}

/**
 * How much of the sheet's frame the keyboard covers. `baseFrame` is the frame's height with the
 * keyboard down: where the system resized the window for the keyboard (Android), that part is
 * already out of the way and only the rest is covered.
 */
export function keyboardCover(keyboardHeight: number, baseFrame: number, frame: number): number {
  return Math.max(0, keyboardHeight - Math.max(0, baseFrame - frame));
}

/**
 * The keyboard's height over the sheet, from what React Native reports. On Android that is the IME
 * less the navigation bar (ReactRootView), while the edge-to-edge sheet reaches down behind the bar,
 * so the bar's inset is added back (the composer sat behind the keyboard by that much, Nov 7); iOS's
 * height already includes the home indicator.
 */
export function keyboardOverSheet(reported: number, platform: string, bottomInset: number): number {
  return reported > 0 ? reported + (platform === 'android' ? bottomInset : 0) : 0;
}

/** Within this of the end, a list counts as showing it (a fraction of a line, for rounding and bounce). */
export const LIST_END_SLACK = 24;

/** Whether a list scrolled to `offset`, `height` tall, with `content` of content, shows its end. */
export function atListEnd(offset: number, height: number, content: number): boolean {
  return offset + height >= content - LIST_END_SLACK;
}
