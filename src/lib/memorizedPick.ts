// What the Memorized picker has chosen (MEM-8, Revisely Dev): one run of ayahs, from where the user
// started to the ayah they reached. A tap on an ayah says "I got to here"; what is already memorized
// inside the run stays as it is and is never added again. Names follow the page-first rules
// (surah, which page of it, its first words): no ayah numbers in this flow.

import {
  AyahKey,
  ayahsBetween,
  ayahsOnPage,
  firstAyahOfPage,
  lastAyahOfPage,
  nextAyah,
  pageOfAyah,
  previousAyah,
  suraOf,
} from './ayahKeys';
import { getSurah } from './quranData';
import { surahName } from './passages';
import { formatNumber, t } from '../i18n';

export interface AyahPick {
  from: AyahKey;
  to: AyahKey;
}

/** The first ayah on a page not memorized yet, or null when all of it is. */
export function firstOpenOnPage(page: number, memorized: ReadonlySet<AyahKey>): AyahKey | null {
  return ayahsOnPage(page).find((k) => !memorized.has(k)) ?? null;
}

/** Where the picker opens: the first page from `lo` to `hi` with an ayah to go, else `lo`. */
export function leftOffPage(memorized: ReadonlySet<AyahKey>, lo: number, hi: number): number {
  for (let p = lo; p <= hi; p++) if (firstOpenOnPage(p, memorized) != null) return p;
  return lo;
}

/**
 * A tap on an ayah. With nothing chosen, it fills from the page's first open ayah to there. After
 * that it moves the end, or, before the run, brings the run's start back to it. An ayah already
 * memorized changes nothing.
 */
export function reachAyah(pick: AyahPick | null, key: AyahKey, page: number, memorized: ReadonlySet<AyahKey>): AyahPick | null {
  if (memorized.has(key)) return pick;
  if (pick) return key >= pick.from ? { from: pick.from, to: key } : { from: key, to: pick.to };
  const start = firstOpenOnPage(page, memorized) ?? key;
  return { from: Math.min(start, key), to: key };
}

/** A hold on an ayah: the run starts there (they began partway down the page). */
export function startAtAyah(pick: AyahPick | null, key: AyahKey, memorized: ReadonlySet<AyahKey>): AyahPick | null {
  if (memorized.has(key)) return pick;
  return { from: key, to: pick && pick.to >= key ? pick.to : key };
}

/** Whole page: the run takes in everything still to go on the page. */
export function wholePage(pick: AyahPick | null, page: number, memorized: ReadonlySet<AyahKey>): AyahPick | null {
  const first = firstOpenOnPage(page, memorized);
  if (first == null) return pick;
  const last = lastAyahOfPage(page);
  return pick ? { from: Math.min(pick.from, first), to: Math.max(pick.to, last) } : { from: first, to: last };
}

/** Clear: this page leaves the run, and what was chosen on the pages before it (or else after it) stays. */
export function clearPage(pick: AyahPick | null, page: number): AyahPick | null {
  if (!pick) return null;
  const first = firstAyahOfPage(page);
  const last = lastAyahOfPage(page);
  if (pick.to < first || pick.from > last) return pick;
  if (pick.from < first) return { from: pick.from, to: previousAyah(first) ?? pick.from };
  if (pick.to > last) return { from: nextAyah(last) ?? pick.to, to: pick.to };
  return null;
}

/** The ayahs a pick adds: the run, without what is already memorized. */
export function chosenAyahs(pick: AyahPick | null, memorized: ReadonlySet<AyahKey>): AyahKey[] {
  return pick ? ayahsBetween(pick.from, pick.to).filter((k) => !memorized.has(k)) : [];
}

/** The pages those ayahs are on, in order. */
export function pagesOfAyahs(ayahs: readonly AyahKey[]): number[] {
  return [...new Set(ayahs.map((k) => pageOfAyah(k)))].sort((a, b) => a - b);
}

/** "3rd" (English), the number alone in Arabic, whose strings say "الصفحة ٣". */
function nth(n: number): string {
  const tens = n % 100;
  const unit = n % 10;
  // i18n-ignore (the English ordinal's ending; Arabic's string doesn't use it)
  const suffix = tens >= 11 && tens <= 13 ? 'th' : unit === 1 ? 'st' : unit === 2 ? 'nd' : unit === 3 ? 'rd' : 'th';
  return t('activity.pick.nth', { n: formatNumber(n), suffix });
}

/** A page's place in a surah: 1-based, of how many. */
function placeIn(sura: number, page: number): { n: number; count: number } {
  const s = getSurah(sura);
  return s ? { n: page - s.startPage + 1, count: s.endPage - s.startPage + 1 } : { n: 1, count: 1 };
}

/** The surah a page is named by, given the ayah that brings it up (a page can hold two surahs). */
function suraOnPage(page: number, near?: AyahKey): number {
  if (near != null && pageOfAyah(near) === page) return suraOf(near);
  return suraOf(firstAyahOfPage(page));
}

/** "3rd page", "last page"; under a preview and between the picker's arrows. */
export function pageWord(page: number, near?: AyahKey): string {
  const { n, count } = placeIn(suraOnPage(page, near), page);
  return n === count && count > 1 ? t('activity.pick.lastPage') : t('activity.pick.page', { nth: nth(n) });
}

/** "3rd page of 9". */
export function pageOfSurah(page: number): string {
  const { n, count } = placeIn(suraOnPage(page), page);
  return t('activity.pick.pageOf', { nth: nth(n), total: formatNumber(count) });
}

/** The surah a page is in, by name. */
export const surahOfPage = (page: number) => surahName(suraOnPage(page));

/** A page by its surah: "An-Naml, 3rd page"; a surah of one page, its name alone. */
export function placeName(page: number, near?: AyahKey): string {
  const sura = suraOnPage(page, near);
  if (placeIn(sura, page).count <= 1) return surahName(sura);
  return t('activity.pick.named', { surah: surahName(sura), page: pageWord(page, near) });
}

/** What is chosen, by name: "An-Naml, 3rd to 5th page", "Maryam, first 3 pages", "Maryam to Ta-Ha". */
export function pickName(ayahs: readonly AyahKey[]): string {
  if (ayahs.length === 0) return '';
  const first = ayahs[0];
  const last = ayahs[ayahs.length - 1];
  const a = suraOf(first);
  const b = suraOf(last);
  if (a !== b) return t('activity.pick.surahToSurah', { from: surahName(a), to: surahName(b) });
  const p0 = pageOfAyah(first);
  const p1 = pageOfAyah(last);
  if (p0 === p1) return placeName(p0, first);
  const start = placeIn(a, p0);
  const end = placeIn(a, p1);
  const surah = surahName(a);
  const pages = p1 - p0 + 1;
  if (start.n === 1 && end.n === end.count) return surah;
  if (start.n === 1) return t('activity.pick.firstPages', { surah, count: pages, n: formatNumber(pages) });
  if (end.n === end.count) return t('activity.pick.lastPages', { surah, count: pages, n: formatNumber(pages) });
  return t('activity.pick.run', { surah, from: nth(start.n), to: nth(end.n) });
}

/** Whether the run stops before the end of its last page: then the sheet says where it stopped. */
export function stopsPartway(ayahs: readonly AyahKey[]): boolean {
  if (ayahs.length === 0) return false;
  const last = ayahs[ayahs.length - 1];
  return last !== lastAyahOfPage(pageOfAyah(last));
}
