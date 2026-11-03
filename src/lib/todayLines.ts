// What Today's post says about today's pages, in two lines (the owner's
// choice "E", Nov 2026; mocks in ~/Documents/revisely-today-mocks):
//
//   not started   Starts at Al-Mujadila, p. 542 ›     20 pages · to At-Tahrim · Juz 28
//   in progress   Continue at Al-Hashr, p. 548 ›      ▬▬▭▭▭ 6 of 20
//   done          ● Done · 20 pages                   Adh-Dhariyat → Al-Hadid · Juz 27
//   two ranges    Starts at Ash-Shams, p. 595 ›       20 pages · then Al-Fatihah, p. 1
//   carried in    Starts at Al-Hadid, p. 538 ›        20 pages · 4 from yesterday first
//
// "Starts at" names the first surah on the page you open to; in progress, the
// first page not yet revised. Pages are read in the order the session serves
// them (the end of the cycle, then its start). "p. 542", "20 pages", "Juz 28"
// and the › are held together with no-break spaces, so the › never sits alone.
// The juz shows when the day spans one or two; two-range days say "then …".
// The exact ranges are in the › sheet's header.

import { getJuzForPage, getSurahsForPage } from './quranData';
import type { PageRun } from './pageRanges';

/** A no-break space: keeps "p. 542 ›" and "20 pages" together. */
export const NBSP = '\u00A0';
/** A no-break hyphen: a surah name never breaks at its "Al-". */
export const NBHY = '\u2011';

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

/** How VoiceOver should read a line: "page 542", "Al-Mujadila to At-Tahrim". */
export const spoken = (s: string) =>
  s.split(`p.${NBSP}`).join('page ').split(NBSP).join(' ').split(' → ').join(' to ').split(NBHY).join('-');

const pages = (n: number) => `${n}${NBSP}page${n === 1 ? '' : 's'}`;
const page = (p: number) => `p.${NBSP}${p}`;
/** A surah's name, held together ("Al‑Mujadila" never breaks after "Al-"). */
const held = (name: string | undefined) => (name ?? '').split('-').join(NBHY);
const firstSurah = (p: number) => held(getSurahsForPage(p)[0]?.name);
const lastSurah = (p: number) => {
  const all = getSurahsForPage(p);
  return held(all[all.length - 1]?.name);
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

/** A "→" held to the name before it: a line may end with it, never start with it. */
const to = (a: string, b: string) => `${a}${NBSP}→ ${b}`;

/** "Al-Mujadila → At-Tahrim", or one name when the run is inside one surah. */
function surahSpan(run: PageRun): string {
  const a = firstSurah(run.first);
  const b = lastSurah(run.last);
  return a === b ? a : to(a, b);
}

/** "Pages 542–561 · Al-Mujadila → At-Tahrim", "Pages 595–604, 1–10 · Ash-Shams → An-Nas, Al-Fatihah → Al-Baqarah". */
export function rangesText(list: number[]): string {
  const runs = runsInOrder(list);
  if (runs.length === 0) return '';
  const one = runs.length === 1 && runs[0].first === runs[0].last;
  const span = (r: PageRun) => (r.first === r.last ? `${r.first}` : `${r.first}–${r.last}`);
  const shown = runs.slice(0, 3);
  const more = runs.length > 3 ? ` and ${runs.length - 3} more` : '';
  return `${one ? 'Page' : 'Pages'} ${shown.map(span).join(', ')}${more} · ${shown.map(surahSpan).join(', ')}${more}`;
}

/**
 * Done today: the quiet line that opens the next revision day ("Tomorrow starts
 * at Al-Baqarah, p. 22 ›"). `lead` is "Tomorrow", or the weekday after that.
 */
export function aheadLine(lead: string, first: number): { text: string; label: string } {
  const text = `${lead} starts at ${firstSurah(first)}, ${page(first)}`;
  return { text, label: spoken(text) };
}

/**
 * Today's two lines from its pages (in session order), those revised today,
 * and how many of them were carried in from yesterday.
 */
export function todayLines(status: TodayStatus, list: number[], done: ReadonlySet<number>, carried = 0): TodayLines {
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
  const ranges = rangesText(ordered);
  const doneHere = ordered.filter((p) => done.has(p)).length;

  if (status === 'completed') {
    const title = `Done · ${pages(Math.max(done.size, total))}`;
    const span = runs.length === 1 ? surahSpan(runs[0]) : to(firstSurah(runs[0].first), lastSurah(runs[runs.length - 1].last));
    const juz = runs.length === 1 ? juzSpan(ordered) : null;
    const detail = [span, juz].filter(Boolean).join(' · ');
    return {
      title: { text: title, dot: true, chevron: false },
      detail: { kind: 'text', text: detail },
      ranges,
      label: spoken(`${title}. ${detail}`),
      empty: false,
      cta: 'Review session',
      solid: false,
    };
  }

  if (doneHere > 0) {
    const next = ordered.find((p) => !done.has(p)) ?? ordered[ordered.length - 1];
    const title = `Continue at ${firstSurah(next)}, ${page(next)}`;
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
  const title = `Starts at ${firstSurah(start)}, ${page(start)}`;
  let detail: string;
  if (carried > 0) {
    detail = `${pages(total)} · ${carried} from yesterday first`;
  } else if (runs.length > 1) {
    detail = `${pages(total)} · then ${firstSurah(runs[1].first)}, ${page(runs[1].first)}`;
  } else {
    const end = lastSurah(ordered[total - 1]);
    detail = [pages(total), end !== firstSurah(start) ? `to ${end}` : null, juzSpan(ordered)].filter(Boolean).join(' · ');
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
