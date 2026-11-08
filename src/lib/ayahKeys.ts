// Ayahs as numbers: sura × 1000 + ayah ("67:20" is 67020). Ordered as the
// mushaf is, so two keys compare as the verses do, and the same in both prints.
//
// Which verses a page holds comes from src/data/pageVerses.json (each page's
// first verse, per print; every page ends at the end of a verse), and how much
// of the page each one fills from src/data/pageVerseShares.json (thousandths of
// the page, built from the ayah bounds by scripts/build-page-verse-shares.js).
// The chosen print (lib/mushafEdition) is used unless one is named.

import pageVerseTable from '../data/pageVerses.json';
import pageShareTable from '../data/pageVerseShares.json';
import { getMushafEdition, MushafEditionId } from './mushafEdition';
import { getSurahDisplay } from './quranData';

/** A verse: sura × 1000 + ayah. */
export type AyahKey = number;

const starts = pageVerseTable as Record<MushafEditionId, number[]>;
const shares = pageShareTable as Record<MushafEditionId, number[][]>;
const startsOf = (edition: MushafEditionId) => starts[edition] ?? starts.madani1405;
const sharesOf = (edition: MushafEditionId) => shares[edition] ?? shares.madani1405;

/** The last verse of the Qur'an (An-Nas 6). */
export const LAST_AYAH: AyahKey = 114006;

export const ayahKey = (sura: number, ayah: number): AyahKey => sura * 1000 + ayah;
export const suraOf = (key: AyahKey): number => Math.floor(key / 1000);
export const ayahOf = (key: AyahKey): number => key % 1000;

/** How many ayahs a surah has (0 for no such surah). */
export const ayahCount = (sura: number): number => getSurahDisplay(sura)?.ayahCount ?? 0;

/** Whether a number names a verse of the Qur'an. */
export function isAyahKey(key: unknown): key is AyahKey {
  if (typeof key !== 'number' || !Number.isInteger(key)) return false;
  const sura = suraOf(key);
  const ayah = ayahOf(key);
  return sura >= 1 && sura <= 114 && ayah >= 1 && ayah <= ayahCount(sura);
}

/** The verse after this one (null after An-Nas 6). */
export function nextAyah(key: AyahKey): AyahKey | null {
  const sura = suraOf(key);
  if (ayahOf(key) < ayahCount(sura)) return key + 1;
  return sura < 114 ? ayahKey(sura + 1, 1) : null;
}

/** The verse before this one (null before Al-Fatihah 1). */
export function previousAyah(key: AyahKey): AyahKey | null {
  const sura = suraOf(key);
  if (ayahOf(key) > 1) return key - 1;
  return sura > 1 ? ayahKey(sura - 1, ayahCount(sura - 1)) : null;
}

/** Every verse from `from` to `to`, both included, in order ([] when `to` comes first). */
export function ayahsBetween(from: AyahKey, to: AyahKey): AyahKey[] {
  if (!isAyahKey(from) || !isAyahKey(to) || to < from) return [];
  const out: AyahKey[] = [];
  for (let k: AyahKey | null = from; k != null && k <= to; k = nextAyah(k)) out.push(k);
  return out;
}

const validPage = (p: number) => Number.isInteger(p) && p >= 1 && p <= 604;

/** The first verse on a page. */
export function firstAyahOfPage(page: number, edition: MushafEditionId = getMushafEdition()): AyahKey {
  return startsOf(edition)[page - 1];
}

/** The last verse on a page: the verse before the next page's first. */
export function lastAyahOfPage(page: number, edition: MushafEditionId = getMushafEdition()): AyahKey {
  if (page >= 604) return LAST_AYAH;
  return previousAyah(startsOf(edition)[page]) ?? LAST_AYAH;
}

/** The verses a page holds, in order ([] for no such page). */
export function ayahsOnPage(page: number, edition: MushafEditionId = getMushafEdition()): AyahKey[] {
  if (!validPage(page)) return [];
  return ayahsBetween(firstAyahOfPage(page, edition), lastAyahOfPage(page, edition));
}

/** The page a verse is on (0 for no such verse). */
export function pageOfAyah(key: AyahKey, edition: MushafEditionId = getMushafEdition()): number {
  if (!isAyahKey(key)) return 0;
  const list = startsOf(edition);
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid] <= key) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Each verse of a page with the share of the page it fills (0–1, together 1). */
export function ayahSharesOnPage(page: number, edition: MushafEditionId = getMushafEdition()): Map<AyahKey, number> {
  const keys = ayahsOnPage(page, edition);
  const parts = sharesOf(edition)[page - 1] ?? [];
  const out = new Map<AyahKey, number>();
  // The table is built from the same bounds as pageVerses.json, so the lengths agree
  // (memorizedVerses.test checks it); were they ever to differ, every verse counts alike.
  const even = parts.length !== keys.length;
  keys.forEach((k, i) => out.set(k, even ? 1 / keys.length : parts[i] / 1000));
  return out;
}

/** The verses of whole pages, in order. */
export function ayahsOfPages(pages: Iterable<number>, edition: MushafEditionId = getMushafEdition()): AyahKey[] {
  const list = [...new Set([...pages].filter(validPage))].sort((a, b) => a - b);
  return list.flatMap((p) => ayahsOnPage(p, edition));
}

/** Verse keys deduplicated, valid ones only, in mushaf order. */
export function sortedAyahs(keys: Iterable<number>): AyahKey[] {
  return [...new Set([...keys].filter(isAyahKey))].sort((a, b) => a - b);
}

/** Runs of verses that follow one another (across a surah's end too), first and last of each. */
export function ayahRuns(keys: Iterable<number>): { from: AyahKey; to: AyahKey }[] {
  const runs: { from: AyahKey; to: AyahKey }[] = [];
  for (const k of sortedAyahs(keys)) {
    const r = runs[runs.length - 1];
    if (r && nextAyah(r.to) === k) r.to = k;
    else runs.push({ from: k, to: k });
  }
  return runs;
}
