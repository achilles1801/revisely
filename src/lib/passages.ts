// How Revisely names a part of the Qur'an: by surah or juz, which page of it, and how that page begins, the way people
// revise and memorize (NAME-1, NAME-2). Almost never by ayah numbers (Majd, Nov 23 2026: "almost no one references the
// quran by ayah numbers when it comes to revising or memorizing ... it should just be the page").
//
//   whole juz            Juz 28 · Juz 27–28
//   whole surah          Al-Mulk · Adh-Dhariyat to Al-Hadid
//   one page             Maryam, 5th page · Maryam, 1st page · Maryam, last page
//                        (a surah of a page or less: its name alone)
//   part of a page       Maryam, 3rd page · start  (· middle, · end)
//   pages of one surah   Maryam, 3rd to 5th page · Maryam, first 3 pages · Maryam, last 3 pages
//   a juz's edge         Juz 2, first 5 pages · Juz 3, last 4 pages
//   across surahs        Maryam to Ta-Ha (`exact`, where both ends matter: Maryam, 5th page to Ta-Ha, 3rd page)
//   with the juz         Al-Baqarah, 23rd page · Juz 2 (`juz: true`, when it adds something)
//   several parts        Juz 1–6, Juz 21–28 and Al-Mulk, first 2 pages (a set, in page order), or a session's runs in
//                        its own order: "Ash-Shams to An-Nas, then …"
//   a session            describeSession: whole juz only on the juz plan (SESS-5)
//   a row named by its surah   partOfSurah: "5th page", "First 3 pages", "Whole surah"
//   a place to start     placeOfPage: "Al-Mujadila", "Juz 2", "Al-Hadid, 2nd page"; firstWordsOfPage gives the line
//                        under it, apart from the name so screens style it
//
// A page holding two surahs counts for both: it is the first's last page and the second's 1st. Alone it is named by the
// surah it opens with, else the one that fills more of it.
//
// Ayah numbers stay only where a verse is being cited or played (`form: 'ayahs'` / 'ayahsCompact': a held verse, search
// results, Audio Options, "Play from").
//
// Every page of both prints ends at the end of a verse, so a page range is a verse range: its first page's first verse
// to its last page's last verse, read from src/data/pageVerses.json (scripts/build-page-verses.js). The two prints share
// page numbers, surah and juz starts; inside the pages they draw differently the ayahs differ, so the chosen print is
// used unless named.
//
// Text comes ready for the screen: surah names hold together with no-break hyphens and spaces ("Al‑Baqarah" never
// breaks after "Al-"), and "Juz 28", "5th page" with no-break spaces. `plainText` undoes that (notifications, tests),
// `spokenText` reads it for VoiceOver.

import firstWordsTable from '../data/pageFirstWords.json';
import pageVerseTable from '../data/pageVerses.json';
import {
  ayahKey,
  ayahOf,
  ayahRuns,
  ayahSharesOnPage,
  ayahsOnPage,
  firstAyahOfPage,
  lastAyahOfPage,
  nextAyah,
  pageOfAyah,
  previousAyah,
  suraOf,
} from './ayahKeys';
import { getMushafEdition, MushafEditionId } from './mushafEdition';
import { getJuzForPage, getJuzRange, getSurah, getSurahDisplay } from './quranData';
import { currentLanguage, formatNumber, t } from '../i18n';

/** A no-break space. */
export const NBSP = ' ';
/** A no-break hyphen. */
export const NBHY = '‑';

export interface Verse {
  sura: number;
  ayah: number;
}

export type PassageForm = 'short' | 'compact' | 'long' | 'ayahs' | 'ayahsCompact';

export interface PassageOptions {
  /**
   * 'long' (sentences, rows; the default) and 'compact' (sub-lines) name pages alike. 'short' (chips, chart labels) says
   * "Start of Al-Baqarah" for pages from a surah's edge. 'ayahs' ("Al-Mulk, ayahs 1–12") and 'ayahsCompact' ("Al-Mulk
   * 1–12") are for citing a verse or playing it, and nowhere else.
   */
  form?: PassageForm;
  /** Add " · Juz 28" (or "Juz 27–28") when the pages lie in one juz or two in a row and the text names none. */
  juz?: boolean;
  /** Name whole juz "Juz 28" (the default). Off for sessions off the juz plan (SESS-5): surahs only. */
  wholeJuz?: boolean;
  /**
   * 'mushaf' (the default): pages are a set, named in page order and joined with "and".
   * 'given': runs keep the order the pages came in (a session's, the reverse plan's) and are joined with ", then".
   */
  order?: 'mushaf' | 'given';
  /** At most this many parts are named; the rest are "and N more" (default 3). */
  max?: number;
  /** For the middle of a sentence: "the start of Al-Baqarah" (else "Start of Al-Baqarah"). */
  sentence?: boolean;
  /** The print whose verses to use (default: the one chosen in Settings). */
  edition?: MushafEditionId;
  /** A run across surahs names the page at each end ("Maryam, 5th page to Ta-Ha, 3rd page"), not the surahs alone. */
  exact?: boolean;
}

const table = pageVerseTable as Record<MushafEditionId, number[]>;

const validPage = (p: number) => Number.isInteger(p) && p >= 1 && p <= 604;
const ayahCount = (sura: number) => getSurahDisplay(sura)?.ayahCount ?? 0;

/** The first verse on a page (it always begins there). */
export function firstVerseOfPage(page: number, edition: MushafEditionId = getMushafEdition()): Verse {
  const v = (table[edition] ?? table.madani1405)[page - 1];
  return { sura: Math.floor(v / 1000), ayah: v % 1000 };
}

/** The last verse on a page (it always ends there). */
export function lastVerseOfPage(page: number, edition: MushafEditionId = getMushafEdition()): Verse {
  if (page >= 604) return { sura: 114, ayah: 6 };
  const next = firstVerseOfPage(page + 1, edition);
  return next.ayah > 1 ? { sura: next.sura, ayah: next.ayah - 1 } : { sura: next.sura - 1, ayah: ayahCount(next.sura - 1) };
}

/**
 * A surah's name, held together: "Al‑Baqarah", "Ali 'Imran" never break inside. In Arabic, its Arabic name
 * («البقرة»).
 */
export function surahName(sura: number): string {
  return surahNameIn(sura).split('-').join(NBHY).split(' ').join(NBSP);
}

/** The surahs pages hold, in the order the pages come. */
export function surahsOfPages(pages: Iterable<number>, edition: MushafEditionId = getMushafEdition()): number[] {
  const surahs = new Set<number>();
  for (const page of pages) {
    if (!validPage(page)) continue;
    const last = lastVerseOfPage(page, edition).sura;
    for (let s = firstVerseOfPage(page, edition).sura; s <= last; s++) surahs.add(s);
  }
  return [...surahs];
}

/** A surah's name in the app's language, as written (not held together): "Al-Baqarah", «البقرة». */
export function surahNameIn(sura: number): string {
  const surah = getSurah(sura);
  return (currentLanguage() === 'ar' ? (surah?.nameArabic ?? surah?.name) : surah?.name) ?? '';
}

const juzLabel = (a: number, b: number) => (a === b ? t('lib.passages.juz', { n: a }) : t('lib.passages.juzRange', { from: a, to: b }));
/** Whether a passage's words already name a juz ("Juz 28", "the end of Juz 3"): then no "· Juz" is added. */
const namesJuz = (text: string) => text.includes(t('lib.passages.juz', { n: '' }));
const juzStart = (j: number) => getJuzRange(j).start;
const juzEnd = (j: number) => getJuzRange(j).end;

interface Run {
  first: number;
  last: number;
}

/** Runs of consecutive pages. 'given' keeps first-seen order and joins descending steps too (the reverse plan). */
/** How many runs of pages describePassage names (one: no "N more" however small `max` is). */
export function passageRunCount(pages: Iterable<number>, order: 'mushaf' | 'given' = 'mushaf'): number {
  return runsOf([...pages].filter(validPage), order).length;
}

function runsOf(pages: Iterable<number>, order: 'mushaf' | 'given'): Run[] {
  const seen = [...new Set([...pages].filter(validPage))];
  const list = order === 'mushaf' ? seen.sort((a, b) => a - b) : seen;
  const runs: Run[] = [];
  let dir = 0;
  for (const p of list) {
    const r = runs[runs.length - 1];
    if (r && dir >= 0 && p === r.last + 1) {
      r.last = p;
      dir = 1;
    } else if (r && dir <= 0 && p === r.first - 1 && order === 'given') {
      r.first = p;
      dir = -1;
    } else {
      runs.push({ first: p, last: p });
      dir = 0;
    }
  }
  return runs;
}

/** A run of ayahs, first to last (sura × 1000 + ayah, lib/ayahKeys). */
interface AyahRun {
  from: number;
  to: number;
}

/** A run of pages as its ayahs: its first page's first to its last page's last. */
const ayahsOfRun = (run: Run, edition: MushafEditionId): AyahRun => ({
  from: firstAyahOfPage(run.first, edition),
  to: lastAyahOfPage(run.last, edition),
});

/** The ayahs a juz span holds: its first page's first ayah to its last page's last. */
const juzAyahs = (a: number, b: number, edition: MushafEditionId): AyahRun => ({
  from: firstAyahOfPage(juzStart(a), edition),
  to: lastAyahOfPage(juzEnd(b), edition),
});

/** Whether a form cites ayah numbers (a verse being cited or played). */
const citesAyahs = (form: PassageForm) => form === 'ayahs' || form === 'ayahsCompact';

/**
 * The page an ayah is on, by its surah: "An-Naml, 3rd page" (a surah of a page or less, its name). For a place inside a
 * take or a mark, where "· middle" would add nothing.
 */
export function pageNameOfAyah(key: number, edition: MushafEditionId = getMushafEdition()): string {
  const sura = suraOf(key);
  return inside(surahName(sura), pageWords(sura, pageOfAyah(key, edition), edition));
}

/**
 * The first words of a place to start, for the line under its name (NAME-2): none when the page opens a surah or a juz,
 * since that name already says where it begins.
 */
export function firstWordsOfPlace(page: number, edition: MushafEditionId = getMushafEdition()): string {
  if (!validPage(page)) return '';
  const first = firstAyahOfPage(page, edition);
  return ayahOf(first) === 1 || juzStart(getJuzForPage(page)) === page ? '' : firstWordsOfPage(page, edition);
}

/**
 * A name without the amount it carries ("Al-Baqarah, first 28 pages" → "Al-Baqarah"), for a sentence that has just said
 * how many pages.
 */
export function withoutAmount(name: string): string {
  return name.replace(/[,،][\s\u00a0]+(?:(?:first|last)[\s\u00a0]+\d+[\s\u00a0]+pages|(?:أول|آخر)[\s\u00a0]+(?:[٠-٩\d]+[\s\u00a0]+)?(?:صفحات|صفحة|صفحتين))$/u, '');
}

/** "1st", "2nd", "23rd" in English; Arabic says "الصفحة ٥", with no ordinal word. */
function ordinal(n: number): string {
  if (currentLanguage() === 'ar') return formatNumber(n);
  const teens = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teens ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** Which page of its surah a page is: "Maryam, 5th page". A page holding two surahs counts for both. */
export function pageInSurah(
  page: number,
  sura: number,
  edition: MushafEditionId = getMushafEdition(),
): { n: number; count: number } | null {
  const count = ayahCount(sura);
  if (count === 0) return null;
  // From the print's own verses: where a surah ends can differ between the two (the end of 'Abasa is on 586 in 1441).
  const start = pageOfAyah(ayahKey(sura, 1), edition);
  const end = pageOfAyah(ayahKey(sura, count), edition);
  if (page < start || page > end) return null;
  return { n: page - start + 1, count: end - start + 1 };
}

export type PagePart = 'whole' | 'start' | 'middle' | 'end';

/**
 * Where a run of one surah's ayahs sits on a page, among that surah's ayahs there: all of them, from the first (start),
 * up to the last (end), or neither (middle).
 */
export function partOfPage(
  run: { from: number; to: number },
  page: number,
  edition: MushafEditionId = getMushafEdition(),
): PagePart {
  const sura = suraOf(run.from);
  const first = Math.max(firstAyahOfPage(page, edition), ayahKey(sura, 1));
  const last = Math.min(lastAyahOfPage(page, edition), ayahKey(sura, ayahCount(sura)));
  if (run.from <= first && run.to >= last) return 'whole';
  if (run.from <= first) return 'start';
  return run.to >= last ? 'end' : 'middle';
}

/** The first words of a page as printed (up to four, never part of a word), in the mushaf's script. '' for no page. */
export function firstWordsOfPage(page: number, edition: MushafEditionId = getMushafEdition()): string {
  if (!validPage(page)) return '';
  const table = firstWordsTable as { madani1405: string[]; madani1441: Record<string, string> };
  return (edition === 'madani1441' ? table.madani1441[String(page)] : undefined) ?? table.madani1405[page - 1];
}

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const partWord = (part: Exclude<PagePart, 'whole'>) =>
  t(part === 'start' ? 'lib.passages.partStart' : part === 'middle' ? 'lib.passages.partMiddle' : 'lib.passages.partEnd');

/** One page of a surah, without its name: "5th page", "last page"; '' for a surah of a page or less. */
function pageWords(sura: number, page: number, edition: MushafEditionId): string {
  const at = pageInSurah(page, sura, edition);
  if (!at || at.count <= 1) return '';
  return at.n === at.count ? t('lib.passages.lastPage') : t('lib.passages.nthPage', { nth: ordinal(at.n) });
}

/** A surah (or juz) and the pages of it: "Maryam, 5th page"; the name alone when there are no words. */
const inside = (name: string, words: string) => (words ? t('lib.passages.inSurah', { surah: name, part: words }) : name);

/** What a run inside one surah holds of it, without the surah's name, and where on the page when it is part of one. */
function pagesWithin(
  run: AyahRun,
  sura: number,
  edition: MushafEditionId,
): { words: string; part?: Exclude<PagePart, 'whole'> } {
  const fp = pageOfAyah(run.from, edition);
  const lp = pageOfAyah(run.to, edition);
  if (fp === lp) {
    const part = partOfPage(run, fp, edition);
    return { words: pageWords(sura, fp, edition), part: part === 'whole' ? undefined : part };
  }
  const count = lp - fp + 1;
  if (ayahOf(run.from) === 1) return { words: t('lib.passages.firstPages', { count }) };
  if (ayahOf(run.to) === ayahCount(sura)) return { words: t('lib.passages.lastPages', { count }) };
  const a = pageInSurah(fp, sura, edition)?.n ?? 1;
  const b = pageInSurah(lp, sura, edition)?.n ?? 1;
  return { words: t('lib.passages.nthToNth', { from: ordinal(a), to: ordinal(b) }) };
}

/** A run that begins or ends a juz, inside one surah and not at the surah's edge: "Juz 2, first 5 pages". */
function juzEdgeWords(run: AyahRun, sura: number, edition: MushafEditionId): string | null {
  if (ayahOf(run.from) === 1 || ayahOf(run.to) === ayahCount(sura)) return null;
  const fp = pageOfAyah(run.from, edition);
  const lp = pageOfAyah(run.to, edition);
  const j = getJuzForPage(fp);
  if (getJuzForPage(lp) !== j) return null;
  const count = lp - fp + 1;
  if (run.from === firstAyahOfPage(juzStart(j), edition)) {
    return inside(juzLabel(j, j), t('lib.passages.firstPages', { count }));
  }
  if (run.to === lastAyahOfPage(juzEnd(j), edition)) {
    return inside(juzLabel(j, j), t('lib.passages.lastPages', { count }));
  }
  return null;
}

/** A run of ayahs inside one surah, by its pages. */
function insideSurah(run: AyahRun, sura: number, form: PassageForm, wholeJuz: boolean, edition: MushafEditionId): string {
  const name = surahName(sura);
  if (form === 'short' && pageOfAyah(run.from, edition) !== pageOfAyah(run.to, edition)) {
    if (ayahOf(run.from) === 1) return t('lib.passages.startOf', { surah: name });
    if (ayahOf(run.to) === ayahCount(sura)) return t('lib.passages.endOf', { surah: name });
  }
  const within = pagesWithin(run, sura, edition);
  if (wholeJuz && !within.part) {
    const edge = juzEdgeWords(run, sura, edition);
    if (edge) return edge;
  }
  const named = inside(name, within.words);
  return within.part ? t('lib.passages.atPart', { place: named, part: partWord(within.part) }) : named;
}

/**
 * One page by itself. A page with two or more whole short surahs is named by them ("Ad-Duha to Ash-Sharh"); a page
 * holding two surahs by the one it opens with ("At-Tariq"), else the one that fills more of it ("Ta-Ha, 1st page").
 */
function pageName(page: number, edition: MushafEditionId, asPlace = false): string {
  const fills = new Map<number, number>();
  for (const [key, share] of ayahSharesOnPage(page, edition)) {
    fills.set(suraOf(key), (fills.get(suraOf(key)) ?? 0) + share);
  }
  const suras = [...fills.keys()];
  const whole = suras.filter((s) => pageInSurah(page, s, edition)?.count === 1);
  if (whole.length >= 2) {
    // A place is one point: where reading it begins, the first whole surah.
    if (asPlace) return surahName(whole[0]);
    return t('lib.passages.fromTo', { from: surahName(whole[0]), to: surahName(whole[whole.length - 1]) });
  }
  if (suras.length === 1 && whole.length === 1) return surahName(whole[0]);
  // A page that opens a surah goes by it, as "Starts at" does, so Home and the session name the page alike.
  const first = firstAyahOfPage(page, edition);
  const most =
    ayahOf(first) === 1 ? suraOf(first) : suras.reduce((best, s) => ((fills.get(s) ?? 0) > (fills.get(best) ?? 0) ? s : best));
  return inside(surahName(most), pageWords(most, page, edition));
}

/** A run named with ayah numbers: a verse being cited or played. `alone`: the only part named. */
function numberedPhrase(run: AyahRun, form: PassageForm, edition: MushafEditionId, alone: boolean): string {
  const f = { sura: suraOf(run.from), ayah: ayahOf(run.from) };
  const l = { sura: suraOf(run.to), ayah: ayahOf(run.to) };
  const a = surahName(f.sura);
  const b = surahName(l.sura);
  const startsSurah = f.ayah === 1;
  const endsSurah = l.ayah === ayahCount(l.sura);
  if (f.sura === l.sura) {
    if (startsSurah && endsSurah) return a;
    if (!alone || form === 'ayahsCompact') {
      return f.ayah === l.ayah
        ? t('lib.passages.surahAyah', { surah: a, ayah: f.ayah })
        : t('lib.passages.surahAyahs', { surah: a, from: f.ayah, to: l.ayah });
    }
    return f.ayah === l.ayah
      ? t('lib.passages.surahAyahLong', { surah: a, ayah: f.ayah })
      : t('lib.passages.surahAyahsLong', { surah: a, from: f.ayah, to: l.ayah });
  }
  const from = startsSurah ? a : t('lib.passages.surahAyah', { surah: a, ayah: f.ayah });
  const jb = getJuzForPage(pageOfAyah(run.to, edition));
  const endsJuz = run.to === lastAyahOfPage(juzEnd(jb), edition);
  const to = endsSurah
    ? b
    : endsJuz
      ? t('lib.passages.endOfJuz', { n: jb })
      : t('lib.passages.surahAyah', { surah: b, ayah: l.ayah });
  return t('lib.passages.fromTo', { from, to });
}

/** One end of a run across surahs, exactly: "Maryam, 5th page", or the surah when the run has all of it at that end. */
function exactEnd(key: number, whole: boolean, edition: MushafEditionId): string {
  const sura = suraOf(key);
  return whole ? surahName(sura) : inside(surahName(sura), pageWords(sura, pageOfAyah(key, edition), edition));
}

/**
 * One run of ayahs, in words; may begin "the start of" / "the end of". `alone`: the only part named (only the numbered
 * forms read differently in a list). A run of whole pages is the ayahs they hold.
 */
function ayahPhrase(
  run: AyahRun,
  form: PassageForm,
  wholeJuz: boolean,
  edition: MushafEditionId,
  alone = true,
  exact = false,
): string {
  const ja = getJuzForPage(pageOfAyah(run.from, edition));
  const jb = getJuzForPage(pageOfAyah(run.to, edition));
  const juz = juzAyahs(ja, jb, edition);
  if (wholeJuz && run.from === juz.from && run.to === juz.to) return juzLabel(ja, jb);
  if (citesAyahs(form)) return numberedPhrase(run, form, edition, alone);
  const fs = suraOf(run.from);
  const ls = suraOf(run.to);
  const startsSurah = ayahOf(run.from) === 1;
  const endsSurah = ayahOf(run.to) === ayahCount(ls);
  if (fs === ls) return startsSurah && endsSurah ? surahName(fs) : insideSurah(run, fs, form, wholeJuz, edition);
  const fp = pageOfAyah(run.from, edition);
  const onePage =
    fp === pageOfAyah(run.to, edition) &&
    run.from === firstAyahOfPage(fp, edition) &&
    run.to === lastAyahOfPage(fp, edition);
  if (onePage) return pageName(fp, edition);
  if (exact) {
    return t('lib.passages.fromTo', {
      from: exactEnd(run.from, startsSurah, edition),
      to: exactEnd(run.to, endsSurah, edition),
    });
  }
  return t('lib.passages.fromTo', { from: surahName(fs), to: surahName(ls) });
}

/** One run of pages, in words (ayahPhrase on the ayahs it holds). */
function runPhrase(run: Run, form: PassageForm, wholeJuz: boolean, edition: MushafEditionId, alone = true, exact = false): string {
  return ayahPhrase(ayahsOfRun(run, edition), form, wholeJuz, edition, alone, exact);
}

interface Part {
  run: AyahRun;
  juz?: [number, number];
}

/**
 * A run of a set (memorized ayahs, say) in parts: the whole juz inside it apart from what is left at either end
 * ("Juz 21–28 and Al-Mulk, first 2 pages"). Only when the run holds two whole juz or more, spans surahs and can't be
 * named by surahs alone: "At-Tahrim to An-Nas" stays as it is, and so does a run inside one surah.
 */
function runParts(run: AyahRun, wholeJuz: boolean, edition: MushafEditionId): Part[] {
  const whole: Part[] = [{ run }];
  if (!wholeJuz) return whole;
  const fs = suraOf(run.from);
  const ls = suraOf(run.to);
  if (fs === ls) return whole;
  if (ayahOf(run.from) === 1 && ayahOf(run.to) === ayahCount(ls)) return whole;
  // The whole pages inside the run: a juz can only be whole on them.
  const fp = pageOfAyah(run.from, edition);
  const lp = pageOfAyah(run.to, edition);
  const firstWhole = run.from === firstAyahOfPage(fp, edition) ? fp : fp + 1;
  const lastWhole = run.to === lastAyahOfPage(lp, edition) ? lp : lp - 1;
  if (lastWhole < firstWhole) return whole;
  let ja = getJuzForPage(firstWhole);
  if (juzStart(ja) < firstWhole) ja += 1;
  let jb = getJuzForPage(lastWhole);
  if (juzEnd(jb) > lastWhole) jb -= 1;
  if (jb - ja < 1) return whole;
  const juz = juzAyahs(ja, jb, edition);
  if (run.from === juz.from && run.to === juz.to) return whole;
  const parts: Part[] = [];
  const before = previousAyah(juz.from);
  const after = nextAyah(juz.to);
  if (run.from < juz.from && before != null) parts.push({ run: { from: run.from, to: before } });
  parts.push({ run: juz, juz: [ja, jb] });
  if (run.to > juz.to && after != null) parts.push({ run: { from: after, to: run.to } });
  return parts;
}

const andList = (parts: string[]) =>
  parts.length > 1
    ? t('lib.passages.listAnd', { list: parts.slice(0, -1).join(t('lib.passages.listSeparator')), last: parts[parts.length - 1] })
    : (parts[0] ?? '');

/** "Juz 28" for pages in one juz, "Juz 27–28" for two in a row; else null. */
function juzOfPages(pages: number[]): string | null {
  const js = [...new Set(pages.map(getJuzForPage))].sort((a, b) => a - b);
  if (js.length === 1) return juzLabel(js[0], js[0]);
  if (js.length === 2 && js[1] === js[0] + 1) return juzLabel(js[0], js[1]);
  return null;
}

/** Drops a leading "the " and capitalizes, unless the text goes mid-sentence. */
function finish(text: string, sentence: boolean | undefined): string {
  if (sentence || !text.startsWith('the ')) return text;
  const rest = text.slice(4);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * Pages in words, surah and juz first: "Juz 28", "Al-Mulk", "Maryam, 5th page", "Juz 2, first 5 pages",
 * "Adh-Dhariyat to Al-Hadid". See the top of this file for every shape and the options. '' for no pages.
 */
export function describePassage(pages: Iterable<number>, opts: PassageOptions = {}): string {
  const form = opts.form ?? 'long';
  const order = opts.order ?? 'mushaf';
  const wholeJuz = opts.wholeJuz ?? true;
  const edition = opts.edition ?? getMushafEdition();
  const max = Math.max(1, opts.max ?? 3);
  const list = [...pages].filter(validPage);
  const runs = runsOf(list, order);
  if (runs.length === 0) return '';

  const more = (parts: string[]) =>
    parts.length > max ? [...parts.slice(0, max - 1), t('lib.passages.more', { count: parts.length - max + 1 })] : parts;
  let text: string;
  if (order === 'given' && runs.length > 1) {
    text = more(runs.map((r) => runPhrase(r, form, wholeJuz, edition, false, opts.exact))).join(t('lib.passages.thenSeparator'));
  } else if (order === 'given') {
    text = runPhrase(runs[0], form, wholeJuz, edition, true, opts.exact);
  } else {
    text = partsText(runs.map((r) => ayahsOfRun(r, edition)), form, wholeJuz, edition, more, opts.exact);
  }

  if (opts.juz && !namesJuz(text)) {
    const juz = juzOfPages(list);
    if (juz) text = t('lib.passages.withJuz', { text, juz });
  }
  return finish(text, opts.sentence);
}

/** Runs of ayahs in mushaf order, joined "A, B and C", whole juz carved out (runParts). */
function partsText(
  runs: AyahRun[],
  form: PassageForm,
  wholeJuz: boolean,
  edition: MushafEditionId,
  more: (parts: string[]) => string[],
  exact = false,
): string {
  const parts = runs.flatMap((r) => runParts(r, wholeJuz, edition));
  const alone = parts.length === 1;
  return andList(
    more(parts.map((p) => (p.juz ? juzLabel(p.juz[0], p.juz[1]) : ayahPhrase(p.run, form, wholeJuz, edition, alone, exact)))),
  );
}

/**
 * Any ayahs, not only whole pages (sura × 1000 + ayah, lib/ayahKeys): "Al-Mulk, 1st page · start", "Al-Mulk to Al-Qalam",
 * "Juz 1–6, Juz 21–28 and Al-Mulk, first 2 pages". Named exactly as describePassage names the same ayahs: whole surahs and
 * juz by name, the rest by surah and page. Always in mushaf order. '' for none.
 */
export function describeAyahs(keys: Iterable<number>, opts: Omit<PassageOptions, 'order'> = {}): string {
  const form = opts.form ?? 'long';
  const wholeJuz = opts.wholeJuz ?? true;
  const edition = opts.edition ?? getMushafEdition();
  const max = Math.max(1, opts.max ?? 3);
  const runs = ayahRuns(keys);
  if (runs.length === 0) return '';
  const more = (parts: string[]) =>
    parts.length > max ? [...parts.slice(0, max - 1), t('lib.passages.more', { count: parts.length - max + 1 })] : parts;
  let text = partsText(runs, form, wholeJuz, edition, more, opts.exact);
  if (opts.juz && !namesJuz(text)) {
    const pages = runs.flatMap((r) => [pageOfAyah(r.from, edition), pageOfAyah(r.to, edition)]);
    const juz = juzOfPages(pages);
    if (juz) text = t('lib.passages.withJuz', { text, juz });
  }
  return finish(text, opts.sentence);
}

/** The partly memorized pages, each with its memorized ayahs (lib/memorizedAyahs partlyMemorizedAyahs). */
export type PartialPages = ReadonlyMap<number, readonly number[]>;

/**
 * Pages to revise in words, as describePassage names them, with a partly memorized page among them
 * named by its memorized ayahs (MEM-4): "Al-Kafirun to Al-Masad and An-Nas, then Al-Fatihah" when
 * only An-Nas is memorized on the last page. With no partly memorized page among them, exactly
 * describePassage. Every screen naming the pages of a revision day uses it (Home, the widget, Revo).
 */
export function describePagesToRevise(pages: Iterable<number>, partial: PartialPages, opts: PassageOptions = {}): string {
  const list = [...pages].filter(validPage);
  if (partial.size === 0 || !list.some((p) => partial.has(p))) return describePassage(list, opts);
  const edition = opts.edition ?? getMushafEdition();
  const ayahsOf = (ps: number[]) => ps.flatMap((p) => [...(partial.get(p) ?? ayahsOnPage(p, edition))]);
  const { order, juz, sentence, ...rest } = opts;
  if ((order ?? 'mushaf') === 'mushaf') return describeAyahs(ayahsOf(list), { ...rest, juz, sentence });
  // In the order given: each run of pages apart, joined ", then ", as describePassage does.
  const max = Math.max(1, opts.max ?? 3);
  const runs = runsOf(list, 'given').map((r) => describeAyahs(ayahsOf(Array.from({ length: r.last - r.first + 1 }, (_, i) => r.first + i)), { ...rest, max: 99 }));
  let text = (runs.length > max ? [...runs.slice(0, max - 1), t('lib.passages.more', { count: runs.length - max + 1 })] : runs).join(
    t('lib.passages.thenSeparator'),
  );
  if (juz && !namesJuz(text)) {
    const j = juzOfPages(list);
    if (j) text = t('lib.passages.withJuz', { text, juz: j });
  }
  return finish(text, sentence);
}

/** Where reading a page to revise begins: placeOfPage, or a partly memorized page's first memorized ayah (MEM-4). */
export function placeOfPageToRevise(page: number, partial: PartialPages, opts: Pick<PassageOptions, 'form' | 'edition'> = {}): string {
  const mine = partial.get(page);
  return mine && mine.length > 0 ? placeOfAyah(mine[0], opts) : placeOfPage(page, opts);
}

/** One range of pages, first to last (either order), in words: describePassage for that run. */
export function describePageRange(first: number, last: number, opts: PassageOptions = {}): string {
  const [a, b] = first <= last ? [first, last] : [last, first];
  if (!validPage(a) || !validPage(b)) return '';
  return describePassage(
    Array.from({ length: b - a + 1 }, (_, i) => a + i),
    { ...opts, order: 'mushaf' },
  );
}

/**
 * What a revision session covered (SESS-5): on the juz plan, when the pages it
 * revised for its own day (`revised`, by default `pages`) are whole juz in a row,
 * "Juz 29" or "Juz 28–29"; otherwise its surahs ("An-Najm to Al-Hadid").
 */
export function describeSession(
  pages: Iterable<number>,
  opts: Omit<PassageOptions, 'wholeJuz'> & { juzPlan?: boolean; revised?: Iterable<number> } = {},
): string {
  const { juzPlan, revised, ...rest } = opts;
  const list = [...pages];
  if (juzPlan) {
    const done = [...new Set([...(revised ?? list)].filter(validPage))].sort((a, b) => a - b);
    if (done.length > 0) {
      const ja = getJuzForPage(done[0]);
      const jb = getJuzForPage(done[done.length - 1]);
      if (done[0] === juzStart(ja) && done[done.length - 1] === juzEnd(jb) && done.length === juzEnd(jb) - juzStart(ja) + 1) {
        return juzLabel(ja, jb);
      }
    }
  }
  return describePassage(list, { ...rest, wholeJuz: false });
}

/**
 * Where reading a page begins, for "Starts at …", "Continue at …": the surah or juz when the page opens it
 * ("Al-Mujadila", "Juz 2"), else the page ("Al-Hadid, 2nd page"). firstWordsOfPage gives the line under it.
 */
export function placeOfPage(page: number, opts: Pick<PassageOptions, 'form' | 'edition'> = {}): string {
  if (!validPage(page)) return '';
  const edition = opts.edition ?? getMushafEdition();
  const first = firstAyahOfPage(page, edition);
  if (opts.form && citesAyahs(opts.form)) return placeOfAyah(first, opts);
  if (ayahOf(first) === 1) return surahName(suraOf(first));
  const juz = getJuzForPage(page);
  if (juzStart(juz) === page) return juzLabel(juz, juz);
  return pageName(page, edition, true);
}

/**
 * Where reading from an ayah begins (sura × 1000 + ayah, lib/ayahKeys): as placeOfPage when it opens its page or surah,
 * else the page and where on it ("Al-Mulk, 1st page · middle"). With an `ayahs` form, by number, to cite or play it
 * ("Al-Mulk, ayah 13"; 'ayahsCompact' "Al-Mulk 13").
 */
export function placeOfAyah(key: number, opts: Pick<PassageOptions, 'form' | 'edition'> = {}): string {
  const sura = suraOf(key);
  const ayah = ayahOf(key);
  if (sura < 1 || sura > 114) return '';
  const name = surahName(sura);
  if (ayah === 1) return name;
  if (opts.form === 'ayahsCompact') return t('lib.passages.surahAyah', { surah: name, ayah });
  if (opts.form === 'ayahs') return t('lib.passages.surahAyahLong', { surah: name, ayah });
  const edition = opts.edition ?? getMushafEdition();
  const page = pageOfAyah(key, edition);
  if (key === firstAyahOfPage(page, edition)) return placeOfPage(page, { edition });
  const part = partOfPage({ from: key, to: key }, page, edition);
  return t('lib.passages.atPart', {
    place: inside(name, pageWords(sura, page, edition)),
    part: partWord(part === 'end' ? 'end' : 'middle'),
  });
}

/**
 * The part of one surah some pages hold, for a row already named by the surah: "Whole surah", "5th page",
 * "First 3 pages", "Last page". Pages outside the surah add nothing; '' when none of it is there.
 */
export function partOfSurah(sura: number, pages: Iterable<number>, edition: MushafEditionId = getMushafEdition()): string {
  const count = ayahCount(sura);
  const spans: [number, number][] = [];
  for (const r of runsOf(pages, 'mushaf')) {
    const f = firstVerseOfPage(r.first, edition);
    const l = lastVerseOfPage(r.last, edition);
    if (f.sura > sura || l.sura < sura) continue;
    const a = f.sura < sura ? 1 : f.ayah;
    const b = l.sura > sura ? count : l.ayah;
    const last = spans[spans.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else spans.push([a, b]);
  }
  if (spans.length === 0) return '';
  if (spans.length === 1 && spans[0][0] === 1 && spans[0][1] === count) return t('lib.passages.wholeSurah');
  const parts = spans.map(([x, y]) => {
    const within = pagesWithin({ from: ayahKey(sura, x), to: ayahKey(sura, y) }, sura, edition);
    if (!within.part) return within.words;
    const where = partWord(within.part);
    return within.words ? t('lib.passages.atPart', { place: within.words, part: where }) : where;
  });
  return upperFirst(parts.join(t('lib.passages.listSeparator')));
}

/**
 * The page numbers, as a quiet detail after the words where they help:
 * "p. 542", "pp. 542–561", "pp. 595–604, 1–10" (at most three runs, then "…").
 */
export function pagesNote(pages: Iterable<number>, opts: Pick<PassageOptions, 'order'> = {}): string {
  const runs = runsOf(pages, opts.order ?? 'mushaf');
  if (runs.length === 0) return '';
  const span = (r: Run) => (r.first === r.last ? `${r.first}` : `${r.first}–${r.last}`);
  const one = runs.length === 1 && runs[0].first === runs[0].last;
  const shown = runs.slice(0, 3).map(span).join(', ');
  return `${one ? 'p.' : 'pp.'}${NBSP}${shown}${runs.length > 3 ? ', …' : ''}`;
}

/**
 * The two ends of a run of pages, for a strip's labels (Activity's day): the surahs it starts and ends
 * in ("Al-Mujadila", "At-Tahrim"), or, inside one surah, which of its pages ("21st page", "25th page").
 */
export function pageRunEnds(first: number, last: number, edition: MushafEditionId = getMushafEdition()): [string, string] {
  if (!validPage(first) || !validPage(last)) return ['', ''];
  const a = firstVerseOfPage(first, edition);
  const b = lastVerseOfPage(last, edition);
  if (a.sura !== b.sura) return [surahName(a.sura), surahName(b.sura)];
  const end = (page: number) => upperFirst(pageWords(a.sura, page, edition)) || surahName(a.sura);
  return [end(first), end(last)];
}

/** The text with ordinary spaces and hyphens (notifications, logs, tests). */
export function plainText(text: string): string {
  return text.split(NBSP).join(' ').split(NBHY).join('-');
}

/** How VoiceOver should read it: plain, "142–176" as "142 to 176", "p." as "page". */
export function spokenText(text: string): string {
  return plainText(text)
    .replace(/(\d)–(\d)/g, '$1 to $2')
    .replace(/\bpp\. /g, 'pages ')
    .replace(/\bp\. /g, 'page ');
}
