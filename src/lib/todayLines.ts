// What Today's post says about today's pages, in two lines (the owner's
// choice "E", Nov 2026; mocks in ~/Documents/revisely-today-mocks):
//
//   not started   Starts at Al-Mujadila  Change             20 pages · to At-Tahrim · Juz 28
//   in progress   Continue at Al-Hashr, 3rd page  Change    ▬▬▭▭▭ 6 of 20
//   done          ● Done · 20 pages                         Adh-Dhariyat → Al-Hadid · Juz 27
//   two ranges    Starts at Ash-Shams  Change               20 pages · then Al-Fatihah
//   carried in    Starts at Al-Hadid, 2nd page  Change      20 pages · 4 from yesterday first
//
// "Starts at" names where the page you open to begins (lib/passages placeOfPage:
// the surah or juz it opens, else which page of the surah, NAME-1); in progress,
// the first page not yet revised. Pages are read in the order the session serves
// them (the end of the cycle, then its start). "3rd page", "20 pages", "Juz 28"
// and "Change" (HOME-3: it opens Jump to) are held together with no-break spaces, so "Change" never sits alone.
// The juz shows when the day spans one or two; two-range days say "then …".
// A partly memorized page among them (MEM-4) is named by what is memorized of it:
// "Starts at An-Nas" when An-Nas is all that is memorized on the last page.

import { getJuzForPage, getSurahsForPage } from './quranData';
import type { PageRun } from './pageRanges';
import type { Leftovers } from './carryOver';
import { describePagesToRevise, firstWordsOfPlace, NBHY, NBSP, placeOfPageToRevise, spokenText, surahNameIn, type PartialPages } from './passages';
import { suraOf } from './ayahKeys';
import { t } from '../i18n';

export type { PartialPages };
const NONE: PartialPages = new Map();

/** A no-break space (keeps "ayah 10 ›" and "20 pages" together) and a no-break hyphen ("Al-" never ends a line). */
export { NBHY, NBSP };

/**
 * The catch-up offer, one line: "Missed yesterday · Revise At-Talaq to Al-Mulk"
 * (the pages' surahs, short: lib/passages). A day with some of its pages
 * revised reads "Left" instead of "Missed". Several days say how many
 * ("Missed 3 days"). Null when nothing is left over.
 */
export function catchUpLine(
  leftovers: Leftovers,
  partial: PartialPages = NONE,
  { quiet = false }: { quiet?: boolean } = {},
): { title: string; label: string } | null {
  if (leftovers.pages.length === 0) return null;
  const what = describePagesToRevise(leftovers.pages, partial, { form: 'short', sentence: true, max: 2 });
  const missed = leftovers.days.every((d) => d.missed);
  const when =
    leftovers.days.length === 1
      ? leftovers.days[0].ago === 1
        ? t('lib.today.yesterday')
        : t('lib.today.daysAgo', { count: leftovers.days[0].ago })
      : t('lib.today.days', { count: leftovers.days.length });
  // Quiet (HOME-5): the grey line under the Today post's button, its "Add to today" after it, so no "Revise".
  const title = quiet
    ? missed
      ? t('lib.today.missedQuiet', { when, what })
      : t('lib.today.leftQuiet', { when, what })
    : missed
      ? t('lib.today.missed', { when, what })
      : t('lib.today.left', { when, what });
  return { title, label: spoken(title) };
}

export type TodayStatus = 'not_started' | 'partial' | 'completed';

export interface TodayLines {
  /** Line 1, in ink: the words, a done dot before them, "Change" after them (`chevron`, HOME-3). */
  title: { text: string; dot: boolean; chevron: boolean };
  /** Under the title, how the page you open to begins (NAME-2); none when it opens a surah or juz, or is part-memorized. */
  words?: string;
  /** Line 2: grey words, or how far today is (a thin bar and "6 of 20"). */
  detail: { kind: 'text'; text: string } | { kind: 'progress'; done: number; total: number };
  /**
   * Line 2 for Home's ring (HOME-10, Revisely Dev), where the ring holds how many pages: the detail without the count
   * ("to Al-Mursalat · Juz 29", "then Al-Fatihah", "4 from yesterday first"; once started, the day's juz). May be empty.
   */
  brief: string;
  /** How many pages today has, in the session (0 on a rest day or with nothing memorized): the ring's count (HOME-10). */
  total: number;
  /** Both lines, in words (VoiceOver). */
  label: string;
  /** Nothing to revise yet, or a rest day: no pages today, so no "Change". */
  empty: boolean;
  /** A rest day (HOME-9): no pages today, with pages memorized. Its detail says where the next revision day starts. */
  rest?: boolean;
  cta: string;
  /** The button is solid (else an outline). */
  solid: boolean;
}

/** How VoiceOver should read a line: "Al-Mujadila to At-Tahrim", "ayahs 1 to 11", "pages 542 to 561". */
export const spoken = (s: string) => {
  const arrow = t('lib.today.arrow');
  return spokenText(s.split(`${NBSP}${arrow} `).join(` ${arrow} `).split(` ${arrow} `).join(` ${t('lib.today.toWord')} `));
};

const pages = (n: number) => t('lib.today.pages', { count: n });
/** A surah's name in the app's language, held together ("Al‑Mujadila" never breaks after "Al-"). */
const named = (sura: number | undefined) => (sura ? surahNameIn(sura).split('-').join(NBHY) : '');
const firstSurah = (p: number, partial: PartialPages = NONE) => {
  const mine = partial.get(p);
  return named(mine ? suraOf(mine[0]) : getSurahsForPage(p)[0]?.number);
};
const lastSurah = (p: number, partial: PartialPages = NONE) => {
  const mine = partial.get(p);
  if (mine) return named(suraOf(mine[mine.length - 1]));
  const all = getSurahsForPage(p);
  return named(all[all.length - 1]?.number);
};
/** Where reading a page begins: its first ayah, or a partly memorized page's first memorized one. */
const placeOf = (p: number, partial: PartialPages) => placeOfPageToRevise(p, partial);
const wordsOf = (p: number, partial: PartialPages) => (partial.has(p) ? undefined : firstWordsOfPlace(p) || undefined);

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
  if (js.length === 1) return t('lib.today.juz', { n: js[0] });
  if (js.length === 2) return t('lib.today.juzRange', { from: js[0], to: js[1] });
  return null;
}

/** A "→" held to the name before it: a line may end with it, never start with it. */
const to = (a: string, b: string) => `${a}${NBSP}${t('lib.today.arrow')} ${b}`;

/** "Al-Mujadila → At-Tahrim", or one name when the run is inside one surah. */
function surahSpan(run: PageRun, partial: PartialPages = NONE): string {
  const a = firstSurah(run.first, partial);
  const b = lastSurah(run.last, partial);
  return a === b ? a : to(a, b);
}

/**
 * Done today: the quiet line that opens the next revision day ("Tomorrow starts
 * at Juz 2 ›"). `lead` is "Tomorrow", or the weekday after that.
 */
export function aheadLine(lead: string, first: number, partial: PartialPages = NONE): { text: string; label: string } {
  const text = t('lib.today.startsAtAhead', { lead, place: placeOf(first, partial) });
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
  /** How many of the carried pages came from Insights ("Revise these first tomorrow"); the rest are leftovers. */
  carriedInsights = 0,
  /**
   * With no pages today: whether any page is memorized, and the next revision day ("Tomorrow", its first page). With
   * pages memorized the day is a rest day in the plan (HOME-9), never "Nothing to revise yet".
   */
  rest: { memorized: boolean; next?: { lead: string; first: number } | null } = { memorized: false },
): TodayLines {
  const ordered = [...new Set(list)];
  const total = ordered.length;
  if (total === 0 && rest.memorized) {
    // Majd, Nov 27 2026, on a rest day of his plan: "telling me to mark memorized pages when i already have memorized
    // pages marked?" The day says it rests, where the next one starts, and offers that day (an outline: resting is fine).
    const title = t('lib.today.restTitle');
    const next = rest.next ?? null;
    const detail = next ? t('lib.today.startsAtAhead', { lead: next.lead, place: placeOf(next.first, partial) }) : t('lib.today.restDetail');
    return {
      title: { text: title, dot: false, chevron: false },
      detail: { kind: 'text', text: detail },
      brief: detail,
      total,
      label: spoken(t('lib.today.titleDetail', { title, detail })),
      empty: true,
      rest: true,
      cta: next ? t('lib.today.reviseAheadCta') : '',
      solid: false,
    };
  }
  if (total === 0) {
    const title = t('lib.today.nothingTitle');
    const detail = t('lib.today.nothingDetail');
    return {
      title: { text: title, dot: false, chevron: false },
      detail: { kind: 'text', text: detail },
      brief: detail,
      total,
      label: spoken(t('lib.today.titleDetail', { title, detail })),
      empty: true,
      cta: t('lib.today.markCta'),
      solid: true,
    };
  }
  const runs = runsInOrder(ordered);
  const doneHere = ordered.filter((p) => done.has(p)).length;

  if (status === 'completed') {
    // The day's done pages, the same set "Review session" lists (see doneOnDay).
    const title = t('lib.today.done', { pages: pages(done.size) });
    const span =
      runs.length === 1
        ? surahSpan(runs[0], partial)
        : to(firstSurah(runs[0].first, partial), lastSurah(runs[runs.length - 1].last, partial));
    const juz = runs.length === 1 ? juzSpan(ordered) : null;
    const detail = [span, juz].filter(Boolean).join(' · ');
    return {
      title: { text: title, dot: true, chevron: false },
      detail: { kind: 'text', text: detail },
      brief: detail,
      total,
      label: spoken(t('lib.today.titleDetail', { title, detail })),
      empty: false,
      // Today is done, and pages added from earlier days are still to revise (SESS-6, SESS-7:
      // yesterday can be restored until today ends): the button goes on to them.
      cta: carriedLeft > 0 ? t('lib.today.continueCta') : t('lib.today.reviewCta'),
      solid: carriedLeft > 0,
    };
  }

  if (doneHere > 0) {
    const next = ordered.find((p) => !done.has(p)) ?? ordered[ordered.length - 1];
    const title = t('lib.today.continueAt', { place: placeOf(next, partial) });
    return {
      title: { text: title, dot: false, chevron: true },
      words: wordsOf(next, partial),
      detail: { kind: 'progress', done: doneHere, total },
      brief: juzSpan(ordered) ?? '',
      total,
      label: spoken(t('lib.today.progressLabel', { title, done: doneHere, total })),
      empty: false,
      cta: t('lib.today.continueCta'),
      solid: true,
    };
  }

  const start = ordered[0];
  const title = t('lib.today.startsAt', { place: placeOf(start, partial) });
  let detail: string;
  let brief: string;
  if (carried > 0) {
    // "2 from Insights first", "4 from yesterday first", or both: "2 from Insights, 5 from yesterday first".
    const insights = Math.min(carriedInsights, carried);
    const left = carried - insights;
    const from =
      insights === 0
        ? t('lib.today.fromYesterday', { count: carried })
        : left === 0
          ? t('lib.today.fromInsights', { count: carried })
          : t('lib.today.fromBoth', { insights, left });
    detail = t('lib.today.first', { pages: pages(total), from });
    brief = t('lib.today.firstOnly', { from });
  } else if (runs.length > 1) {
    detail = t('lib.today.then', { pages: pages(total), place: placeOf(runs[1].first, partial) });
    brief = t('lib.today.thenOnly', { place: placeOf(runs[1].first, partial) });
  } else {
    const end = lastSurah(ordered[total - 1], partial);
    const rest = [end !== firstSurah(start, partial) ? t('lib.today.toEnd', { end }) : null, juzSpan(ordered)].filter(Boolean);
    detail = [pages(total), ...rest].join(' · ');
    brief = rest.join(' · ');
  }
  return {
    title: { text: title, dot: false, chevron: true },
    words: wordsOf(start, partial),
    detail: { kind: 'text', text: detail },
    brief,
    total,
    label: spoken(t('lib.today.titleDetail', { title, detail })),
    empty: false,
    cta: t('lib.today.startCta'),
    solid: true,
  };
}
