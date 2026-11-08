// What is memorized, ayah by ayah (Majd, Nov 7 2026: "most people memorize ayahs
// rather than pages"). Pages stay the documents (ratings, revision counts, the
// cycle are per page); the ayah sits on top of them:
//
//   memorized      every ayah on the page (its `verses`, if any, mean nothing)
//   in_progress    some of them: the ones in its `verses` (Firestore's "learning")
//   not_memorized  none
//
// A page becomes memorized when its last ayah is added, and loses its `verses`.
// How much a page counts for is its share of the page (lib/ayahKeys: the area its
// ayahs fill), so % memorized and the juz dots stay a measure of length.
//
// Every screen that asks "what is memorized" asks here (BEHAVIOUR.md, MEM-*).

import type { UserPage } from '../types';
import { MushafEditionId, getMushafEdition } from './mushafEdition';
import { AyahKey, ayahSharesOnPage, ayahsOnPage, ayahCount, pageOfAyah, sortedAyahs } from './ayahKeys';
import { getAllSurahs, getPagesForJuz } from './quranData';

/** What the ayah rules need of a page. */
export type PageMemorization = Pick<UserPage, 'pageNumber' | 'status'> & { verses?: number[] | null };

/** The memorized ayahs on a page, in order. */
export function memorizedAyahsOnPage(page: PageMemorization, edition: MushafEditionId = getMushafEdition()): AyahKey[] {
  if (page.status === 'memorized') return ayahsOnPage(page.pageNumber, edition);
  if (page.status !== 'in_progress' || !page.verses || page.verses.length === 0) return [];
  const on = new Set(ayahsOnPage(page.pageNumber, edition));
  return sortedAyahs(page.verses).filter((k) => on.has(k));
}

/** A page with some ayahs memorized but not all (MEM-1). */
export function isPartlyMemorized(page: PageMemorization, edition: MushafEditionId = getMushafEdition()): boolean {
  return page.status === 'in_progress' && memorizedAyahsOnPage(page, edition).length > 0;
}

/**
 * Whether a page is revised: memorized, or partly memorized (MEM-4). A page with any ayah memorized
 * joins the revision cycle, named by those ayahs, so a short surah or a surah's end that shares its
 * page is revised before the rest of the page is learned.
 */
export function isRevisable(page: PageMemorization, edition: MushafEditionId = getMushafEdition()): boolean {
  return page.status === 'memorized' || isPartlyMemorized(page, edition);
}

/** The pages that are revised (isRevisable), in the order given. */
export function revisablePages<T extends PageMemorization>(pages: readonly T[], edition: MushafEditionId = getMushafEdition()): T[] {
  return pages.filter((p) => isRevisable(p, edition));
}

/**
 * The partly memorized pages, each with its memorized ayahs. Screens that name the pages to revise
 * take it, so a page in part is named by what is memorized on it (MEM-4).
 */
export function partlyMemorizedAyahs(pages: readonly PageMemorization[], edition: MushafEditionId = getMushafEdition()): Map<number, AyahKey[]> {
  const out = new Map<number, AyahKey[]>();
  for (const p of pages) {
    if (p.status !== 'in_progress') continue;
    const mine = memorizedAyahsOnPage(p, edition);
    if (mine.length > 0) out.set(p.pageNumber, mine);
  }
  return out;
}

/** The ayahs to revise on some pages, in the order given: a whole page's, or a partly memorized page's own (MEM-4). */
export function ayahsToRevise(
  pageNumbers: readonly number[],
  partial: ReadonlyMap<number, readonly AyahKey[]> = new Map(),
  edition: MushafEditionId = getMushafEdition(),
): AyahKey[] {
  return pageNumbers.flatMap((n) => [...(partial.get(n) ?? ayahsOnPage(n, edition))]);
}

/** How much of a page is memorized, 0–1: its share of the page's text (MEM-2). */
export function pageShare(page: PageMemorization, edition: MushafEditionId = getMushafEdition()): number {
  if (page.status === 'memorized') return 1;
  const mine = memorizedAyahsOnPage(page, edition);
  if (mine.length === 0) return 0;
  const shares = ayahSharesOnPage(page.pageNumber, edition);
  if (mine.length === shares.size) return 1;
  return Math.min(1, mine.reduce((n, k) => n + (shares.get(k) ?? 0), 0));
}

/** The pages memorized, counting a partly memorized page by its share (MEM-2): 305.6 of 604. */
export function memorizedPageShare(pages: readonly PageMemorization[], edition: MushafEditionId = getMushafEdition()): number {
  let total = 0;
  for (const p of pages) total += pageShare(p, edition);
  return total;
}

/** Each juz's memorized share (0–1), juz 1 first: 30 numbers, by page share (MEM-2). */
export function juzShares(pages: readonly PageMemorization[], edition: MushafEditionId = getMushafEdition()): number[] {
  const byPage = new Map(pages.map((p) => [p.pageNumber, p]));
  const out: number[] = [];
  for (let juz = 1; juz <= 30; juz++) {
    const list = getPagesForJuz(juz);
    let sum = 0;
    for (const n of list) {
      const p = byPage.get(n);
      if (p) sum += pageShare(p, edition);
    }
    out.push(list.length > 0 ? sum / list.length : 0);
  }
  return out;
}

/** Every memorized ayah, in mushaf order. */
export function memorizedAyahs(pages: readonly PageMemorization[], edition: MushafEditionId = getMushafEdition()): AyahKey[] {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  return sortedAyahs(sorted.flatMap((p) => memorizedAyahsOnPage(p, edition)));
}

/** The surahs with every ayah memorized (a surah ending mid-page counts once its own ayahs are). */
export function memorizedSurahs(pages: readonly PageMemorization[], edition: MushafEditionId = getMushafEdition()): number[] {
  const counts = new Map<number, number>();
  for (const k of memorizedAyahs(pages, edition)) {
    const sura = Math.floor(k / 1000);
    counts.set(sura, (counts.get(sura) ?? 0) + 1);
  }
  return getAllSurahs()
    .map((s) => s.number)
    .filter((n) => (counts.get(n) ?? 0) === ayahCount(n));
}

/** The result of adding or removing ayahs: every page, and the numbers of those that changed. */
export interface AyahChange<T extends UserPage = UserPage> {
  pages: T[];
  changed: number[];
}

/** A page's memorization as it should be saved, given its memorized ayahs. */
function withAyahs<T extends UserPage>(page: T, mine: AyahKey[], all: AyahKey[], now: string | null): T {
  if (mine.length === 0) return { ...page, status: 'not_memorized', verses: null, dateMemorized: null };
  if (mine.length >= all.length) return { ...page, status: 'memorized', verses: null, dateMemorized: page.dateMemorized ?? now };
  return { ...page, status: 'in_progress', verses: mine, dateMemorized: page.dateMemorized ?? now };
}

const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The pages the ayahs are on, each with its ayahs among them. */
function byPage(keys: Iterable<number>, edition: MushafEditionId): Map<number, Set<AyahKey>> {
  const out = new Map<number, Set<AyahKey>>();
  for (const k of sortedAyahs(keys)) {
    const p = pageOfAyah(k, edition);
    if (!out.has(p)) out.set(p, new Set());
    out.get(p)!.add(k);
  }
  return out;
}

/**
 * Marks ayahs memorized (MEM-1, MEM-3). A page they complete becomes memorized; one they start or
 * add to is partly memorized, keeping its ayahs. A memorized page doesn't change. `now` (ISO) is the
 * date memorized of a page that had none.
 */
export function addAyahs<T extends UserPage>(
  pages: readonly T[],
  keys: Iterable<number>,
  now: string,
  edition: MushafEditionId = getMushafEdition(),
): AyahChange<T> {
  const touched = byPage(keys, edition);
  const changed: number[] = [];
  const out = pages.map((page) => {
    const adding = touched.get(page.pageNumber);
    if (!adding || page.status === 'memorized') return page;
    const all = ayahsOnPage(page.pageNumber, edition);
    const before = memorizedAyahsOnPage(page, edition);
    const mine = sortedAyahs([...before, ...adding]);
    if (sameList(mine, before) && page.status === 'in_progress') return page;
    changed.push(page.pageNumber);
    return withAyahs(page, mine, all, now);
  });
  return { pages: out, changed };
}

/**
 * Marks ayahs not memorized (MEM-3): a memorized page they're on keeps its other ayahs (partly
 * memorized), and a page left with none is not memorized.
 */
export function removeAyahs<T extends UserPage>(
  pages: readonly T[],
  keys: Iterable<number>,
  edition: MushafEditionId = getMushafEdition(),
): AyahChange<T> {
  const touched = byPage(keys, edition);
  const changed: number[] = [];
  const out = pages.map((page) => {
    const removing = touched.get(page.pageNumber);
    if (!removing) return page;
    const before = memorizedAyahsOnPage(page, edition);
    const mine = before.filter((k) => !removing.has(k));
    if (mine.length === before.length) return page;
    changed.push(page.pageNumber);
    return withAyahs(page, mine, ayahsOnPage(page.pageNumber, edition), null);
  });
  return { pages: out, changed };
}
