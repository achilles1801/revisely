// Coverage's three views (ACT-26; mocks activity-interactive/coverage-views, approved Nov 8 2026): the juz
// tiles, the memorized surahs under their juz, and a cell per page. Every part is coloured by recency, one
// rule for all (lib/recency coverageRecency, ACT-25), and a juz or surah fills by the share of it revised
// this week and this month. Pure: InsightsView draws what this returns.

import { getAllSurahs, getPagesForJuz } from './quranData';
import { surahName } from './passages';
import { coverageRecency, type CoverageRecency } from './recency';

export type CoverageView = 'juz' | 'surah' | 'page';
export const COVERAGE_VIEWS: readonly CoverageView[] = ['juz', 'surah', 'page'];
/** The view last shown, kept on the phone like Week | Month. */
export const COVERAGE_VIEW_KEY = 'activity.coverageView';
/** The juz the user opened or closed in the Surah view, kept on the phone. */
export const COVERAGE_OPEN_KEY = 'activity.coverageOpenJuz';

export type CoverageCounts = Record<CoverageRecency, number>;
const noCounts = (): CoverageCounts => ({ week: 0, month: 0, new: 0, stale: 0 });

/** The last view, or Juz when there is none (or it is unreadable). */
export function parseCoverageView(value: string | null | undefined): CoverageView {
  return value === 'surah' || value === 'page' ? value : 'juz';
}

export interface CoverageInput {
  memorized: ReadonlySet<number>;
  /** Each page's last revision (YYYY-MM-DD), when there was one. */
  last: ReadonlyMap<number, string>;
  today: string;
  /** The day a page never revised counts from (lib/recency coverageSince). */
  sinceOf?: (page: number) => string | null | undefined;
}

const bandOf = (input: CoverageInput, page: number): CoverageRecency =>
  coverageRecency(input.last.get(page), input.sinceOf?.(page), input.today);

function countsOf(input: CoverageInput, pages: readonly number[]): CoverageCounts {
  const c = noCounts();
  for (const p of pages) if (input.memorized.has(p)) c[bandOf(input, p)]++;
  return c;
}

export const totalOf = (c: CoverageCounts): number => c.week + c.month + c.new + c.stale;

/** Where a juz, surah or page stands: as recent as its least recently revised page (ACT-4). */
export function stateOf(c: CoverageCounts): CoverageRecency | 'none' {
  if (totalOf(c) === 0) return 'none';
  return c.stale > 0 ? 'stale' : c.new > 0 ? 'new' : c.month > 0 ? 'month' : 'week';
}

/**
 * For VoiceOver, after the part's name: "revised this week", "5 of 23 pages revised, the rest not
 * revised yet", "3 of 20 pages over 30 days".
 */
export function coverageWords(c: CoverageCounts): string {
  const total = totalOf(c);
  const revised = c.week + c.month;
  const of = (n: number) => `${n} of ${total} ${total === 1 ? 'page' : 'pages'}`;
  if (total === 0) return 'not memorized';
  if (c.stale > 0) return c.stale === total ? 'over 30 days' : `${of(c.stale)} over 30 days`;
  if (c.new > 0) return revised > 0 ? `${of(revised)} revised, the rest not revised yet` : 'not revised yet';
  if (c.month > 0) return c.week > 0 ? `${of(c.week)} this week, the rest this month` : 'revised this month';
  return 'revised this week';
}

// ── Surah ────────────────────────────────────────────────────────────────

export interface SurahCoverage {
  sura: number;
  /** As the app writes it (lib/passages: no-break hyphens). */
  name: string;
  /** Its memorized pages in this juz. */
  pages: number[];
  counts: CoverageCounts;
}

export interface JuzCoverage {
  juz: number;
  /** Its memorized pages. */
  counts: CoverageCounts;
  /** Days since its least recently revised memorized page; null when one was never revised. */
  oldest: number | null;
  /**
   * The surahs with memorized pages in it, in mushaf order, each with its pages in this juz: a surah that
   * runs on into the next juz is under both (as the juz sheet's rows are), so a juz's chips are its pages.
   */
  surahs: SurahCoverage[];
}

const dayNumber = (day: string) => Math.round(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) / 86_400_000);

/** Each juz with a memorized page, with its memorized surahs. */
export function surahCoverage(input: CoverageInput): JuzCoverage[] {
  const surahs = getAllSurahs();
  const groups: JuzCoverage[] = [];
  for (let juz = 1; juz <= 30; juz++) {
    const pages = getPagesForJuz(juz).filter((p) => input.memorized.has(p));
    if (pages.length === 0) continue;
    let oldest: number | null = -1;
    for (const p of pages) {
      const d = input.last.get(p);
      if (d == null) {
        oldest = null;
        break;
      }
      oldest = Math.max(oldest, dayNumber(input.today) - dayNumber(d));
    }
    const list: SurahCoverage[] = [];
    for (const s of surahs) {
      const mine = pages.filter((p) => p >= s.startPage && p <= s.endPage);
      if (mine.length > 0) list.push({ sura: s.number, name: surahName(s.number), pages: mine, counts: countsOf(input, mine) });
    }
    groups.push({ juz, counts: countsOf(input, pages), oldest: oldest != null && oldest < 0 ? null : oldest, surahs: list });
  }
  return groups;
}

/**
 * The juz open in the Surah view before the user chooses: those with something to act on (a page 30+
 * days, or not revised yet); with none, the one revised least recently. So it is never a wall.
 */
export function defaultOpenJuz(groups: readonly JuzCoverage[]): number[] {
  const acting = groups.filter((g) => g.counts.stale > 0 || g.counts.new > 0).map((g) => g.juz);
  if (acting.length > 0 || groups.length === 0) return acting;
  const age = (g: JuzCoverage) => (g.oldest == null ? Number.POSITIVE_INFINITY : g.oldest);
  const least = [...groups].sort((a, b) => age(b) - age(a) || a.juz - b.juz)[0];
  return [least.juz];
}

/** The user's choices on top of the default: juz opened and juz closed. */
export interface OpenChoices {
  opened: number[];
  closed: number[];
}

export function parseOpenChoices(value: string | null | undefined): OpenChoices {
  try {
    const v = value ? JSON.parse(value) : null;
    const nums = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 30) : []);
    return { opened: nums(v?.opened), closed: nums(v?.closed) };
  } catch {
    return { opened: [], closed: [] };
  }
}

/** The open juz: the default, with the user's own choices over it (a juz they closed stays closed). */
export function openJuz(groups: readonly JuzCoverage[], choices: OpenChoices): Set<number> {
  const open = new Set(defaultOpenJuz(groups));
  for (const j of choices.opened) open.add(j);
  for (const j of choices.closed) open.delete(j);
  return open;
}

/** A tap on a juz's header: open it if it was closed, close it if it was open. */
export function toggleJuz(choices: OpenChoices, juz: number, wasOpen: boolean): OpenChoices {
  const opened = choices.opened.filter((j) => j !== juz);
  const closed = choices.closed.filter((j) => j !== juz);
  return wasOpen ? { opened, closed: [...closed, juz] } : { opened: [...opened, juz], closed };
}

// ── Page ─────────────────────────────────────────────────────────────────

export interface PageCell {
  page: number;
  state: CoverageRecency | 'none';
}

/** One row per juz with a memorized page, a cell per page of the juz. */
export function pageCoverage(input: CoverageInput): { juz: number; cells: PageCell[] }[] {
  const rows: { juz: number; cells: PageCell[] }[] = [];
  for (let juz = 1; juz <= 30; juz++) {
    const pages = getPagesForJuz(juz);
    if (!pages.some((p) => input.memorized.has(p))) continue;
    rows.push({ juz, cells: pages.map((page) => ({ page, state: input.memorized.has(page) ? bandOf(input, page) : 'none' })) });
  }
  return rows;
}

/** A page's state in words, after its surah and page ("At-Takwir, page 586, not revised yet"). */
export function pageWords(state: CoverageRecency | 'none'): string {
  return state === 'week'
    ? 'revised this week'
    : state === 'month'
      ? 'revised this month'
      : state === 'new'
        ? 'not revised yet'
        : state === 'stale'
          ? 'over 30 days'
          : 'not memorized';
}
