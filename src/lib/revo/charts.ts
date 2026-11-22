// The small charts in Revo's answers. Revo only names the chart (and its pages); the phone
// draws it from the account's own data, so no figure in a chart is ever made up.
//
// Each chart answers a touch (Majd, Nov 7 2026: "interactive for the user not just a static
// image"). A tapped mark's words come from here: the readout that replaces the chart's two header
// lines, and the panel under it (mocks: ~/Documents/revisely-today-mocks/revo/charts).

import type { RevisionLog, UserPage } from '../../types';
import { reviewedOn } from '../aheadCredit';
import { formatDayLong, formatMinutesLong } from '../activityFormat';
import { weekStart } from '../activityHeatmap';
import { lastRevisedByPage } from '../activityInsights';
import { juzTiles, memorizationMonths, monthName, type JuzTile } from '../insightsView';
import { ayahsOfPages } from '../ayahKeys';
import { shiftDay } from '../journal';
import { describeAyahs, describePageRange, describePassage, firstVerseOfPage, lastVerseOfPage, NBSP, pagesNote, surahName } from '../passages';
import { getJuzRange, getSurah } from '../quranData';
import { revisedItems } from './context';
import type { FactSources } from './facts';
import type { RevoDayFacts, RevoPassageFacts, RevoTableColumn, RevoVisual } from './types';
import { passageShort } from './words';
import { coverageSince, daysSince, lastRevisedWords, recencyLine as recencyWords, timesWord } from '../recency';
import { currentLanguage, dayMonth as dayMonthOf, formatDate, formatNumber, monthName as monthNameOf, t, weekdayName } from '../../i18n';

export { timesWord };

export type RatingBand = 'weak' | 'moderate' | 'strong';
export const bandOf = (rating: number): RatingBand => (rating <= 2 ? 'weak' : rating === 3 ? 'moderate' : 'strong');

/** How far back the ratings chart looks. */
export const RATING_DAYS = 31;

/**
 * A chart this app knows how to draw. A newer server's kind (or a malformed one) draws nothing:
 * the answer's words still show. Before this, an unknown kind fell through to an empty bar chart.
 */
export function knownChart(c: RevoVisual | null | undefined): c is RevoVisual {
  if (!c || typeof c.title !== 'string') return false;
  if (c.kind === 'pageRatings') return Array.isArray(c.pages) && c.pages.length > 0 && c.pages.every((p) => Number.isInteger(p) && p >= 1 && p <= 604);
  if (c.kind === 'dailyPages') return c.days === 7 || c.days === 30;
  if (c.kind === 'juzMap') return true;
  if (c.kind === 'timeline') {
    const one = (c.surah == null) !== (c.juz == null);
    const inRange = c.surah != null ? Number.isInteger(c.surah) && c.surah >= 1 && c.surah <= 114 : Number.isInteger(c.juz) && c.juz! >= 1 && c.juz! <= 30;
    return one && inRange && (c.days === 30 || c.days === 90 || c.days === 365);
  }
  if (c.kind === 'weeks') return Number.isInteger(c.weeks) && c.weeks >= 4 && c.weeks <= 12;
  if (c.kind === 'table') {
    const rows = c.juz ?? c.surahs;
    const max = c.juz ? 30 : 114;
    const one = (c.juz == null) !== (c.surahs == null);
    const rowsOk = Array.isArray(rows) && rows.length >= 2 && rows.length <= 8 && rows.every((n) => Number.isInteger(n) && n >= 1 && n <= max);
    const colsOk = Array.isArray(c.columns) && c.columns.length >= 1 && c.columns.length <= 3 && c.columns.every((k) => k in TABLE_HEADS);
    return one && rowsOk && colsOk;
  }
  if (c.kind === 'memorized') return c.months === 6 || c.months === 12;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

/** A rating band's word: "weak", "moderate", "strong". */
const bandWord = (band: RatingBand) => t(`revo.bands.${band}`);
const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);


/**
 * "today", "yesterday", "4 days ago". `day` may be a full timestamp: a page's lastRevisedDate is
 * one in the app ("2026-11-02T09:00:00.000Z"); its first ten characters are the day, as AppContext
 * reads it.
 */
export function agoWords(day: string, today: string): string {
  const n = daysSince(day, today);
  return n <= 0 ? t('revo.readout.agoToday') : n === 1 ? t('revo.readout.agoYesterday') : t('revo.readout.agoDays', { count: n });
}

/** "30 October". */
export function dayMonth(day: string): string {
  return dayMonthOf(new Date(`${day}T00:00:00`));
}

/** "1 Oct". */
export function shortDate(day: string): string {
  return formatDate(new Date(`${day}T12:00:00`), { day: 'numeric', month: 'short' }, 'device');
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
    if (plan.done) parts.push(t('revo.readout.done'));
    parts.push(t('revo.readout.ofPages', { done: plan.pages - plan.notDone, count: plan.pages }));
    if (plan.late > 0) parts.push(t('revo.readout.caughtUpLater', { n: plan.late }));
  } else {
    parts.push(bar.pages > 0 ? t('revo.readout.pagesRevised', { count: bar.pages }) : t('revo.readout.nothingRevised'));
  }
  if (facts && facts.revised.forEarlier > 0) parts.push(t('revo.readout.fromEarlier', { n: facts.revised.forEarlier }));
  if (facts && facts.revised.forLater > 0) parts.push(t('revo.readout.ahead', { n: facts.revised.forLater }));
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
    title: bar.day === today ? t('revo.readout.today') : formatDayLong(bar.day),
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
    title: now ? t('revo.readout.withNote', { text: passageShort([page]), note: t(`revo.readout.nowLower.${now}`) }) : passageShort([page]),
    line: dots.length > 0 ? t('revo.readout.ratings', { count: dots.length, days: RATING_DAYS }) : t('revo.readout.noRatings', { days: RATING_DAYS }),
  };
}

/** A tapped dot: "End of Al-Hashr · weak", "30 October, 14 days after the time before". */
export function ratingsDotReadout(page: number, dot: RatingDot, before: string | null): { title: string; line: string } {
  const gap = before ? daysBetween(before, dot.day) : null;
  return {
    title: t('revo.readout.withNote', { text: passageShort([page]), note: bandWord(dot.band) }),
    line: gap != null && gap > 0 ? t('revo.readout.dateAfterGap', { date: dayMonth(dot.day), count: gap }) : dayMonth(dot.day),
  };
}

/** The panel for a passage: "Al-Hashr, ayahs 17–24 · Juz 28", "p. 548", "Weak now · rated weak twice in 31 days · revised 4 days ago". */
export function pageDetail(page: number, userPage: UserPage | undefined, dots: readonly RatingDot[], today: string): { title: string; note: string; meta: string } {
  const parts: string[] = [];
  if (userPage?.lastRevisedDate) {
    const now = bandOf(userPage.weaknessRating);
    parts.push(t(`revo.readout.now.${now}`));
  }
  const weak = dots.filter((d) => d.band === 'weak').length;
  if (weak > 0) parts.push(t('revo.readout.ratedWeak', { times: timesWord(weak), days: RATING_DAYS }));
  parts.push(userPage?.lastRevisedDate ? t('revo.readout.revisedWhen', { when: agoWords(userPage.lastRevisedDate, today) }) : t('revo.readout.notRevisedYet'));
  return { title: describePassage([page], { juz: true }), note: pagesNote([page]), meta: parts.join(' · ') };
}

// ---------------------------------------------------------------------------------------------
// Recency (Smart Tracking off)
// ---------------------------------------------------------------------------------------------

/**
 * When a part was last revised and how often, for an account without Smart Tracking (REVO-36: no
 * strength without ratings): "Last revised 4 days ago · 2 times in 30 days". How often counts
 * revisions of every memorized page (in full), as Revo's attachments do.
 */
export function recencyLine(f: RevoPassageFacts): string {
  if (f.memorized === 0) return t('revo.readout.notMemorized');
  const last30 = f.revised.last30;
  const times = f.memorized === 1 ? last30.maxEach : last30.minEach;
  // Revised in part only (some pages, never all of them): the shared wording can't say "in full".
  const line = times === 0 && last30.days > 0 ? t('revo.readout.partly', { last: lastRevisedWords(f.lastRevisedDaysAgo) }) : recencyWords(f.lastRevisedDaysAgo, times, 30);
  return f.memorized < f.pages ? t('revo.readout.memorizedOf', { line, n: f.memorized, pages: f.pages }) : line;
}

// ---------------------------------------------------------------------------------------------
// Juz map
// ---------------------------------------------------------------------------------------------

/**
 * Insights' 30 tiles (lib/insightsView juzTiles), from the same reading of the sessions Revo's
 * context makes (lastRevisedByPage over revisedItems), so the map and Revo's words agree.
 */
export function juzMapData(pages: readonly UserPage[], logs: readonly RevisionLog[], today: string, firstDay?: string | null): JuzTile[] {
  const memorized = new Set(pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber));
  const learning = new Set(pages.filter((p) => p.status === 'in_progress').map((p) => p.pageNumber));
  // A page never revised counts from when it was memorized, or the account's first day (ACT-25).
  const memorizedOn = new Map(pages.map((p) => [p.pageNumber, p.dateMemorized]));
  const sinceOf = (page: number) => coverageSince(memorizedOn.get(page), firstDay);
  return juzTiles(memorized, learning, lastRevisedByPage(revisedItems(logs), today), today, sinceOf);
}

/** A picked juz: "Juz 4 · last revised 41 days ago" over its surahs ("Ali 'Imran 92 to the end of Juz 4"). */
export function juzReadout(tile: JuzTile): { title: string; line: string } {
  const { start, end } = getJuzRange(tile.juz);
  const when =
    tile.state === 'none'
      ? tile.learning
        ? t('revo.readout.beingLearned')
        : t('revo.readout.notMemorizedLower')
      : tile.state === 'new'
        ? tile.counts.week + tile.counts.month === 0
          ? t('revo.readout.notRevisedYet')
          : t('revo.readout.notAllRevised')
        : tile.daysSince == null
          ? t('revo.readout.notAllRevised')
        : tile.daysSince === 0
          ? t('revo.readout.revisedToday')
          : tile.daysSince === 1
            ? t('revo.readout.lastYesterday')
            : t('revo.readout.lastDaysAgo', { count: tile.daysSince });
  return { title: t('revo.readout.juzTitle', { juz: tile.juz, when }), line: describePageRange(start, end, { wholeJuz: false }) };
}

/** Pages for a strip: each memorized page that has been revised in its rating's band; the rest unrated. */
export function pagesStrip(of: readonly number[], pages: readonly UserPage[]): { page: number; band: RatingBand | null; memorized: boolean }[] {
  const byNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  return of.map((page) => {
    const p = byNumber.get(page);
    const memorized = p?.status === 'memorized';
    return { page, memorized, band: memorized && p?.lastRevisedDate ? bandOf(p.weaknessRating) : null };
  });
}

/** A juz's pages for its strip (pagesStrip). */
export function juzStrip(juz: number, pages: readonly UserPage[]): { page: number; band: RatingBand | null; memorized: boolean }[] {
  const { start, end } = getJuzRange(juz);
  return pagesStrip(Array.from({ length: end - start + 1 }, (_, i) => start + i), pages);
}

const juzList = (js: number[]) => (js.length === 0 ? null : js.map((j) => t('revo.readout.juz', { n: j })).join(t('revo.readout.listSep')));

/** For VoiceOver: the tiles by state ("Revised this week: Juz 24, Juz 25. …"). */
export function juzSummary(tiles: readonly JuzTile[]): string {
  const of = (state: JuzTile['state']) => juzList(tiles.filter((t) => t.state === state).map((t) => t.juz));
  return [
    [t('revo.readout.summary.week'), of('week')],
    [t('revo.readout.summary.month'), of('month')],
    [t('revo.readout.summary.new'), of('new')],
    [t('revo.readout.summary.stale'), of('stale')],
    [t('revo.readout.summary.learning'), juzList(tiles.filter((tile) => tile.state === 'none' && tile.learning).map((tile) => tile.juz))],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => t('revo.readout.summary.row', { label: k ?? '', juz: v ?? '' }))
    .join(t('revo.readout.summary.join'));
}

// ---------------------------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------------------------

/** A surah's pages or a juz's, in the chosen print's page numbers. */
export function passagePagesOf(c: { surah?: number; juz?: number }): number[] {
  const range = c.surah != null ? getSurah(c.surah) : null;
  const { start, end } = range ? { start: range.startPage, end: range.endPage } : c.juz != null ? getJuzRange(c.juz) : { start: 0, end: -1 };
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

export interface TimelineMark {
  day: string;
  /** Where on the line, 0 (the start) to 1 (today). */
  at: number;
  /** The weakest rating the passage's pages got that day (null: none rated). */
  band: RatingBand | null;
  /** Days since the revision before it in view (null for the first). */
  gap: number | null;
  /** The passage's pages revised that day. */
  pages: number[];
}

/**
 * Each day the passage was revised (any of its pages, in that day's sessions) over the last `days`,
 * from the account's first session at the earliest.
 */
export function timelineData(logs: readonly RevisionLog[], passage: readonly number[], today: string, days: number): { start: string; end: string; marks: TimelineMark[] } {
  const set = new Set(passage);
  const first = logs.reduce<string | null>((m, l) => (m == null || l.date < m ? l.date : m), null);
  const window = shiftDay(today, -(days - 1));
  const start = first && first > window ? first : window;
  const span = Math.max(0, daysBetween(start, today));
  const daysIn = [...new Set(logs.map((l) => l.date))].filter((d) => d >= start && d <= today).sort();
  const marks: TimelineMark[] = [];
  for (const day of daysIn) {
    const pages = [...reviewedOn(logs, day)].filter((p) => set.has(p)).sort((a, b) => a - b);
    if (pages.length === 0) continue;
    const rated = [...ratingsOn(logs, day)].filter(([p]) => set.has(p)).map(([, r]) => r);
    const prev = marks[marks.length - 1];
    marks.push({
      day,
      at: span > 0 ? daysBetween(start, day) / span : 1,
      band: rated.length > 0 ? bandOf(Math.min(...rated)) : null,
      gap: prev ? daysBetween(prev.day, day) : null,
      pages,
    });
  }
  return { start, end: today, marks };
}

/** "5 revisions · tap one to see it", or "Not revised in 30 days". */
export function timelineHint(marks: readonly TimelineMark[], days: number): string {
  if (marks.length > 0) return t('revo.readout.revisions', { count: marks.length });
  return days >= 365 ? t('revo.readout.notInYear') : t('revo.readout.notInDays', { days });
}

/** A picked revision: "Friday 16 October · weak", "14 days after the time before". */
export function timelineReadout(mark: TimelineMark, smart = true): { title: string; line: string } {
  return {
    // Smart Tracking off (REVO-36): the day alone, no rating.
    title: smart ? t('revo.readout.withNote', { text: formatDayLong(mark.day), note: mark.band ? bandWord(mark.band) : t('revo.readout.notRated') }) : formatDayLong(mark.day),
    line: mark.gap != null ? t('revo.readout.afterGap', { count: mark.gap }) : t('revo.readout.firstTime'),
  };
}

/**
 * Its panel: the ratings the passage got that day, weakest first ("Al-Hashr 17–24 weak · Al-Hashr
 * 4–16 moderate"), and the day's revision ("20 pages revised that day in 27 min").
 */
export function timelineDetail(mark: TimelineMark, logs: readonly RevisionLog[], smart = true): { ratings: string | null; line: string } {
  const ratings = ratingsOn(logs, mark.day);
  const byBand: Record<RatingBand, number[]> = { weak: [], moderate: [], strong: [] };
  for (const p of mark.pages) {
    const r = ratings.get(p);
    if (r != null) byBand[bandOf(r)].push(p);
  }
  const parts = (['weak', 'moderate', 'strong'] as const).filter((b) => byBand[b].length > 0).map((b) => t('revo.readout.passageBand', { passage: describePassage(byBand[b], { form: 'short' }), band: bandWord(b) }));
  const total = reviewedOn(logs, mark.day).size;
  const minutes = logs.filter((l) => l.date === mark.day).reduce((n, l) => n + (l.durationMinutes ?? 0), 0);
  return {
    ratings: smart && parts.length > 0 ? parts.join(' · ') : null,
    line: minutes > 0 ? t('revo.readout.thatDayIn', { count: total, time: formatMinutesLong(minutes) }) : t('revo.readout.thatDay', { count: total }),
  };
}

/**
 * How big a timeline's dots can be: 14pt, smaller when revisions crowd the line (one a day for a
 * month is 27 dots in 360pt), never under 6pt, so that neighbours keep 2pt between them.
 */
export function dotSizeFor(marks: readonly { at: number }[], width: number): number {
  let closest = Infinity;
  for (let i = 1; i < marks.length; i++) closest = Math.min(closest, (marks[i].at - marks[i - 1].at) * width);
  return Math.max(6, Math.min(14, Math.floor(closest - 2)));
}

/** The mark nearest `x` (within `reach` points when given), or null. */
export function nearestMark(marks: readonly { at: number }[], x: number, width: number, reach?: number): number | null {
  let best: number | null = null;
  let dist = reach ?? Infinity;
  marks.forEach((m, i) => {
    const d = Math.abs(m.at * width - x);
    if (d <= dist) {
      best = i;
      dist = d;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------------------------
// Weeks grid
// ---------------------------------------------------------------------------------------------

/**
 * A day in the weeks grid: its plan done, done in part, missed, or a day without a plan (rest);
 * today while it is under way; before the account's first session; or still to come.
 */
export type WeekCell = 'done' | 'part' | 'missed' | 'rest' | 'today' | 'before' | 'future';

/**
 * The last `weeks` weeks, Sunday to Saturday as Activity's calendar has them, a row a week, ending
 * with this one. `planOf` says how a day's plan went (lib/revo/facts dayFacts).
 */
export function weeksData(
  weeks: number,
  today: string,
  first: string | null,
  planOf: (day: string) => RevoDayFacts['plan'],
): { day: string; cell: WeekCell }[][] {
  const top = weekStart(shiftDay(today, -7 * (weeks - 1)));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = shiftDay(top, w * 7 + d);
      if (day > today) return { day, cell: 'future' as const };
      if (first == null || day < first) return { day, cell: 'before' as const };
      const plan = planOf(day);
      const cell: WeekCell = plan == null ? 'rest' : plan.done ? 'done' : day === today ? 'today' : plan.pages - plan.notDone > 0 ? 'part' : 'missed';
      return { day, cell };
    }),
  );
}

const counted = (c: WeekCell) => c === 'done' || c === 'part' || c === 'missed';

/** "45 of 50 days revised · tap a day or a weekday": days with a plan, before today. */
export function weeksHint(rows: readonly { cell: WeekCell }[][]): string {
  const cells = rows.flat().filter((c) => counted(c.cell));
  const revised = cells.filter((c) => c.cell !== 'missed').length;
  return cells.length > 0 ? t('revo.readout.weeksRevised', { revised, count: cells.length }) : t('revo.readout.tapDay');
}

/** "26 Sep, 10, 17 and 24 Oct": days grouped by month, in order. */
export function daysList(days: readonly string[]): string {
  const groups: { month: string; dates: number[] }[] = [];
  for (const day of [...days].sort()) {
    const date = new Date(`${day}T00:00:00`);
    const month = monthNameOf(date, 'short');
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.dates.push(date.getDate());
    else groups.push({ month, dates: [date.getDate()] });
  }
  // Arabic repeats «و» before each date after the first: «٢٦ سبتمبر و١٠ و١٧ و٢٤ أكتوبر».
  if (currentLanguage() === 'ar') {
    return groups.map((g, gi) => `${g.dates.map((d, i) => `${gi + i > 0 ? 'و' : ''}${formatNumber(d)}`).join(' ')} ${g.month}`).join(' ');
  }
  const total = groups.reduce((n, g) => n + g.dates.length, 0);
  let seen = 0;
  return groups
    .map((g) => {
      const parts = g.dates.map((d) => {
        seen++;
        // i18n-ignore (English list grammar: Arabic has its own branch above)
        return seen === total && total > 1 ? `and ${d}` : String(d);
      });
      // "10, 17 and 24": the "and" joins with a space, the rest with commas.
      const text = parts.reduce((out, p, i) => (i === 0 ? p : p.startsWith('and ') ? `${out} ${p}` : `${out}, ${p}`), '');
      return `${text} ${g.month}`;
    })
    .reduce((out, g, i) => (i === 0 ? g : g.startsWith('and ') ? `${out} ${g}` : `${out}, ${g}`), '');
}

/** A picked weekday: "Saturdays · 4 missed of 8", "Missed 26 Sep, 10, 17 and 24 Oct · part of 31 Oct". */
export function weekdayReadout(rows: readonly { day: string; cell: WeekCell }[][], column: number): { title: string; line: string } {
  const cells = rows.map((r) => r[column]).filter((c) => counted(c.cell));
  const name = t('revo.readout.weekdays', { day: weekdayName(new Date(`${rows[0][column].day}T12:00:00`)) });
  const missed = cells.filter((c) => c.cell === 'missed').map((c) => c.day);
  const part = cells.filter((c) => c.cell === 'part').map((c) => c.day);
  const done = cells.filter((c) => c.cell === 'done').length;
  const title = missed.length > 0 ? t('revo.readout.missedOf', { name, missed: missed.length, total: cells.length }) : t('revo.readout.doneOf', { name, done, total: cells.length });
  const parts: string[] = [];
  if (missed.length > 0) parts.push(t('revo.readout.missedDays', { days: daysList(missed) }));
  if (part.length > 0) parts.push(missed.length > 0 ? t('revo.readout.partOfLower', { days: daysList(part) }) : t('revo.readout.partOf', { days: daysList(part) }));
  if (parts.length === 0) parts.push(cells.length > 0 ? t('revo.readout.noneMissed') : t('revo.readout.noPlan'));
  return { title, line: parts.join(' · ') };
}

// ---------------------------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------------------------

/** The table's headings, in the app's language (read where the table is drawn). */
export const TABLE_HEADS: Record<RevoTableColumn, string> = {
  get lastRevised() {
    return t('revo.readout.heads.lastRevised');
  },
  get times30() {
    return t('revo.readout.heads.times30');
  },
  get weak() {
    return t('revo.readout.heads.weak');
  },
  get strength() {
    return t('revo.readout.heads.strength');
  },
  get memorized() {
    return t('revo.readout.heads.memorized');
  },
};

/** Which way puts what needs care first, per column: the oldest, the fewest, the most weak, the weakest. */
export const WORST_FIRST: Record<RevoTableColumn, 'asc' | 'desc'> = {
  lastRevised: 'desc',
  times30: 'asc',
  weak: 'desc',
  strength: 'asc',
  memorized: 'asc',
};

export interface TableRow {
  key: number;
  name: string;
  pages: number[];
  facts: RevoPassageFacts;
}

/** A table's rows, in the order Revo gave them: each juz or surah with what the app shows for it. */
export function tableRows(c: { juz?: number[]; surahs?: number[] }, factsOf: (pages: number[], name: string) => RevoPassageFacts): TableRow[] {
  const juz = c.juz != null;
  return (c.juz ?? c.surahs ?? []).map((n) => {
    const pages = passagePagesOf(juz ? { juz: n } : { surah: n });
    const name = juz ? `Juz${NBSP}${n}` : surahName(n);
    return { key: n, name, pages, facts: factsOf(pages, name) };
  });
}

/**
 * A cell: its words, and the number it sorts by (null: nothing to say, as for a part not memorized,
 * which always sorts last). `alert`: weak pages, in red.
 */
export function tableCell(col: RevoTableColumn, f: RevoPassageFacts): { text: string; key: number | null; alert?: boolean } {
  if (col === 'memorized') return { text: t('revo.readout.nOf', { n: f.memorized, total: f.pages }), key: f.pages > 0 ? f.memorized / f.pages : 0 };
  if (f.memorized === 0) return { text: '—', key: null };
  switch (col) {
    case 'lastRevised': {
      const d = f.lastRevisedDaysAgo;
      return { text: d == null ? t('revo.readout.never') : d === 0 ? t('revo.readout.today') : d === 1 ? t('revo.readout.yesterday') : t('revo.readout.daysShort', { count: d }), key: d ?? Number.MAX_SAFE_INTEGER };
    }
    case 'times30': {
      // Revised in full (every memorized page) that many times, as Revo's attachments say it.
      const n = f.memorized === 1 ? f.revised.last30.maxEach : f.revised.last30.minEach;
      return { text: `${n}×`, key: n };
    }
    case 'weak':
      return { text: String(f.strength.weak), key: f.strength.weak, alert: f.strength.weak > 0 };
    case 'strength':
      return f.strength.average == null ? { text: '—', key: null } : { text: f.strength.average.toFixed(1), key: f.strength.average };
  }
}

/** The rows by a column: what needs care first, or the other way; rows with nothing to say last, the order kept on ties. */
export function sortRows(rows: readonly TableRow[], col: RevoTableColumn, worstFirst: boolean): TableRow[] {
  const dir = (WORST_FIRST[col] === 'desc') === worstFirst ? -1 : 1;
  return rows
    .map((r, i) => ({ r, i, k: tableCell(col, r.facts).key }))
    .sort((a, b) => {
      if (a.k == null || b.k == null) return a.k == null && b.k == null ? a.i - b.i : a.k == null ? 1 : -1;
      return a.k === b.k ? a.i - b.i : (a.k - b.k) * dir;
    })
    .map((x) => x.r);
}

// ---------------------------------------------------------------------------------------------
// Memorized by month
// ---------------------------------------------------------------------------------------------

/** A day's memorization record, as Insights loads them (firestoreService getMemorizationsBetween). */
export interface MemorizedDay {
  day: string;
  pages: number[];
}

/** Pages memorized in each of the last `months` months, oldest first: Insights' own count (memorizationMonths). */
export function memorizedMonthsData(items: readonly MemorizedDay[], today: string, months: 6 | 12): { month: string; pages: number }[] {
  return memorizationMonths([...items], today.slice(0, 7)).slice(-months);
}

/** Some pages named by their ayahs, the memorization model's way (lib/passages describeAyahs): "Al-Ma'idah 32–82". */
const ayahWords = (pages: readonly number[]) => describeAyahs(ayahsOfPages(pages), { form: 'compact' });

/** A month's days that memorized something, oldest first: each named by its ayahs. */
export function monthDays(items: readonly MemorizedDay[], month: string): { day: string; name: string; pages: number }[] {
  const byDay = new Map<string, Set<number>>();
  for (const i of items) {
    if (i.day.slice(0, 7) !== month) continue;
    const set = byDay.get(i.day) ?? new Set<number>();
    for (const p of i.pages) set.add(p);
    byDay.set(i.day, set);
  }
  return [...byDay]
    .filter(([, pages]) => pages.size > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, pages]) => ({ day, name: ayahWords([...pages]), pages: pages.size }));
}

/** A picked month: "October · 9 pages", "Al-Ma'idah 32–82" (or that nothing was memorized). */
export function monthReadout(bar: { month: string; pages: number }, items: readonly MemorizedDay[]): { title: string; line: string } {
  const pages = [...new Set(items.filter((i) => i.day.slice(0, 7) === bar.month).flatMap((i) => i.pages))];
  return {
    title: t('revo.readout.monthPages', { month: monthName(bar.month), count: bar.pages }),
    line: pages.length > 0 ? ayahWords(pages) : t('revo.readout.nothingMemorizedIn', { month: monthName(bar.month) }),
  };
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
