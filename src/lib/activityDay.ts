// The day Activity files a memorized page under (BEHAVIOUR ACT-1): the calendar
// date in the user's own time zone, with no Fajr shift. Memorized timestamps are
// coarse, so the boundary is not worth more than the date.

const MINUTE_MS = 60_000;

/** Offsets from UTC are tried in quarter hours, from UTC−12 to UTC+14. */
const OFFSET_STEP = 15;
const OFFSET_MIN = -12 * 60;
const OFFSET_MAX = 14 * 60;

/** The calendar date (YYYY-MM-DD) of `ms` in the zone `offsetMinutes` from UTC. */
export function localDayAt(ms: number, offsetMinutes: number): string {
  const d = new Date(ms + offsetMinutes * MINUTE_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The zone a user's sessions were written in: the offset under which the most
 * sessions' `createdAt` falls on their `date`. A session's date is the day the
 * app showed when it was made, so this is exact for a session made outside the
 * hours between midnight and Fajr. Ties take the middle of the tied offsets.
 * Null when there are no sessions.
 */
export function sessionOffsetMinutes(sessions: { date: string; createdAt: number }[]): number | null {
  if (sessions.length === 0) return null;
  let best = -1;
  let bestOffsets: number[] = [];
  for (let off = OFFSET_MIN; off <= OFFSET_MAX; off += OFFSET_STEP) {
    const matches = sessions.filter((s) => localDayAt(s.createdAt, off) === s.date).length;
    if (matches > best) {
      best = matches;
      bestOffsets = [off];
    } else if (matches === best) {
      bestOffsets.push(off);
    }
  }
  return bestOffsets[Math.floor((bestOffsets.length - 1) / 2)];
}
