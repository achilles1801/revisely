/**
 * Where a list scrolls to so a block's buttons sit above the keyboard, once, as it opens: the daily log's
 * composer, whose Save was under the keyboard on an iPhone SE while a note was edited (Nov 16 2026).
 *
 * Everything is in window points. The list moves up by what the keyboard covers of the target, plus a
 * margin, but never so far that the block's top passes the list's top: the field being typed in matters
 * more, and the screen's Done puts the keyboard away. Null when nothing needs to move.
 */
export function revealAboveKeyboard(o: {
  /** The list's scroll offset now. */
  offset: number;
  /** The bottom of what must show (the composer's buttons). */
  targetBottom: number;
  /** The top of the block it belongs to (the composer), which stays in the list. */
  blockTop: number;
  /** The top of the list on screen. */
  listTop: number;
  /** Where the keyboard starts. */
  keyboardTop: number;
  margin?: number;
}): number | null {
  const margin = o.margin ?? 12;
  const covered = o.targetBottom + margin - o.keyboardTop;
  if (covered <= 0) return null;
  const by = Math.min(covered, Math.max(0, o.blockTop - o.listTop));
  return by > 0 ? o.offset + by : null;
}
