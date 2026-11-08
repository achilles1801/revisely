// How Revisely names a part of the Qur'an: by surah and juz, the way people
// memorize it, and almost never by page number (the owner, Nov 7 2026).
// "Your revision starts at page 288" means little; "Al-Baqarah" means a lot.
//
//   whole juz            Juz 28 · Juz 27–28
//   whole surah          Al-Mulk · Adh-Dhariyat to Al-Hadid
//   part of one surah    long    Al-Baqarah, ayahs 142–176
//                        compact Al-Baqarah 142–176 (sub-lines: the numbers without the word)
//                        short   Start of Al-Baqarah · End of Al-Baqarah · Al-Baqarah 142–176
//   across surahs        long  Al-Baqarah 253 to Ali 'Imran 92 (a bare name is the whole
//                              surah at that end; a number is the verse)
//                        short Al-Baqarah to Ali 'Imran
//   to a juz's end       long  Al-Baqarah 233 to the end of Juz 3 (when the juz ends mid-surah)
//   with the juz         Al-Hashr, ayahs 1–10 · Juz 28 (`juz: true`, when it adds something)
//   several parts        Juz 1–6, Juz 21–28 and Al-Mulk 1–12 (a set, in page order; two whole
//                        juz or more carved out where surahs alone would need ayah numbers),
//                        or a session's runs in its own order: "Ash-Shams to An-Nas, then …"
//   a session            describeSession: whole juz only on the juz plan (SESS-5)
//   a row named by its surah   ayahsInSurah: "Ayahs 142–252", "Whole surah"
//
// Every page of both prints ends at the end of a verse, so a page range is a
// verse range: its first page's first verse to its last page's last verse,
// read from src/data/pageVerses.json (scripts/build-page-verses.js). The two
// prints share page numbers, surah and juz starts; inside the 36 pages they
// draw differently the ayahs differ, so the chosen print is used unless named.
//
// Text comes ready for the screen: surah names hold together with no-break
// hyphens and spaces ("Al‑Baqarah" never breaks after "Al-"), and "Juz 28",
// "ayahs 142–176" with no-break spaces. `plainText` undoes that (notifications,
// tests), `spokenText` reads it for VoiceOver ("ayahs 142 to 176").

import pageVerseTable from '../data/pageVerses.json';
import { ayahOf, ayahRuns, firstAyahOfPage, lastAyahOfPage, nextAyah, pageOfAyah, previousAyah, suraOf } from './ayahKeys';
import { getMushafEdition, MushafEditionId } from './mushafEdition';
import { getJuzForPage, getJuzRange, getSurah, getSurahDisplay } from './quranData';

/** A no-break space. */
export const NBSP = ' ';
/** A no-break hyphen. */
export const NBHY = '‑';

export interface Verse {
  sura: number;
  ayah: number;
}

export type PassageForm = 'short' | 'compact' | 'long';

export interface PassageOptions {
  /**
   * 'long' (sentences, rows; the default), 'compact' (the same without ", ayahs": "Al-Mulk 1–12") or
   * 'short' (chips, chart labels): no ayah numbers at a surah's edge.
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

/** A surah's name, held together: "Al‑Baqarah", "Ali 'Imran" never break inside. */
export function surahName(sura: number): string {
  return (getSurah(sura)?.name ?? '').split('-').join(NBHY).split(' ').join(NBSP);
}

const juzLabel = (a: number, b: number) => (a === b ? `Juz${NBSP}${a}` : `Juz${NBSP}${a}–${b}`);
const juzStart = (j: number) => getJuzRange(j).start;
const juzEnd = (j: number) => getJuzRange(j).end;

interface Run {
  first: number;
  last: number;
}

/** Runs of consecutive pages. 'given' keeps first-seen order and joins descending steps too (the reverse plan). */
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

/**
 * One run of ayahs, in words; may begin "the start of" / "the end of". `alone`:
 * the only part named ("Al-Baqarah, ayahs 142–176"); in a list it loses the
 * comma ("Juz 21–28 and Al-Mulk 1–12"). A run of whole pages is the ayahs they hold.
 */
function ayahPhrase(run: AyahRun, form: PassageForm, wholeJuz: boolean, edition: MushafEditionId, alone = true): string {
  const ja = getJuzForPage(pageOfAyah(run.from, edition));
  const jb = getJuzForPage(pageOfAyah(run.to, edition));
  const juz = juzAyahs(ja, jb, edition);
  if (wholeJuz && run.from === juz.from && run.to === juz.to) return juzLabel(ja, jb);
  const f = { sura: suraOf(run.from), ayah: ayahOf(run.from) };
  const l = { sura: suraOf(run.to), ayah: ayahOf(run.to) };
  const a = surahName(f.sura);
  const b = surahName(l.sura);
  const startsSurah = f.ayah === 1;
  const endsSurah = l.ayah === ayahCount(l.sura);
  if (f.sura === l.sura) {
    if (startsSurah && endsSurah) return a;
    if (form === 'short') {
      if (startsSurah) return `the start of ${a}`;
      if (endsSurah) return `the end of ${a}`;
      return `${a}${NBSP}${f.ayah}–${l.ayah}`;
    }
    if (!alone || form === 'compact') return f.ayah === l.ayah ? `${a}${NBSP}${f.ayah}` : `${a}${NBSP}${f.ayah}–${l.ayah}`;
    return f.ayah === l.ayah ? `${a}, ayah${NBSP}${f.ayah}` : `${a}, ayahs${NBSP}${f.ayah}–${l.ayah}`;
  }
  if (form === 'short') return `${a} to ${b}`;
  const from = startsSurah ? a : `${a}${NBSP}${f.ayah}`;
  const endsJuz = run.to === lastAyahOfPage(juzEnd(jb), edition);
  const to = endsSurah ? b : endsJuz ? `the end of Juz${NBSP}${jb}` : `${b}${NBSP}${l.ayah}`;
  return `${from} to ${to}`;
}

/** One run of pages, in words (ayahPhrase on the ayahs it holds). */
function runPhrase(run: Run, form: PassageForm, wholeJuz: boolean, edition: MushafEditionId, alone = true): string {
  return ayahPhrase(ayahsOfRun(run, edition), form, wholeJuz, edition, alone);
}

interface Part {
  run: AyahRun;
  juz?: [number, number];
}

/**
 * A run of a set (memorized ayahs, say) in parts: the whole juz inside it apart
 * from what is left at either end ("Juz 21–28 and Al-Mulk 1–12"). Only when the
 * run holds two whole juz or more, spans surahs and can't be named by surahs
 * alone: "At-Tahrim to An-Nas" and "Adh-Dhariyat 7 to Al-Hadid" stay as they are,
 * and so does a run inside one surah ("Al-Baqarah, ayahs 127–269", not "the end
 * of Juz 1, Juz 2 and …").
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
  parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';

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
 * Pages in words, surah and juz first: "Juz 28", "Al-Mulk", "Al-Baqarah, ayahs
 * 142–176", "Adh-Dhariyat to Al-Hadid", "Al-Baqarah 253 to the end of Juz 3".
 * See the top of this file for every shape and the options. '' for no pages.
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
    parts.length > max ? [...parts.slice(0, max - 1), `${parts.length - max + 1} more`] : parts;
  let text: string;
  if (order === 'given' && runs.length > 1) {
    text = more(runs.map((r) => runPhrase(r, form, wholeJuz, edition, false))).join(', then ');
  } else if (order === 'given') {
    text = runPhrase(runs[0], form, wholeJuz, edition);
  } else {
    text = partsText(runs.map((r) => ayahsOfRun(r, edition)), form, wholeJuz, edition, more);
  }

  if (opts.juz && !text.includes(`Juz${NBSP}`)) {
    const juz = juzOfPages(list);
    if (juz) text = `${text} · ${juz}`;
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
): string {
  const parts = runs.flatMap((r) => runParts(r, wholeJuz, edition));
  const alone = parts.length === 1;
  return andList(more(parts.map((p) => (p.juz ? juzLabel(p.juz[0], p.juz[1]) : ayahPhrase(p.run, form, wholeJuz, edition, alone)))));
}

/**
 * Any ayahs in words, not only whole pages (sura × 1000 + ayah, lib/ayahKeys):
 * "Al-Mulk, ayahs 1–20", "Al-Mulk 27 to Al-Qalam 15", "Juz 1–6, Juz 21–28 and
 * Al-Mulk 1–20". Named exactly as describePassage names the same ayahs: whole
 * surahs and juz by name, the rest by surah and ayah. Always in mushaf order.
 * '' for none.
 */
export function describeAyahs(keys: Iterable<number>, opts: Omit<PassageOptions, 'order'> = {}): string {
  const form = opts.form ?? 'long';
  const wholeJuz = opts.wholeJuz ?? true;
  const edition = opts.edition ?? getMushafEdition();
  const max = Math.max(1, opts.max ?? 3);
  const runs = ayahRuns(keys);
  if (runs.length === 0) return '';
  const more = (parts: string[]) =>
    parts.length > max ? [...parts.slice(0, max - 1), `${parts.length - max + 1} more`] : parts;
  let text = partsText(runs, form, wholeJuz, edition, more);
  if (opts.juz && !text.includes(`Juz${NBSP}`)) {
    const pages = runs.flatMap((r) => [pageOfAyah(r.from, edition), pageOfAyah(r.to, edition)]);
    const juz = juzOfPages(pages);
    if (juz) text = `${text} · ${juz}`;
  }
  return finish(text, opts.sentence);
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
 * Where reading a page begins, for "Starts at …", "Continue at …": the surah when
 * the page opens it ("Al-Mujadila"), else its verse ("Al-Baqarah, ayah 142";
 * short "Al-Baqarah 142").
 */
export function placeOfPage(page: number, opts: Pick<PassageOptions, 'form' | 'edition'> = {}): string {
  if (!validPage(page)) return '';
  return placeOfAyah(firstAyahOfPage(page, opts.edition ?? getMushafEdition()), opts);
}

/**
 * Where reading from an ayah begins (sura × 1000 + ayah, lib/ayahKeys): the surah when it is its
 * first ayah ("An-Nas"), else the ayah ("Al-Mulk, ayah 13"; short "Al-Mulk 13").
 */
export function placeOfAyah(key: number, opts: Pick<PassageOptions, 'form'> = {}): string {
  const sura = suraOf(key);
  const ayah = ayahOf(key);
  if (sura < 1 || sura > 114) return '';
  const name = surahName(sura);
  if (ayah === 1) return name;
  return opts.form === 'short' ? `${name}${NBSP}${ayah}` : `${name}, ayah${NBSP}${ayah}`;
}

/**
 * The part of one surah some pages hold, for a row already named by the surah:
 * "Whole surah", "Ayahs 142–252", "Ayah 286", "Ayahs 1–5, 20–30". Pages outside
 * the surah add nothing; '' when none of it is there.
 */
export function ayahsInSurah(sura: number, pages: Iterable<number>, edition: MushafEditionId = getMushafEdition()): string {
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
  if (spans.length === 1 && spans[0][0] === 1 && spans[0][1] === count) return 'Whole surah';
  const one = spans.length === 1 && spans[0][0] === spans[0][1];
  return `${one ? 'Ayah' : 'Ayahs'}${NBSP}${spans.map(([x, y]) => (x === y ? `${x}` : `${x}–${y}`)).join(', ')}`;
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
