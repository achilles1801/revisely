// The parts of Activity's day view that are figures, not layout (mock d1, C4 parity):
// the page strip's cells, the strength counts and the window footer's text.
// Strength mapping is an assumption until Majd decides (NOTE open point, "weak / okay /
// strong" vs "weak / moderate / strong"): 1–2 weak, 3 moderate, 4–5 strong.

export type CellState = 'revised' | 'skipped' | 'not-reached';

export interface StripCell {
  page: number;
  state: CellState;
  weak: boolean;
}

/** One cell per assigned page, in order: revised, skipped (hollow), or not reached. */
export function stripCells(assigned: number[], revised: number[], skipped: number[], weak: Set<number>): StripCell[] {
  const done = new Set(revised);
  const missed = new Set(skipped);
  return assigned.map((page) => ({
    page,
    state: done.has(page) ? 'revised' : missed.has(page) ? 'skipped' : 'not-reached',
    weak: weak.has(page),
  }));
}

export type Strength = 'weak' | 'moderate' | 'strong';

export function strengthOf(rating: number): Strength {
  if (rating <= 2) return 'weak';
  if (rating === 3) return 'moderate';
  return 'strong';
}

/** The counts for the revised pages, by their current rating (unrated pages count as strong). */
export function strengthCounts(revised: number[], ratingOf: (page: number) => number | undefined): Record<Strength, number> {
  const out: Record<Strength, number> = { weak: 0, moderate: 0, strong: 0 };
  for (const p of new Set(revised)) out[strengthOf(ratingOf(p) ?? 4)] += 1;
  return out;
}


/** What the strip shows, in words: "18 revised · 2 skipped" ("· 4 not reached"); parts with none left out. */
export function stripSummary(cells: StripCell[]): string {
  const n = (state: CellState) => cells.filter((c) => c.state === state).length;
  return [
    n('revised') > 0 ? `${n('revised')} revised` : null,
    n('skipped') > 0 ? `${n('skipped')} skipped` : null,
    n('not-reached') > 0 ? `${n('not-reached')} not reached` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
