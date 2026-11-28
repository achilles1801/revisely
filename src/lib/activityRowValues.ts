// What each row of the one Activity tab shows at its end (ACT-35): its figure and a few words after it, short enough to
// stay on one line on an SE-wide screen at the largest text the row allows (ACT-37; Majd, Nov 27 2026: "the consistency
// text on the right ... is too much and starts to break the formatting -- this should never happen for any of them").
// The longer story (since when, after how long a gap) is the row's grey line or its section's own page.
// src/components/activity/__tests__/rowValuesFit.test.tsx measures every value these give.

import { formatPercentage, t } from '../i18n';
import { formatAccuracy } from './reciteLive/score';
import { formatPace } from './insightsView';
import { NATURAL_FROM_DAYS, RED_FROM_DAYS } from './insightsGaps';

export interface RowValue {
  /** The number or word in bold ("91%", "7", "Today"). */
  figure: string;
  /** Its words after it ("of 7 days"), or none. */
  unit: string | null;
  /** The figure in red (Gaps: days away from 3). */
  red?: boolean;
}

/** Coverage: the share of what's memorized revised in the range ("91%"), or at All time the cycles ("3.1 cycles"). */
export function coverageRow(pct: number, cycles: string | null): RowValue {
  return cycles ? { figure: cycles, unit: t('activity.oneTab.cycles', { count: Number(cycles) }) } : { figure: formatPercentage(pct), unit: null };
}

/** Consistency: the days revised or read of the days counted ("7" "of 7 days"); since when is on its page. */
export function consistencyRow(done: number, of: number): RowValue {
  return { figure: String(done), unit: t('activity.oneTab.ofDays', { count: of }) };
}

/**
 * Gaps: revised today ("Today" "revised"), else how long since the last revision, in whole days under 2 weeks, then
 * weeks, months or years ("6" "days away", "3" "weeks away"); red from 3 days and under 2 weeks, as the section's own
 * figure is.
 */
export function gapsRow(sinceLast: number): RowValue {
  if (sinceLast <= 0) return { figure: t('insights.gaps.today'), unit: t('activity.oneTab.revisedToday') };
  const red = sinceLast >= RED_FROM_DAYS && sinceLast < NATURAL_FROM_DAYS;
  if (sinceLast < NATURAL_FROM_DAYS) return { figure: String(sinceLast), unit: t('activity.oneTab.daysAway', { count: sinceLast }), red };
  if (sinceLast < 42) {
    const weeks = Math.floor(sinceLast / 7);
    return { figure: String(weeks), unit: t('activity.oneTab.weeksAway', { count: weeks }) };
  }
  if (sinceLast < 365) {
    const months = Math.max(1, Math.floor(sinceLast / 30.44));
    return { figure: String(months), unit: t('activity.oneTab.monthsAway', { count: months }) };
  }
  const years = Math.floor(sinceLast / 365);
  return { figure: String(years), unit: t('activity.oneTab.yearsAway', { count: years }) };
}

/** Weak spots and Memorization: pages ("12 pages"). */
export function pagesRow(pages: number): RowValue {
  return { figure: String(pages), unit: t('activity.insights.pagesWord', { count: pages }) };
}

/** Pace: minutes a page ("1.8" "min a page"). */
export function paceRow(minutesPerPage: number): RowValue {
  return { figure: formatPace(minutesPerPage), unit: t('activity.insights.minAPage') };
}

/** Recitation: the score by the page ("98.8%"), or nothing before a take has one. */
export function recitationRow(score: number | null): RowValue | null {
  return score === null ? null : { figure: formatAccuracy(score), unit: null };
}

/**
 * Above the usual text size a row's words go under its figure (ACT-37): xLarge (iOS 1.12, Android 1.15) and up. Side by
 * side they fit half the row at the usual size, and stacked up to the row's largest (CHROME_MAX_SCALE).
 */
export const ROW_STACK_AT = 1.05;
