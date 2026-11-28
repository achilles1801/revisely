// What Insights' own pages add to their sections (Revisely Dev; Majd, Nov 27 2026: "yes build all seven screens", boards in
// ~/Documents/revisely-today-mocks/insights-v2/). Each page starts from its point, then a figure with its trend against the
// same length of days before the range, then what to do about it. Pure: the screen passes the data in.
// Days are YYYY-MM-DD revision days, as in lib/insightsView.

import type { JuzTile } from './insightsView';
import { t } from '../i18n';

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

// ── Coverage (ACT-38) ────────────────────────────────────────────────────

/**
 * Coverage over the same length of days just before the range: of the pages memorized then (those memorized now, less
 * any memorized during the range), how many were revised in it. Null when the account is younger than both spans
 * together (the days before weren't all on record) or nothing was memorized then.
 */
export function coverageBefore(input: {
  memorized: Set<number>;
  revised: { day?: string; countsFor: string; pages: number[] }[];
  memorizations: { day: string; pages: number[] }[];
  today: string;
  window: number;
  firstDay?: string | null;
}): { revised: number; of: number } | null {
  const { memorized, revised, memorizations, today, window, firstDay } = input;
  if (!firstDay || daysBetween(firstDay.slice(0, 10), today) < 2 * window - 1) return null;
  // A page memorized during the range wasn't memorized in the days before it.
  const lately = new Set<number>();
  for (const m of memorizations) {
    const since = daysBetween(m.day, today);
    if (since >= 0 && since < window) for (const p of m.pages) lately.add(p);
  }
  const then = new Set([...memorized].filter((p) => !lately.has(p)));
  if (then.size === 0) return null;
  const done = new Set<number>();
  for (const r of revised) {
    const since = daysBetween(r.day ?? r.countsFor, today);
    if (since < window || since >= 2 * window) continue;
    for (const p of r.pages) if (then.has(p)) done.add(p);
  }
  return { revised: done.size, of: then.size };
}

/**
 * The juz slipping out of rotation (ACT-38): those over 30 days since their least recently revised page (ACT-4's stale
 * juz, never revised in the 30+ days on record included), and longer than the plan takes to go round when that is known.
 * The two left longest, longest first: the line names them and Plan them plans them.
 */
export function slippingJuz(tiles: JuzTile[], cycleDays?: number | null): JuzTile[] {
  const age = (tile: JuzTile) => tile.daysSince ?? Number.POSITIVE_INFINITY;
  return tiles
    .filter((tile) => tile.state === 'stale' && (cycleDays == null || age(tile) > cycleDays))
    .sort((a, b) => age(b) - age(a) || a.juz - b.juz)
    .slice(0, 2);
}

/** The line's words: "Juz 4 and Juz 5 are slipping out of rotation" over "Last revised 41 and 33 days ago; your plan goes round every 15 days." */
export function slippingWords(juz: JuzTile[], cycleDays?: number | null): { title: string; detail: string } {
  const [a, b] = juz;
  const title = b ? t('activity.insights.slippingTwo', { a: a.juz, b: b.juz }) : t('activity.insights.slippingOne', { juz: a.juz });
  const ages = !b
    ? a.daysSince == null
      ? t('activity.insights.neverRevised')
      : t('activity.insights.lastRevisedAgo', { count: a.daysSince })
    : a.daysSince != null && b.daysSince != null
      ? t('activity.insights.lastRevisedAgoTwo', { a: a.daysSince, b: b.daysSince })
      : [a, b]
          .map((tile) =>
            tile.daysSince == null ? t('activity.insights.juzNeverRevised', { juz: tile.juz }) : t('activity.insights.juzDaysAgo', { juz: tile.juz, count: tile.daysSince }),
          )
          .join(' · ');
  const detail = cycleDays != null && cycleDays > 0 ? t('activity.insights.slippingPlan', { ages, count: cycleDays }) : t('activity.insights.slippingAges', { ages });
  return { title, detail };
}
