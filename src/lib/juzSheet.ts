// The juz sheet's figures (mocks i5 and i6, Nov 7 2026): one juz, opened from a Coverage tile, the
// untouched row, or a day's Revised block. With Smart Tracking it shows strength (ACT-8); without it no
// page is rated, so it shows recency instead (ACT-19): when each part was last revised and how often.
// Pure: the sheet (components/activity/JuzSheet) draws what this returns.

import { getJuzForPage, getJuzRange, getSurahsForPage } from './quranData';
import { ayahOf, ayahsOnPage, suraOf } from './ayahKeys';
import { daysBetween } from './activityHeatmap';
import { describeSurahs } from './pageRanges';
import { pageRunEnds, surahName } from './passages';
import { strengthOf, type Strength } from './activityDayParts';

/** How recently a memorized page was revised: the Coverage tiles' bands (ACT-4). */
export type Recency = 'week' | 'month' | 'older';

/**
 * A page of the juz. `learning`: partly memorized (`in_progress`). The memorization session gives it
 * its own look ("being learned"); for now it is drawn as not memorized.
 */
export type JuzCellState = 'not-memorized' | 'learning' | Strength | Recency;

export interface JuzSheetPage {
  pageNumber: number;
  status: string;
  weaknessRating?: number;
  lastRevisedDate?: string | null;
  skipCount?: number;
}

export interface JuzSheetInput {
  juz: number;
  today: string;
  /** The account's pages (the juz's are read from them). */
  pages: JuzSheetPage[];
  /** Revision items covering at least the window (each page counts for the day it counts for). */
  revised: { countsFor: string; pages: number[] }[];
  /** The window "times" are counted over (30: "4 times in 30 days"). */
  windowDays: number;
  smartTracking: boolean;
}

export interface JuzSurahRow {
  sura: number;
  name: string;
  /** Its first page in this juz (the reader opens there). */
  firstPage: number;
  /** "Ayahs 17–24 weak", "Strong · skipped 3 times" (strength); "3 days ago · 4 times" (recency). */
  text: string;
  /** Strength's weak rows are drawn in red; recency's stale ones too. */
  alert: boolean;
  /** The dot before the name: the row's strength or recency, or none when not memorized. */
  state: JuzCellState;
}

export interface JuzSheetModel {
  juz: number;
  title: string;
  /** "Al-Mujadila to At-Tahrim". */
  subtitle: string;
  /** "Revised today", "Last revised 41 days ago", "Not revised yet", "Not memorized yet". */
  headline: string;
  /** "4 times in 30 days"; empty when nothing of it is memorized. */
  times: string;
  /** Over 30 days since a memorized page of it was revised, or one never was (the untouched juz). */
  stale: boolean;
  cells: { page: number; state: JuzCellState }[];
  /** The strip's two ends, by surah. */
  ends: [string, string];
  /** Strength's counts (with Smart Tracking) or recency's, over the memorized pages. */
  counts: { state: Strength | Recency; n: number }[];
  surahs: JuzSurahRow[];
  memorizedPages: number[];
  /** Pages being learned: the memorization session's "being learned" goes here. */
  learning: number[];
}

/** "Today", "Yesterday", "3 days ago". */
function agoWord(days: number): string {
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}

/** "Revised today", "Revised yesterday", "Last revised 3 days ago". */
function lastRevisedLine(days: number): string {
  return days <= 0 ? 'Revised today' : days === 1 ? 'Revised yesterday' : `Last revised ${days} days ago`;
}

const timesWord = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;

export function recencyOf(lastDay: string | null | undefined, today: string): Recency {
  if (!lastDay) return 'older';
  const d = daysBetween(lastDay, today);
  return d < 7 ? 'week' : d < 30 ? 'month' : 'older';
}

/** The ayahs of some pages inside one surah, as "Ayahs 17–24" ("Ayah 5"); a second run is "…". */
function ayahsIn(sura: number, pages: number[]): string {
  const keys = pages.flatMap((p) => ayahsOnPage(p)).filter((k) => suraOf(k) === sura).map(ayahOf);
  if (keys.length === 0) return '';
  const sorted = [...new Set(keys)].sort((a, b) => a - b);
  let end = 0;
  while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
  const first = sorted[0];
  const last = sorted[end];
  const more = end + 1 < sorted.length ? ', …' : '';
  return first === last ? `Ayah ${first}${more}` : `Ayahs ${first}–${last}${more}`;
}

const ORDER: Record<Strength, number> = { weak: 0, moderate: 1, strong: 2 };

export function juzSheetModel(input: JuzSheetInput): JuzSheetModel {
  const { juz, today, windowDays, smartTracking } = input;
  const { start, end } = getJuzRange(juz);
  const juzPages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const byNumber = new Map(input.pages.map((p) => [p.pageNumber, p]));
  const memorized = juzPages.filter((p) => byNumber.get(p)?.status === 'memorized');
  const learning = juzPages.filter((p) => byNumber.get(p)?.status === 'in_progress');
  const memorizedSet = new Set(memorized);

  // Each page's last revision: the latest of its own record and the items read.
  const last = new Map<number, string>();
  for (const p of memorized) {
    const own = byNumber.get(p)?.lastRevisedDate;
    if (own) last.set(p, own);
  }
  // Days in the window each page was revised (a page counts once a day).
  const inWindow = new Map<number, Set<string>>();
  for (const r of input.revised) {
    const age = daysBetween(r.countsFor, today);
    if (age < 0) continue;
    for (const p of r.pages) {
      if (!memorizedSet.has(p)) continue;
      const prev = last.get(p);
      if (prev == null || r.countsFor > prev) last.set(p, r.countsFor);
      if (age < windowDays) {
        const days = inWindow.get(p) ?? new Set<string>();
        days.add(r.countsFor);
        inWindow.set(p, days);
      }
    }
  }
  const daysOf = (pages: number[]) => new Set(pages.flatMap((p) => [...(inWindow.get(p) ?? [])])).size;
  const lastOf = (pages: number[]): number | null => {
    let newest: string | null = null;
    for (const p of pages) {
      const d = last.get(p);
      if (d && (newest == null || d > newest)) newest = d;
    }
    return newest ? daysBetween(newest, today) : null;
  };
  // The juz is as stale as its least recently revised memorized page (the untouched row, ACT-4).
  let oldest: number | null = 0;
  for (const p of memorized) {
    const d = last.get(p);
    if (!d) {
      oldest = null;
      break;
    }
    oldest = Math.max(oldest, daysBetween(d, today));
  }
  const stale = memorized.length > 0 && (oldest == null || oldest >= 30);

  const strength = (p: number): Strength => strengthOf(byNumber.get(p)?.weaknessRating ?? 4);
  const cellState = (p: number): JuzCellState =>
    !memorizedSet.has(p)
      ? byNumber.get(p)?.status === 'in_progress'
        ? 'learning'
        : 'not-memorized'
      : smartTracking
        ? strength(p)
        : recencyOf(last.get(p), today);
  const cells = juzPages.map((page) => ({ page, state: cellState(page) }));

  const kinds: (Strength | Recency)[] = smartTracking ? ['weak', 'moderate', 'strong'] : ['week', 'month', 'older'];
  const counts = kinds.map((state) => ({ state, n: cells.filter((c) => c.state === state).length })).filter((c) => c.n > 0);

  // One row per surah the juz holds, in order.
  const suras: number[] = [];
  const pagesOfSura = new Map<number, number[]>();
  for (const p of juzPages) {
    for (const s of getSurahsForPage(p)) {
      if (!pagesOfSura.has(s.number)) {
        suras.push(s.number);
        pagesOfSura.set(s.number, []);
      }
      pagesOfSura.get(s.number)!.push(p);
    }
  }
  const surahs: JuzSurahRow[] = suras.map((sura) => {
    const pages = pagesOfSura.get(sura)!;
    const mine = pages.filter((p) => memorizedSet.has(p));
    const base = { sura, name: surahName(sura), firstPage: pages[0] };
    if (mine.length === 0) {
      const partly = pages.some((p) => byNumber.get(p)?.status === 'in_progress');
      return { ...base, text: 'Not memorized', alert: false, state: partly ? ('learning' as const) : ('not-memorized' as const) };
    }
    if (smartTracking) {
      const weakest = mine.reduce<Strength>((w, p) => (ORDER[strength(p)] < ORDER[w] ? strength(p) : w), 'strong');
      if (weakest !== 'strong') {
        const at = ayahsIn(sura, mine.filter((p) => strength(p) === weakest));
        return { ...base, text: `${at} ${weakest}`.trim(), alert: weakest === 'weak', state: weakest };
      }
      const skips = mine.reduce((n, p) => n + (byNumber.get(p)?.skipCount ?? 0), 0);
      return { ...base, text: skips > 0 ? `Strong · skipped ${timesWord(skips)}` : 'Strong', alert: false, state: 'strong' as const };
    }
    const ago = lastOf(mine);
    const n = daysOf(mine);
    const state: Recency = ago == null || ago >= 30 ? 'older' : ago < 7 ? 'week' : 'month';
    const text = [ago == null ? 'Not revised yet' : agoWord(ago), n > 0 ? timesWord(n) : null].filter(Boolean).join(' · ');
    return { ...base, text, alert: state === 'older', state };
  });

  const newest = lastOf(memorized);
  return {
    juz,
    title: `Juz ${juz}`,
    subtitle: describeSurahs({ first: start, last: end }),
    headline: memorized.length === 0 ? 'Not memorized yet' : newest == null ? 'Not revised yet' : lastRevisedLine(newest),
    times: memorized.length === 0 ? '' : `${timesWord(daysOf(memorized))} in ${windowDays} days`,
    stale,
    cells,
    ends: pageRunEnds(start, end),
    counts,
    surahs,
    memorizedPages: memorized,
    learning,
  };
}

/** The juz most of some pages are in (a day's Revised block opens it; the earliest on a tie). */
export function juzOfPages(pages: number[]): number | null {
  const counts = new Map<number, number>();
  for (const p of pages) {
    const j = getJuzForPage(p);
    counts.set(j, (counts.get(j) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [j, n] of counts) if (best == null || n > (counts.get(best) ?? 0) || (n === counts.get(best) && j < best)) best = j;
  return best;
}
