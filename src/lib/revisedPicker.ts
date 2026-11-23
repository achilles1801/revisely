// What Revised elsewhere's picker chooses from and how it says it (ACT-33, Revisely Dev): the thirty juz, each one's two halves
// (its hizbs) and four parts, and a search over surahs and juz. `canLog` is always the pages that can be logged for the day:
// memorized and not revised for it yet. Names follow the page-first rules: no ayah numbers.

import { getAllSurahs, getPagesForHizb, getPagesForJuz, getPagesForSurah, getJuzForPage } from './quranData';
import { JUZ_NUMBERS, type JuzState } from './onboardingChoices';
import { describePassage, partOfSurah, surahName, surahsOfPages } from './passages';
import { t } from '../i18n';

const within = (pages: readonly number[], set: ReadonlySet<number>) => pages.filter((p) => set.has(p));

/** A juz's two halves: its two hizbs. */
export function juzHalves(juz: number): [number[], number[]] {
  const pages = getPagesForJuz(juz);
  const cut = getPagesForHizb(juz * 2)[0]; // a juz can end on the page the next hizb starts on: every page of it stays in a half
  return [pages.filter((p) => p < cut), pages.filter((p) => p >= cut)];
}

/** A juz's four parts: each half cut in two. */
export function juzParts(juz: number): number[][] {
  return juzHalves(juz)
    .flatMap((half) => {
      const cut = Math.ceil(half.length / 2);
      return [half.slice(0, cut), half.slice(cut)];
    })
    .filter((part) => part.length > 0);
}

/** How a part reads in its row: the surah and which of its pages, or the surahs it runs across and how many pages. */
export function partName(pages: readonly number[]): { title: string; detail: string } {
  const suras = surahsOfPages(pages);
  if (suras.length === 1) return { title: surahName(suras[0]), detail: partOfSurah(suras[0], pages) };
  return { title: describePassage(pages, { form: 'short' }), detail: t('common.pages', { count: pages.length }) };
}

/** Each juz's state in the grid: none, some or all of what can be logged in it is chosen. */
export function juzStates(chosen: ReadonlySet<number>, canLog: ReadonlySet<number>): JuzState[] {
  return JUZ_NUMBERS.map((juz) => {
    const open = within(getPagesForJuz(juz), canLog);
    const n = within(open, chosen).length;
    return n === 0 ? 'none' : n === open.length ? 'all' : 'part';
  });
}

/** Chosen with these pages added, or taken away if they were all chosen already. */
export function togglePages(chosen: ReadonlySet<number>, pages: readonly number[]): Set<number> {
  const next = new Set(chosen);
  const all = pages.length > 0 && pages.every((p) => next.has(p));
  for (const p of pages) {
    if (all) next.delete(p);
    else next.add(p);
  }
  return next;
}

/** Chosen with this juz's pages replaced by these. */
export function setJuzPages(chosen: ReadonlySet<number>, juz: number, pages: readonly number[]): Set<number> {
  const next = new Set(chosen);
  for (const p of getPagesForJuz(juz)) next.delete(p);
  for (const p of pages) next.add(p);
  return next;
}

const sameSet = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((p) => b.includes(p));

/** Which of a juz's halves the chosen pages are, if they are exactly one. */
export function chosenHalf(juz: number, chosen: ReadonlySet<number>, canLog: ReadonlySet<number>): 0 | 1 | null {
  const mine = within(getPagesForJuz(juz), chosen);
  if (mine.length === 0) return null;
  const [a, b] = juzHalves(juz).map((h) => within(h, canLog));
  if (b.length === 0 || a.length === 0) return null;
  return sameSet(mine, a) ? 0 : sameSet(mine, b) ? 1 : null;
}

/** "Juz 18, Juz 20 and half of Juz 19": the whole juz first, then the parts. Empty with nothing chosen. */
export function chosenWords(chosen: ReadonlySet<number>, canLog: ReadonlySet<number>): string {
  const whole: string[] = [];
  const parts: string[] = [];
  for (const juz of JUZ_NUMBERS) {
    const open = within(getPagesForJuz(juz), canLog);
    const n = within(open, chosen).length;
    if (n === 0) continue;
    if (n === open.length) whole.push(t('common.juzN', { n: juz }));
    else if (chosenHalf(juz, chosen, canLog) != null) parts.push(t('activity.picker.halfOf', { n: juz }));
    else parts.push(t('activity.picker.partOf', { n: juz }));
  }
  const all = [...whole, ...parts];
  const sep = t('lib.passages.listSeparator');
  if (all.length <= 1) return all[0] ?? '';
  if (all.length <= 3) return t('activity.picker.and', { list: all.slice(0, -1).join(sep), last: all[all.length - 1] });
  return t('activity.picker.more', { list: all.slice(0, 2).join(sep), count: all.length - 2 });
}

/** The foot of a juz opened for part of it: what is chosen in it, and how many pages. */
export function chosenInJuz(
  juz: number,
  chosen: ReadonlySet<number>,
  canLog: ReadonlySet<number>,
): { title: string; detail: string } | null {
  const open = within(getPagesForJuz(juz), canLog);
  const mine = within(open, chosen);
  if (mine.length === 0) return null;
  const pages = t('common.pages', { count: mine.length });
  if (mine.length === open.length) return { title: t('common.juzN', { n: juz }), detail: pages };
  const half = chosenHalf(juz, chosen, canLog);
  if (half == null) return { title: t('activity.picker.partOfJuz', { n: juz }), detail: pages };
  return {
    title: t(half === 0 ? 'activity.picker.firstHalfOf' : 'activity.picker.secondHalfOf', { n: juz }),
    detail: t('activity.picker.hizbDetail', { pages, n: juz * 2 - 1 + half }),
  };
}

export interface PlaceResult {
  key: string;
  title: string;
  detail: string;
  /** What a tap chooses: the place's pages that can be logged. */
  pages: number[];
}

/** Letters and digits alone, without case, marks or the forms of alif, so "naml", "An-Naml" and «النمل» find one another. */
export function foldName(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟۖ-ۭ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^a-z0-9ء-ي]/g, '');
}

const JUZ_WORD = /^(juz|jz|para|parah|الجزء|جزء)?$/;
const MAX_RESULTS = 8;

/** A juz's row under a surah found: which of the surah's pages it holds. */
function juzOfSurah(juz: number, sura: number, canLog: ReadonlySet<number>): PlaceResult | null {
  const pages = within(getPagesForJuz(juz), canLog);
  if (pages.length === 0) return null;
  const held = getPagesForSurah(sura).filter((p) => getJuzForPage(p) === juz);
  const part = partOfSurah(sura, held);
  const name = surahName(sura);
  const detail =
    part === t('lib.passages.wholeSurah')
      ? t('activity.picker.juzHasAll', { name })
      : t('activity.picker.juzHas', { name, part: `${part.charAt(0).toLowerCase()}${part.slice(1)}` });
  return { key: `juz-${juz}`, title: t('common.juzN', { n: juz }), detail, pages };
}

/** What a search finds: surahs by name (or number), then the juz. One surah found brings the juz that hold it. */
export function searchPlaces(query: string, canLog: ReadonlySet<number>): PlaceResult[] {
  const q = foldName(query);
  if (!q) return [];
  const digits = q.replace(/[^0-9]/g, '');
  const word = q.replace(/[0-9]/g, '');
  const number = digits ? Number(digits) : null;
  const surahs = getAllSurahs().filter((s) => {
    if (number != null) return word === '' && s.number === number;
    return [surahName(s.number), s.name, s.nameArabic].some((n) => foldName(n).includes(q));
  });
  const out: PlaceResult[] = [];
  const seen = new Set<string>();
  const add = (r: PlaceResult | null) => {
    if (!r || r.pages.length === 0 || seen.has(r.key)) return;
    seen.add(r.key);
    out.push(r);
  };
  for (const s of surahs) {
    const pages = within(getPagesForSurah(s.number), canLog);
    add({
      key: `surah-${s.number}`,
      title: surahName(s.number),
      detail: t('activity.picker.surahDetail', { pages: t('common.pages', { count: pages.length }) }),
      pages,
    });
  }
  if (number != null && number >= 1 && number <= 30 && JUZ_WORD.test(word)) {
    const pages = within(getPagesForJuz(number), canLog);
    add({ key: `juz-${number}`, title: t('common.juzN', { n: number }), detail: t('common.pages', { count: pages.length }), pages });
  }
  if (surahs.length === 1) {
    const juzs = [...new Set(getPagesForSurah(surahs[0].number).map(getJuzForPage))];
    for (const juz of juzs) add(juzOfSurah(juz, surahs[0].number, canLog));
  }
  return out.slice(0, MAX_RESULTS);
}
