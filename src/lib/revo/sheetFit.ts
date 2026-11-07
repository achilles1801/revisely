// Revo's sheet with the keyboard up (components/revo/RevoSheetFrame), kept apart so it can be
// tested without React Native.

/** Below the status bar, the sheet keeps this much of the screen above it. */
export const REVO_TOP_GAP = 8;
/** The sheet's bottom padding while it sits on the keyboard (the home indicator is under the keyboard). */
export const REVO_KEYBOARD_PAD = 8;

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
