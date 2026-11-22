// After Stop, how far the bar's progress line is while the checker's final answer comes (Revisely Dev, RECITE-25).
//
// Majd, Nov 22 2026: "if it genuinely takes 4-5 seconds for the summary to be rdy then shouldn't we show that with maybe
// a bar or something". The checker sends nothing between the app's `end` and its `done`, so the line is an estimate:
// it fills to most of the way by the time the answer is expected, then creeps until Stop's budget, when the take's
// result shows whatever the checker has done (RECITE-11). It never reaches the end before the answer, and never goes
// back. A wait shorter than SHOW_AFTER_MS shows nothing.

/** A wait shorter than this shows no line (ms): most short takes are answered within it. */
export const SHOW_AFTER_MS = 800;
/** How far the line is when the answer is expected. */
export const EXPECTED_AT = 0.85;
/** The furthest the line goes before the answer comes. */
export const HOLD_AT = 0.95;
/** Once the answer is in, the line fills (ms), then fades (ms). */
export const FILL_MS = 180;
export const FADE_MS = 250;

/** One stretch of the line's way: to `to`, over `ms`, easing out (fast, then slower) or at an even pace. */
export interface CheckingSegment {
  to: number;
  ms: number;
  ease: 'out' | 'linear';
}

/** Room left at the end of the budget for the creep after the expected time (ms). */
const CREEP_MIN_MS = 500;

/**
 * The line's way from Stop: most of it by the time the answer is expected (`expectedMs`), the rest of its room by the
 * budget (`budgetMs`). An expectation past the budget is brought inside it, so the line always moves until the result.
 */
export function checkingSegments(expectedMs: number, budgetMs: number): CheckingSegment[] {
  const budget = Math.max(budgetMs, CREEP_MIN_MS * 2);
  const expected = Math.min(Math.max(expectedMs, SHOW_AFTER_MS), budget - CREEP_MIN_MS);
  return [
    { to: EXPECTED_AT, ms: expected, ease: 'out' },
    { to: HOLD_AT, ms: budget - expected, ease: 'linear' },
  ];
}

/** How far the line is `ms` after Stop, along `segments` (0 at Stop; never past HOLD_AT). */
export function progressAt(segments: CheckingSegment[], ms: number): number {
  let from = 0;
  let left = Math.max(0, ms);
  for (const s of segments) {
    if (left < s.ms) {
      const x = s.ms > 0 ? left / s.ms : 1;
      const eased = s.ease === 'out' ? 1 - (1 - x) * (1 - x) : x;
      return from + (s.to - from) * eased;
    }
    left -= s.ms;
    from = s.to;
  }
  return from;
}

/** The final pass's time with nothing to check (ms), and what each second of the take and each mark adds. */
const CHECK_BASE_MS = 1200;
const CHECK_MS_PER_SEC = 15;
const CHECK_MS_PER_MARK = 80;

/**
 * When the final answer is expected (ms from Stop), from the take's length (seconds heard) and the marks it has: the
 * final pass reads the whole take again, and each mark found is looked at again (the checker's numbers, Nov 22 2026).
 */
export function expectedCheckMs(secs: number, marks: number): number {
  return Math.round(CHECK_BASE_MS + CHECK_MS_PER_SEC * Math.max(0, secs) + CHECK_MS_PER_MARK * Math.max(0, marks));
}
