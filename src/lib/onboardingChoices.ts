// What onboarding's questions work out (ONBOARD-3, ONBOARD-4). Pure: the screens hold the answers.
import { UserPage } from '../types';
import { TOTAL_QURAN_PAGES } from '../types/firestore';
import { PageStatus } from './memorizationChanges';
import { getJuzForPage, getPagesForJuz, getSurahsForPage } from './quranData';

export type JuzState = 'none' | 'part' | 'all';

export const JUZ_NUMBERS: readonly number[] = Array.from({ length: 30 }, (_, i) => i + 1);

/** Every page memorized once `pending` applies, loaded or not (what the checks and the count show). */
export function memorizedWithPending(pages: readonly UserPage[], pending: ReadonlyMap<number, PageStatus>): number[] {
  const loaded = new Map(pages.map((p) => [p.pageNumber, p.status] as const));
  const out: number[] = [];
  for (let page = 1; page <= TOTAL_QURAN_PAGES; page++) {
    if ((pending.get(page) ?? loaded.get(page)) === 'memorized') out.push(page);
  }
  return out;
}

/** How much of a juz those pages hold. */
export function juzState(juz: number, memorized: ReadonlySet<number>): JuzState {
  const pages = getPagesForJuz(juz);
  const held = pages.filter((p) => memorized.has(p)).length;
  if (held === 0) return 'none';
  return held === pages.length ? 'all' : 'part';
}

/** What's chosen as counts: juz held whole, and the pages outside them. Never ayah numbers (Majd, Nov 23 2026). */
export function chosenCounts(memorized: readonly number[]): { juz: number; pages: number } {
  const set = new Set(memorized);
  let juz = 0;
  let inWholeJuz = 0;
  for (const n of JUZ_NUMBERS) {
    if (juzState(n, set) === 'all') {
      juz++;
      inWholeJuz += getPagesForJuz(n).length;
    }
  }
  return { juz, pages: set.size - inWholeJuz };
}

/**
 * A tap on a juz in the grid: a juz not wholly chosen becomes whole, a whole one is cleared. The pages change as the
 * list's juz check changes them (a page back at its saved status leaves the buffer). A surah that loses a page this way
 * is no longer wholly memorized, so it leaves the surah buffer too.
 */
export function toggleJuz(
  juz: number,
  pages: readonly UserPage[],
  pending: ReadonlyMap<number, PageStatus>,
  baseSurahs: readonly number[],
  pendingSurahs: ReadonlyMap<number, PageStatus>,
): { pending: Map<number, PageStatus>; pendingSurahs: Map<number, PageStatus> } {
  const juzPages = getPagesForJuz(juz);
  const memorized = new Set(memorizedWithPending(pages, pending));
  const target: PageStatus = juzPages.every((p) => memorized.has(p)) ? 'not_memorized' : 'memorized';
  const saved = new Map(pages.map((p) => [p.pageNumber, p.status] as const));

  const nextPages = new Map(pending);
  for (const page of juzPages) {
    if ((saved.get(page) ?? 'not_memorized') === target) nextPages.delete(page);
    else nextPages.set(page, target);
  }

  const nextSurahs = new Map(pendingSurahs);
  if (target === 'not_memorized') {
    const base = new Set(baseSurahs);
    const touched = new Set(juzPages.flatMap((p) => getSurahsForPage(p).map((s) => s.number)));
    for (const surah of touched) {
      if (base.has(surah)) nextSurahs.set(surah, 'not_memorized');
      else nextSurahs.delete(surah);
    }
  }
  return { pending: nextPages, pendingSurahs: nextSurahs };
}

/** How many days one full round takes (the amount's note). 0 with nothing memorized. */
export function daysPerRound(memorized: readonly number[], mode: 'pages' | 'juz', pagesADay: number, juzADay: number): number {
  if (memorized.length === 0) return 0;
  if (mode === 'juz') {
    if (juzADay <= 0) return 0;
    return Math.ceil(new Set(memorized.map(getJuzForPage)).size / juzADay);
  }
  return pagesADay <= 0 ? 0 : Math.ceil(memorized.length / pagesADay);
}

/** Day one of a new plan, in mushaf order (SCHED-1, SCHED-2): what the reminder's preview names. */
export function firstDayPages(memorized: readonly number[], mode: 'pages' | 'juz', pagesADay: number, juzADay: number): number[] {
  const sorted = [...memorized].sort((a, b) => a - b);
  if (mode === 'pages') return sorted.slice(0, pagesADay);
  const firstJuz = new Set([...new Set(sorted.map(getJuzForPage))].slice(0, juzADay));
  return sorted.filter((p) => firstJuz.has(getJuzForPage(p)));
}

