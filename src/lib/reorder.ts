// Drag to reorder and swipe to delete, for a list of rows of one height (the
// schedule's days). Pure functions; the 'worklet' ones also run on the UI
// thread inside the gestures, and as plain functions in tests.

/** The slot a row dragged to `top` (its top edge, in list coordinates) lands in. */
export function slotAt(top: number, rowHeight: number, count: number): number {
  'worklet';
  if (count <= 0 || rowHeight <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(top / rowHeight)));
}

/**
 * Slots (row id → position) after moving `id` to `to`: the rows in between
 * close up behind it or make room in front of it.
 */
export function moveSlot(
  slots: Record<string, number>,
  id: string,
  to: number,
): Record<string, number> {
  'worklet';
  const from = slots[id];
  if (from === undefined || from === to) return slots;
  const next: Record<string, number> = {};
  for (const key of Object.keys(slots)) {
    const s = slots[key];
    if (key === id) next[key] = to;
    else if (from < to && s > from && s <= to) next[key] = s - 1;
    else if (from > to && s >= to && s < from) next[key] = s + 1;
    else next[key] = s;
  }
  return next;
}

/**
 * Points to scroll this frame while a row is dragged near the top (negative)
 * or bottom (positive) edge of the visible area; faster the deeper in.
 */
export function autoScrollStep(
  fingerY: number,
  viewTop: number,
  viewBottom: number,
  edge = 72,
  maxStep = 14,
): number {
  'worklet';
  if (viewBottom - viewTop < edge * 2) return 0;
  const intoTop = viewTop + edge - fingerY;
  if (intoTop > 0) return -maxStep * Math.min(1, intoTop / edge);
  const intoBottom = fingerY - (viewBottom - edge);
  if (intoBottom > 0) return maxStep * Math.min(1, intoBottom / edge);
  return 0;
}

/** A swipe past this share of the row deletes on release (a "full swipe"). */
export const FULL_SWIPE = 0.5;

export type SwipeOutcome = 'delete' | 'open' | 'close';

/**
 * Where a swipe to the left ends up, from how far it went (`x`, negative) and
 * how fast it was going: past half the row it deletes; past half the Delete
 * button, or flung left, it stays open on the button; flung right, or short of
 * that, it closes.
 */
export function swipeOutcome(
  x: number,
  velocityX: number,
  rowWidth: number,
  actionWidth: number,
): SwipeOutcome {
  'worklet';
  const dist = -x;
  if (rowWidth > 0 && dist >= rowWidth * FULL_SWIPE) return 'delete';
  if (velocityX > 400) return 'close';
  if (velocityX < -400 || dist >= actionWidth / 2) return dist > 0 ? 'open' : 'close';
  return 'close';
}

const sameDay = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Row identities after the days changed from outside the list (Add Rest Day,
 * Undo, a day edited, a plan loaded). One day added or removed keeps every
 * other row's key, so the rest slide into place; the same number of days
 * keeps them all (only what's on a day changed); anything else starts afresh.
 */
export function reconcileKeys(
  keys: string[],
  prev: number[][],
  next: number[][],
  makeKey: () => string,
): string[] {
  if (keys.length !== prev.length) return next.map(() => makeKey());
  if (next.length === prev.length) return keys;
  if (next.length === prev.length + 1) {
    let k = 0;
    while (k < prev.length && sameDay(prev[k], next[k])) k++;
    for (let i = k; i < prev.length; i++) {
      if (!sameDay(prev[i], next[i + 1])) return next.map(() => makeKey());
    }
    return [...keys.slice(0, k), makeKey(), ...keys.slice(k)];
  }
  if (next.length === prev.length - 1) {
    let k = 0;
    while (k < next.length && sameDay(prev[k], next[k])) k++;
    for (let i = k; i < next.length; i++) {
      if (!sameDay(prev[i + 1], next[i])) return next.map(() => makeKey());
    }
    return [...keys.slice(0, k), ...keys.slice(k + 1)];
  }
  return next.map(() => makeKey());
}

/** Move one entry of a list (keys alongside the days they name). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}
