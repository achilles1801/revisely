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
import { AyahKey, ayahSharesOnPage, ayahsOfPages, ayahsOnPage, ayahCount, pageOfAyah, sortedAyahs } from './ayahKeys';
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

/** A memorization item (users/{uid}/memorizations): a day's pages, and the ayahs it added when added by the ayah. */
export interface MemorizationItemLike {
  day: string;
  pages: readonly number[];
  /** Every ayah the item added (sura × 1000 + ayah), when it was added by the ayah; absent for whole pages. */
  verses?: readonly number[] | null;
}

/**
 * Every ayah a memorization item holds: its ayahs, and every ayah of its pages that has none among
 * them. A day's item keeps whole pages added before any ayah that day without their ayahs
 * (firestoreService.addMemorizationPages), so those pages count whole.
 */
export function ayahsOfItem(item: Pick<MemorizationItemLike, 'pages' | 'verses'>, edition: MushafEditionId = getMushafEdition()): AyahKey[] {
  const verses = sortedAyahs(item.verses ?? []);
  const withAyahs = new Set(verses.map((k) => pageOfAyah(k, edition)));
  const whole = [...new Set(item.pages)].filter((p) => !withAyahs.has(p));
  return sortedAyahs([...verses, ...ayahsOfPages(whole, edition)]);
}

/** The local day ("2026-11-03") a date falls on. */
const localDayOf = (iso: string): string => {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};

/**
 * What deleting a memorization item does to the pages (ACT-7, MEM-3): it takes off exactly the
 * ayahs it added. An ayah another item also holds stays, and so does a page memorized before any
 * item that holds it (marked in the memorized pages or at sign-up, which date it then, or from
 * before pages had dates): those ayahs didn't come from the item. `others` are the account's other
 * items; when they can't be read, the dates still keep what came before the item.
 */
export function pagesAfterDeletingItem<T extends UserPage>(
  pages: readonly T[],
  item: MemorizationItemLike,
  others: readonly MemorizationItemLike[],
  edition: MushafEditionId = getMushafEdition(),
  dayOf: (iso: string) => string = localDayOf,
): AyahChange<T> {
  const held = new Set<AyahKey>();
  // Each page's first day in an item: a page dated before it was memorized some other way.
  const firstDay = new Map<number, string>();
  const note = (day: string, keys: readonly AyahKey[]) => {
    for (const k of keys) {
      const p = pageOfAyah(k, edition);
      const known = firstDay.get(p);
      if (known == null || day < known) firstDay.set(p, day);
    }
  };
  for (const other of others) {
    const keys = ayahsOfItem(other, edition);
    for (const k of keys) held.add(k);
    note(other.day, keys);
  }
  const mine = ayahsOfItem(item, edition);
  note(item.day, mine);
  const byNumber = new Map(pages.map((p) => [p.pageNumber, p] as const));
  const memorizedBefore = (n: number): boolean => {
    const page = byNumber.get(n);
    if (!page || memorizedAyahsOnPage(page, edition).length === 0) return false;
    if (!page.dateMemorized) return true;
    return dayOf(page.dateMemorized) < (firstDay.get(n) ?? item.day);
  };
  const drop = mine.filter((k) => !held.has(k) && !memorizedBefore(pageOfAyah(k, edition)));
  return removeAyahs(pages, drop, edition);
}

/**
 * How many pages an item memorized, by page share (MEM-2): its ayahs' share of their pages, or one
 * per page when it was added as whole pages. Al-Mulk 1–20 is about 1.6.
 */
export function memorizedItemShare(item: MemorizationItemLike, edition: MushafEditionId = getMushafEdition()): number {
  if (!item.verses || item.verses.length === 0) return new Set(item.pages).size;
  let total = 0;
  for (const [page, keys] of byPage(item.verses, edition)) {
    const shares = ayahSharesOnPage(page, edition);
    if (keys.size >= shares.size) total += 1;
    else for (const k of keys) total += shares.get(k) ?? 0;
  }
  return total;
}

/** How many ayahs an item memorized: its ayahs, or every ayah of its pages. */
export function memorizedItemAyahs(item: MemorizationItemLike, edition: MushafEditionId = getMushafEdition()): number {
  if (item.verses && item.verses.length > 0) return sortedAyahs(item.verses).length;
  return [...new Set(item.pages)].reduce((n, p) => n + ayahsOnPage(p, edition).length, 0);
}

/**
 * Memorizing by month, the 12 months ending `last` ("2026-11"), oldest first: each month's pages by
 * page share (to one decimal, MEM-2) and its ayahs. Insights' Memorization bars read it.
 */
export function memorizedByMonth(
  items: readonly MemorizationItemLike[],
  last: string,
  edition: MushafEditionId = getMushafEdition(),
): { month: string; pages: number; ayahs: number }[] {
  const months: string[] = [];
  let [y, m] = last.split('-').map(Number);
  for (let k = 0; k < 12; k++) {
    months.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  const sums = new Map(months.map((mo) => [mo, { pages: 0, ayahs: 0 }]));
  for (const i of items) {
    const sum = sums.get(i.day.slice(0, 7));
    if (!sum) continue;
    sum.pages += memorizedItemShare(i, edition);
    sum.ayahs += memorizedItemAyahs(i, edition);
  }
  return months.map((month) => {
    const sum = sums.get(month)!;
    return { month, pages: Math.round(sum.pages * 10) / 10, ayahs: sum.ayahs };
  });
}
