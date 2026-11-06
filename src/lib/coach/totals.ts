// What the Ask coach is sent (C6): only the totals for the asked insight, as numbers. The server
// checks the same field names (functions/src/coach/prompt.ts INSIGHT_FIELDS); it refuses any other.
// No notes, recordings, names or page lists ever go.

export type CoachInsight = 'coverage' | 'consistency' | 'weakSpots' | 'pace';

export const COACH_FIELDS: Record<CoachInsight, readonly string[]> = {
  coverage: ['memorizedPages', 'revisedWithin7Days', 'revisedWithin30Days'],
  consistency: ['daysWithSession30', 'streakDays', 'sessions30'],
  weakSpots: ['weakPages', 'moderatePages', 'strongPages', 'weakRevisedLast7Days'],
  pace: ['pagesPerDay7', 'pagesPerDay30', 'plannedPerDay'],
};

/** Every total the app can compute, by name. */
export type CoachTotalsSource = Record<string, number>;

/** The payload for one insight: its fields only, rounded to what the coach needs (whole pages, a tenth of a page a day). */
export function coachTotals(insight: CoachInsight, source: CoachTotalsSource): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of COACH_FIELDS[insight]) {
    const v = source[f];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`missing total ${f}`);
    out[f] = f.startsWith('pagesPerDay') ? Math.round(v * 10) / 10 : Math.round(v);
  }
  return out;
}
