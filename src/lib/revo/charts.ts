// The small charts in Revo's answers. Revo only names the chart (and its pages); the phone
// draws it from the account's own data, so no figure in a chart is ever made up.

import type { RevisionLog } from '../../types';
import { shiftDay } from '../journal';

export type RatingBand = 'weak' | 'moderate' | 'strong';
export const bandOf = (rating: number): RatingBand => (rating <= 2 ? 'weak' : rating === 3 ? 'moderate' : 'strong');

/** Each page's ratings over the `days` up to `end`: where on the line (0–1) and how strong. */
export function pageRatingsData(
  logs: readonly RevisionLog[],
  pages: readonly number[],
  end: string,
  days = 31,
): { start: string; end: string; rows: { page: number; dots: { at: number; day: string; band: RatingBand }[] }[] } {
  const start = shiftDay(end, -(days - 1));
  const span = days - 1;
  const index = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  return {
    start,
    end,
    rows: pages.map((page) => ({
      page,
      dots: logs
        .filter((l) => l.date >= start && l.date <= end)
        .flatMap((l) => l.weaknessUpdates.filter((w) => w.page === page).map((w) => ({ day: l.date, band: bandOf(w.rating) })))
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((d) => ({ ...d, at: span > 0 ? index(d.day) / span : 0 })),
    })),
  };
}

/** Pages revised on each of the `days` up to `end`, oldest first. */
export function dailyPagesData(logs: readonly RevisionLog[], end: string, days: 7 | 30): { day: string; pages: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const day = shiftDay(end, i - (days - 1));
    return { day, pages: logs.filter((l) => l.date === day).reduce((n, l) => n + l.pagesRevised.length, 0) };
  });
}

/** "1 Oct". */
export function shortDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
