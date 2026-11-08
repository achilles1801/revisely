// What Today's post says about today's pages, in two lines (the owner's
// choice "E", Nov 2026; mocks in ~/Documents/revisely-today-mocks):
//
//   not started   Starts at Al-Mujadila ›             20 pages · to At-Tahrim · Juz 28
//   in progress   Continue at Al-Hashr, ayah 10 ›     ▬▬▭▭▭ 6 of 20
//   done          ● Done · 20 pages                   Adh-Dhariyat → Al-Hadid · Juz 27
//   two ranges    Starts at Ash-Shams ›               20 pages · then Al-Fatihah
//   carried in    Starts at Al-Hadid, ayah 4 ›        20 pages · 4 from yesterday first
//
// "Starts at" names where the page you open to begins (lib/passages placeOfPage:
// the surah, or its ayah when the page begins mid-surah; surahs and juz first,
// page numbers almost never, the owner's rule of Nov 7 2026); in progress, the
// first page not yet revised. Pages are read in the order the session serves
// them (the end of the cycle, then its start). "ayah 10", "20 pages", "Juz 28"
// and the › are held together with no-break spaces, so the › never sits alone.
// The juz shows when the day spans one or two; two-range days say "then …".
// The exact ranges, with their page numbers, are in the › sheet's header.
// A partly memorized page among them (MEM-4) is named by its memorized ayahs:
// "Starts at An-Nas" when An-Nas is all that is memorized on the last page.

import { getJuzForPage, getSurahsForPage } from './quranData';
import type { PageRun } from './pageRanges';
import type { Leftovers } from './carryOver';
import { describeAyahs, describePassage, NBHY, NBSP, pagesNote, placeOfAyah, placeOfPage, spokenText } from './passages';
import { suraOf, type AyahKey } from './ayahKeys';
import { ayahsToRevise } from './memorizedAyahs';
import { getSurah } from './quranData';

/** The partly memorized pages, each with its memorized ayahs (lib/memorizedAyahs partlyMemorizedAyahs). */
export type PartialPages = ReadonlyMap<number, readonly AyahKey[]>;
const NONE: PartialPages = new Map();
const anyPartial = (list: readonly number[], partial: PartialPages) => partial.size > 0 && list.some((p) => partial.has(p));

/** A no-break space (keeps "ayah 10 ›" and "20 pages" together) and a no-break hyphen ("Al-" never ends a line). */
export { NBHY, NBSP };

/**
 * The catch-up offer, one line: "Missed yesterday · Revise At-Talaq to Al-Mulk"
 * (the pages' surahs, short: lib/passages). A day with some of its pages
 * revised reads "Left" instead of "Missed". Several days say how many
 * ("Missed 3 days"). Null when nothing is left over.
 */
export function catchUpLine(leftovers: Leftovers, partial: PartialPages = NONE): { title: string; label: string } | null {
  if (leftovers.pages.length === 0) return null;
  const opts = { form: 'short', sentence: true, max: 2 } as const;
  const what = anyPartial(leftovers.pages, partial)
    ? describeAyahs(ayahsToRevise(leftovers.pages, partial), opts)
    : describePassage(leftovers.pages, opts);
  const missed = leftovers.days.every((d) => d.missed);
  const when =
    leftovers.days.length === 1
      ? leftovers.days[0].ago === 1
        ? 'yesterday'
        : `${leftovers.days[0].ago} days ago`
      : `${leftovers.days.length} days`;
  const title = `${missed ? 'Missed' : 'Left'} ${when} · Revise ${what}`;
  return { title, label: spoken(title) };
}

export type TodayStatus = 'not_started' | 'partial' | 'completed';

export interface TodayLines {
  /** Line 1, in ink: the words, a done dot before them, a › after them. */
  title: { text: string; dot: boolean; chevron: boolean };
  /** Line 2: grey words, or how far today is (a thin bar and "6 of 20"). */
  detail: { kind: 'text'; text: string } | { kind: 'progress'; done: number; total: number };
  /** The › sheet's header: the exact pages and surahs. */
  ranges: string;
  /** Both lines, in words (VoiceOver). */
  label: string;
  /** Nothing to revise yet. */
  empty: boolean;
  cta: string;
  /** The button is solid (else an outline). */
  solid: boolean;
}

/** How VoiceOver should read a line: "Al-Mujadila to At-Tahrim", "ayahs 1 to 11", "pages 542 to 561". */
export const spoken = (s: string) => spokenText(s.split(`${NBSP}→ `).join(' → ').split(' → ').join(' to '));

const pages = (n: number) => `${n}${NBSP}page${n === 1 ? '' : 's'}`;
/** A surah's name, held together ("Al‑Mujadila" never breaks after "Al-"). */
const held = (name: string | undefined) => (name ?? '').split('-').join(NBHY);
const firstSurah = (p: number, partial: PartialPages = NONE) => {
  const mine = partial.get(p);
  return held(mine ? getSurah(suraOf(mine[0]))?.name : getSurahsForPage(p)[0]?.name);
};
const lastSurah = (p: number, partial: PartialPages = NONE) => {
  const mine = partial.get(p);
  if (mine) return held(getSurah(suraOf(mine[mine.length - 1]))?.name);
  const all = getSurahsForPage(p);
  return held(all[all.length - 1]?.name);
};
/** Where reading a page begins: its first ayah, or a partly memorized page's first memorized one. */
const placeOf = (p: number, partial: PartialPages) => {
  const mine = partial.get(p);
  return mine ? placeOfAyah(mine[0]) : placeOfPage(p);
};

/** Runs of consecutive pages, in the order given (the session's order). */
export function runsInOrder(list: number[]): PageRun[] {
  const runs: PageRun[] = [];
  for (const p of [...new Set(list)]) {
    const last = runs[runs.length - 1];
    if (last && p === last.last + 1) last.last = p;
    else runs.push({ first: p, last: p });
  }
  return runs;
}

/** "Juz 28", "Juz 27–28"; null for more than two (or none). */
export function juzSpan(list: number[]): string | null {
  const js = [...new Set(list.map(getJuzForPage))].sort((a, b) => a - b);
  if (js.length === 1) return `Juz${NBSP}${js[0]}`;
  if (js.length === 2) return `Juz${NBSP}${js[0]}–${js[1]}`;
  return null;
}

/** "Juz 28", or "Juz 27–28" for two in a row (as describePassage's `juz`); null otherwise. */
function nearJuz(list: number[]): string | null {
  const js = [...new Set(list.map(getJuzForPage))].sort((a, b) => a - b);
  if (js.length === 1) return `Juz${NBSP}${js[0]}`;
  if (js.length === 2 && js[1] === js[0] + 1) return `Juz${NBSP}${js[0]}–${js[1]}`;
  return null;
}

/** A "→" held to the name before it: a line may end with it, never start with it. */
const to = (a: string, b: string) => `${a}${NBSP}→ ${b}`;

/** "Al-Mujadila → At-Tahrim", or one name when the run is inside one surah. */
function surahSpan(run: PageRun, partial: PartialPages = NONE): string {
  const a = firstSurah(run.first, partial);
  const b = lastSurah(run.last, partial);
  return a === b ? a : to(a, b);
}

/**
 * The › sheet's header, the exact ranges: the surahs (with the juz when it helps),
 * then the page numbers as a quiet detail. "Al-Mujadila to At-Tahrim · Juz 28 ·
 * pp. 542–561", "Ash-Shams to An-Nas, then Al-Fatihah to Al-Baqarah 69 · pp. 595–604, 1–10".
 */
export function rangesText(list: number[], partial: PartialPages = NONE): string {
  if (list.length === 0) return '';
  const what = anyPartial(list, partial)
    ? // Each run in the session's order, its partly memorized pages by their ayahs.
      [
        runsInOrder(list)
          .map((r) => describeAyahs(ayahsToRevise(Array.from({ length: r.last - r.first + 1 }, (_, i) => r.first + i), partial), { wholeJuz: false }))
          .join(', then '),
        nearJuz(list),
      ]
        .filter(Boolean)
        .join(' · ')
    : describePassage(list, { order: 'given', juz: true, wholeJuz: false });
  return [what, pagesNote(list, { order: 'given' })].filter(Boolean).join(' · ');
}

/**
 * Done today: the quiet line that opens the next revision day ("Tomorrow starts
 * at Al-Baqarah, ayah 142 ›"). `lead` is "Tomorrow", or the weekday after that.
 */
export function aheadLine(lead: string, first: number, partial: PartialPages = NONE): { text: string; label: string } {
  const text = `${lead} starts at ${placeOf(first, partial)}`;
  return { text, label: spoken(text) };
}

/**
 * Today's two lines from its pages (in session order), those revised today,
 * how many of them were carried in from earlier days, and how many of those
 * are still to revise.
 */
export function todayLines(
  status: TodayStatus,
  list: number[],
  done: ReadonlySet<number>,
  carried = 0,
  carriedLeft = 0,
  partial: PartialPages = NONE,
): TodayLines {
  const ordered = [...new Set(list)];
  const total = ordered.length;
  if (total === 0) {
    const title = 'Nothing to revise yet';
    const detail = "Start by marking what you've memorized. Most people begin with Juz 30.";
    return {
      title: { text: title, dot: false, chevron: false },
      detail: { kind: 'text', text: detail },
      ranges: '',
      label: spoken(`${title}. ${detail}`),
      empty: true,
      cta: 'Mark memorized pages',
      solid: true,
    };
  }
  const runs = runsInOrder(ordered);
  const ranges = rangesText(ordered, partial);
  const doneHere = ordered.filter((p) => done.has(p)).length;

  if (status === 'completed') {
    // The day's done pages, the same set "Review session" lists (see doneOnDay).
    const title = `Done · ${pages(done.size)}`;
    const span =
      runs.length === 1
        ? surahSpan(runs[0], partial)
        : to(firstSurah(runs[0].first, partial), lastSurah(runs[runs.length - 1].last, partial));
    const juz = runs.length === 1 ? juzSpan(ordered) : null;
    const detail = [span, juz].filter(Boolean).join(' · ');
    return {
      title: { text: title, dot: true, chevron: false },
      detail: { kind: 'text', text: detail },
      ranges,
      label: spoken(`${title}. ${detail}`),
      empty: false,
      // Today is done, and pages added from earlier days are still to revise (SESS-6, SESS-7:
      // yesterday can be restored until today ends): the button goes on to them.
      cta: carriedLeft > 0 ? 'Continue revision' : 'Review session',
      solid: carriedLeft > 0,
    };
  }

  if (doneHere > 0) {
    const next = ordered.find((p) => !done.has(p)) ?? ordered[ordered.length - 1];
    const title = `Continue at ${placeOf(next, partial)}`;
    return {
      title: { text: title, dot: false, chevron: true },
      detail: { kind: 'progress', done: doneHere, total },
      ranges,
      label: spoken(`${title}. ${doneHere} of ${total} pages done`),
      empty: false,
      cta: 'Continue revision',
      solid: true,
    };
  }

  const start = ordered[0];
  const title = `Starts at ${placeOf(start, partial)}`;
  let detail: string;
  if (carried > 0) {
    detail = `${pages(total)} · ${carried} from yesterday first`;
  } else if (runs.length > 1) {
    detail = `${pages(total)} · then ${placeOf(runs[1].first, partial)}`;
  } else {
    const end = lastSurah(ordered[total - 1], partial);
    detail = [pages(total), end !== firstSurah(start, partial) ? `to ${end}` : null, juzSpan(ordered)].filter(Boolean).join(' · ');
  }
  return {
    title: { text: title, dot: false, chevron: true },
    detail: { kind: 'text', text: detail },
    ranges,
    label: spoken(`${title}. ${detail}`),
    empty: false,
    cta: 'Start revision',
    solid: true,
  };
}
