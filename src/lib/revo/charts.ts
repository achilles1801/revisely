// The small charts in Revo's answers. Revo only names the chart (and its pages); the phone
// draws it from the account's own data, so no figure in a chart is ever made up.
//
// Each chart answers a touch (Majd, Nov 7 2026: "interactive for the user not just a static
// image"). A tapped mark's words come from here: the readout that replaces the chart's two header
// lines, and the panel under it (mocks: ~/Documents/revisely-today-mocks/revo/charts).

import type { RevisionLog, UserPage } from '../../types';
import { reviewedOn } from '../aheadCredit';
import { formatDayLong, formatMinutesLong } from '../activityFormat';
import { shiftDay } from '../journal';
import { describePassage, firstVerseOfPage, lastVerseOfPage, pagesNote, surahName } from '../passages';
import type { FactSources } from './facts';
import type { RevoChart, RevoDayFacts } from './types';
import { passageShort } from './words';

export type RatingBand = 'weak' | 'moderate' | 'strong';
export const bandOf = (rating: number): RatingBand => (rating <= 2 ? 'weak' : rating === 3 ? 'moderate' : 'strong');

/** How far back the ratings chart looks. */
export const RATING_DAYS = 31;

/**
 * A chart this app knows how to draw. A newer server's kind (or a malformed one) draws nothing:
 * the answer's words still show. Before this, an unknown kind fell through to an empty bar chart.
 */
export function knownChart(c: RevoChart | null | undefined): c is RevoChart {
  if (!c || typeof c.title !== 'string') return false;
  if (c.kind === 'pageRatings') return Array.isArray(c.pages) && c.pages.length > 0 && c.pages.every((p) => Number.isInteger(p) && p >= 1 && p <= 604);
  if (c.kind === 'dailyPages') return c.days === 7 || c.days === 30;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/** "once", "twice", "3 times". */
export const timesWord = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** "today", "yesterday", "4 days ago". */
export function agoWords(day: string, today: string): string {
  const n = daysBetween(day, today);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}

/** "30 October". */
export function dayMonth(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'long' })}`;
}

/** "1 Oct". */
export function shortDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The surah a run of pages starts in, and the one it ends in: a strip's two end labels. */
export function stripEnds(pages: readonly number[]): { first: string | null; last: string | null } {
  if (pages.length === 0) return { first: null, last: null };
  const first = surahName(firstVerseOfPage(Math.min(...pages)).sura);
  const last = surahName(lastVerseOfPage(Math.max(...pages)).sura);
  return { first, last: last === first ? null : last };
}

// ---------------------------------------------------------------------------------------------
// Pages per day
// ---------------------------------------------------------------------------------------------

export interface DayBar {
  day: string;
  /** Pages revised on the day, counted as Revo's week counts them (lib/revo/context). */
  pages: number;
  /** Pages the plan had for it (0 when unknown). */
  planned: number;
}

/** Pages revised on each of the `days` up to `end`, oldest first, with what the plan had for each. */
export function dailyPagesData(logs: readonly RevisionLog[], end: string, days: 7 | 30, planned?: (day: string) => number): DayBar[] {
  return Array.from({ length: days }, (_, i) => {
    const day = shiftDay(end, i - (days - 1));
    return { day, pages: reviewedOn(logs, day).size, planned: planned ? planned(day) : 0 };
  });
}

/** The pages planned for a day, as Revo's week says them: today Home's own pages, earlier days the streak's. */
export function plannedOf(src: FactSources): (day: string) => number {
  return (day) => (day === src.snapshot.day ? src.snapshot.own.length : new Set(src.snapshot.streak.scheduled(day)).size);
}

/** Each page's rating on `day`: the last one its sessions gave (1–5). */
export function ratingsOn(logs: readonly RevisionLog[], day: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const l of logs) if (l.date === day) for (const w of l.weaknessUpdates) out.set(w.page, Math.max(1, Math.min(5, Math.round(w.rating))));
  return out;
}

export interface DayDetail {
  /** The readout: "Monday 2 November", "Done · 20 of 20 pages · 31 min" ("12 of 20 pages · 8 caught up later"). */
  title: string;
  line: string;
  /** The passage revised ("Adh-Dhariyat 31 to Al-Hadid · Juz 27"), or planned when nothing was. */
  passage: string | null;
  planned: boolean;
  /** The pages revised, in order, with the rating each got that day (null: not rated). */
  strip: { page: number; band: RatingBand | null }[];
  first: string | null;
  last: string | null;
  counts: Record<RatingBand, number>;
}

/**
 * A tapped day. `facts` is what Revo's attachments say for it (lib/revo/facts dayFacts): its plan,
 * minutes and outcome. `planPages`: its plan's pages, named when nothing was revised.
 */
export function dayDetail(bar: DayBar, today: string, logs: readonly RevisionLog[], facts: RevoDayFacts | null, planPages: readonly number[] = []): DayDetail {
  // How the plan went (as the streak counts it), then what else its sessions did, then the time.
  const parts: string[] = [];
  const plan = facts?.plan ?? null;
  if (plan) {
    if (plan.done) parts.push('Done');
    parts.push(`${plan.pages - plan.notDone} of ${plural(plan.pages, 'page')}`);
    if (plan.late > 0) parts.push(`${plan.late} caught up later`);
  } else {
    parts.push(bar.pages > 0 ? `${plural(bar.pages, 'page')} revised` : 'Nothing revised');
  }
  if (facts && facts.revised.forEarlier > 0) parts.push(`${facts.revised.forEarlier} from earlier days`);
  if (facts && facts.revised.forLater > 0) parts.push(`${facts.revised.forLater} ahead`);
  if (facts?.minutes) parts.push(formatMinutesLong(facts.minutes));

  const revised = [...reviewedOn(logs, bar.day)].sort((a, b) => a - b);
  const ratings = ratingsOn(logs, bar.day);
  const strip = revised.map((page) => {
    const r = ratings.get(page);
    return { page, band: r == null ? null : bandOf(r) };
  });
  const counts: Record<RatingBand, number> = { weak: 0, moderate: 0, strong: 0 };
  for (const s of strip) if (s.band) counts[s.band]++;
  const planned = revised.length === 0 && planPages.length > 0;
  const named = revised.length > 0 ? revised : planned ? planPages : [];
  const ends = stripEnds(revised);
  return {
    title: bar.day === today ? 'Today' : formatDayLong(bar.day),
    line: parts.join(' · '),
    passage: named.length > 0 ? describePassage(named, { juz: true }) : null,
    planned,
    strip,
    first: ends.first,
    last: ends.last,
    counts,
  };
}

// ---------------------------------------------------------------------------------------------
// Page ratings
// ---------------------------------------------------------------------------------------------

export interface RatingDot {
  at: number;
  day: string;
  band: RatingBand;
}

/** Each page's ratings over the `days` up to `end`: where on the line (0–1) and how strong. */
export function pageRatingsData(
  logs: readonly RevisionLog[],
  pages: readonly number[],
  end: string,
  days = RATING_DAYS,
): { start: string; end: string; rows: { page: number; dots: RatingDot[] }[] } {
  const start = shiftDay(end, -(days - 1));
  const span = days - 1;
  const index = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
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

/** The last day before `day` the page was revised in a session, or null. */
export function revisedBefore(logs: readonly RevisionLog[], page: number, day: string): string | null {
  let best: string | null = null;
  for (const l of logs) {
    if (l.date >= day || (best != null && l.date <= best)) continue;
    if (l.pagesRevised.includes(page) || Object.values(l.ahead ?? {}).some((p) => p.includes(page))) best = l.date;
  }
  return best;
}

/** A tapped row: "End of Al-Hashr · weak now", "3 ratings in 31 days". */
export function ratingsRowReadout(page: number, dots: readonly RatingDot[], userPage: UserPage | undefined): { title: string; line: string } {
  const now = userPage && userPage.lastRevisedDate ? bandOf(userPage.weaknessRating) : null;
  return {
    title: `${passageShort([page])}${now ? ` · ${now} now` : ''}`,
    line: dots.length > 0 ? `${plural(dots.length, 'rating')} in ${RATING_DAYS} days` : `No ratings in ${RATING_DAYS} days`,
  };
}

/** A tapped dot: "End of Al-Hashr · weak", "30 October, 14 days after the time before". */
export function ratingsDotReadout(page: number, dot: RatingDot, before: string | null): { title: string; line: string } {
  const gap = before ? daysBetween(before, dot.day) : null;
  return {
    title: `${passageShort([page])} · ${dot.band}`,
    line: `${dayMonth(dot.day)}${gap != null && gap > 0 ? `, ${plural(gap, 'day')} after the time before` : ''}`,
  };
}

/** The panel for a passage: "Al-Hashr, ayahs 17–24 · Juz 28", "p. 548", "Weak now · rated weak twice in 31 days · revised 4 days ago". */
export function pageDetail(page: number, userPage: UserPage | undefined, dots: readonly RatingDot[], today: string): { title: string; note: string; meta: string } {
  const parts: string[] = [];
  if (userPage?.lastRevisedDate) {
    const now = bandOf(userPage.weaknessRating);
    parts.push(`${now[0].toUpperCase()}${now.slice(1)} now`);
  }
  const weak = dots.filter((d) => d.band === 'weak').length;
  if (weak > 0) parts.push(`rated weak ${timesWord(weak)} in ${RATING_DAYS} days`);
  parts.push(userPage?.lastRevisedDate ? `revised ${agoWords(userPage.lastRevisedDate, today)}` : 'not revised yet');
  return { title: describePassage([page], { juz: true }), note: pagesNote([page]), meta: parts.join(' · ') };
}

// ---------------------------------------------------------------------------------------------
// Touch
// ---------------------------------------------------------------------------------------------

/** The slot under `x` when `count` equal slots fill `width`. */
export function slotAt(x: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor((x / width) * count)));
}

/** The next mark when VoiceOver steps (up +1, down −1) from `current`, or the first. */
export function stepIndex(current: number | null, by: 1 | -1, count: number): number | null {
  if (count === 0) return null;
  if (current == null) return by === 1 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, current + by));
}
