// The juz sheet's figures (mocks i5 and i6, Nov 7 2026): one juz, opened from a Coverage tile, the
// untouched row, or a day's Revised block. With Smart Tracking it shows strength (ACT-8); without it no
// page is rated, so it shows recency instead (ACT-19): when each part was last revised and how often.
// Pure: the sheet (components/activity/JuzSheet) draws what this returns.

import { getJuzForPage, getJuzRange, getSurahsForPage } from './quranData';
import { ayahOf, ayahsOnPage, pageOfAyah, suraOf } from './ayahKeys';
import { memorizedAyahsOnPage, pageShare } from './memorizedAyahs';
import { coverageRecency, coverageSince, daysSince, lastRevisedWords, recencyLine, timesWord } from './recency';
import { describeSurahs } from './pageRanges';
import { describeAyahs, pageRunEnds, surahName } from './passages';
import { strengthOf, type Strength } from './activityDayParts';

/** How recently a memorized page was revised: the Coverage tiles' bands (ACT-4); `new`: not revised yet (ACT-25). */
export type Recency = 'week' | 'month' | 'new' | 'older';

/** A page of the juz. `learning`: partly memorized (`in_progress`), drawn filled by its share (MEM-7). */
export type JuzCellState = 'not-memorized' | 'learning' | Strength | Recency;

export interface JuzSheetPage {
  pageNumber: number;
  status: string;
  weaknessRating?: number;
  lastRevisedDate?: string | null;
  skipCount?: number;
  /** A page in part: its memorized ayahs (MEM-1). */
  verses?: number[] | null;
  /** When it was memorized: a page never revised counts from then (ACT-25). */
  dateMemorized?: string | null;
}

export interface JuzSheetInput {
  juz: number;
  today: string;
  /** The account's pages (the juz's are read from them). */
  pages: JuzSheetPage[];
  /** Revision items covering at least the window: each page on the day it was revised (`day`; AHEAD-6). */
  revised: { day?: string; countsFor: string; pages: number[] }[];
  /** The window "times" are counted over (30: "4 times in 30 days"). */
  windowDays: number;
  /** Its words ("in 30 days", "since 9 September"); `in ${windowDays} days` when not given. */
  windowWords?: string;
  /** "in the last 30 days", "since 9 September": what "not …" says when a part wasn't revised in it. */
  windowInTheLast?: string;
  smartTracking: boolean;
  /** The account's first day: a page never revised counts from it when that is later (ACT-25). */
  firstDay?: string | null;
}

export interface JuzSurahRow {
  sura: number;
  name: string;
  /** Its first page in this juz (the reader opens there). */
  firstPage: number;
  /** "Ayahs 17–24 weak", "Strong · skipped 3 times" (strength); "Last revised 3 days ago · twice in 30 days" (recency). */
  text: string;
  /** Strength's weak rows are drawn in red; recency's stale ones too. */
  alert: boolean;
  /** The dot before the name: the row's strength or recency, or none when not memorized. */
  state: JuzCellState;
}

export interface JuzSheetModel {
  juz: number;
  title: string;
  /** "Al-Mujadila to At-Tahrim". */
  subtitle: string;
  /** "Last revised today", "Last revised 41 days ago", "Never revised", "Not memorized yet" (lib/recency). */
  headline: string;
  /** "twice in 30 days", "not in the last 30 days"; empty when nothing of it is memorized or ever revised. */
  times: string;
  /** Over 30 days since a memorized page of it was revised, or one never was in the 30+ days on record (the untouched juz). */
  stale: boolean;
  /** `share`: how much of a page being learned is memorized, 0–1 (MEM-7); absent for the rest. */
  cells: { page: number; state: JuzCellState; share?: number }[];
  /** The strip's two ends, by surah. */
  ends: [string, string];
  /** Strength's counts (with Smart Tracking) or recency's, over the memorized pages. */
  counts: { state: Strength | Recency; n: number }[];
  surahs: JuzSurahRow[];
  memorizedPages: number[];
  /** Pages being learned (in part, MEM-7). */
  learning: number[];
  /** Begun but not revised yet: the headline is "Being learned", with `learningText` beside it. */
  beingLearned: boolean;
  /** "Al-Mulk 1–20 so far": what of the surahs being learned is memorized here; null with none. */
  learningText: string | null;
  /** The first ayah not memorized on a page being learned: "Al-Mulk 21", and its page. */
  continueAt: { page: number; label: string } | null;
}

/** "3 times" for a count of skips (recency's "once", "twice" are for revisions: lib/recency). */
const skipsWord = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;

/** A memorized page's band; never revised, it is `new` for 30 days from `since` (lib/recency coverageRecency). */
export function recencyOf(lastDay: string | null | undefined, today: string, since?: string | null): Recency {
  const where = coverageRecency(lastDay, since, today);
  return where === 'stale' ? 'older' : where;
}

/** Ayah numbers' first run: "17–24" ("5"), and ", …" when more follow. */
function firstRun(nums: number[]): { text: string; one: boolean } {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  let end = 0;
  while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
  const more = end + 1 < sorted.length ? ', …' : '';
  return sorted[0] === sorted[end] ? { text: `${sorted[0]}${more}`, one: true } : { text: `${sorted[0]}–${sorted[end]}${more}`, one: false };
}

/** The ayahs of some pages inside one surah, as "Ayahs 17–24" ("Ayah 5"); a second run is "…". */
function ayahsIn(sura: number, pages: number[]): string {
  const keys = pages.flatMap((p) => ayahsOnPage(p)).filter((k) => suraOf(k) === sura).map(ayahOf);
  if (keys.length === 0) return '';
  const run = firstRun(keys);
  return `${run.one ? 'Ayah' : 'Ayahs'} ${run.text}`;
}

const ORDER: Record<Strength, number> = { weak: 0, moderate: 1, strong: 2 };

export function juzSheetModel(input: JuzSheetInput): JuzSheetModel {
  const { juz, today, windowDays, smartTracking } = input;
  const { start, end } = getJuzRange(juz);
  const juzPages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const byNumber = new Map(input.pages.map((p) => [p.pageNumber, p]));
  const memorized = juzPages.filter((p) => byNumber.get(p)?.status === 'memorized');
  const learning = juzPages.filter((p) => byNumber.get(p)?.status === 'in_progress');
  const memorizedSet = new Set(memorized);

  // Each page's last revision: the latest of its own record and the items read.
  const last = new Map<number, string>();
  for (const p of memorized) {
    // A page's record is a timestamp in the app ("2026-11-02T09:00:00.000Z"): its day is what counts.
    const own = byNumber.get(p)?.lastRevisedDate;
    if (own) last.set(p, own.slice(0, 10));
  }
  // Days in the window each page was revised (a page counts once a day).
  const inWindow = new Map<number, Set<string>>();
  for (const r of input.revised) {
    // The day it was revised: pages revised ahead or caught up count that day (AHEAD-6).
    const on = r.day ?? r.countsFor;
    const age = daysSince(on, today);
    if (age < 0) continue;
    for (const p of r.pages) {
      if (!memorizedSet.has(p)) continue;
      const prev = last.get(p);
      if (prev == null || on > prev) last.set(p, on);
      if (age < windowDays) {
        const days = inWindow.get(p) ?? new Set<string>();
        days.add(on);
        inWindow.set(p, days);
      }
    }
  }
  const daysOf = (pages: number[]) => new Set(pages.flatMap((p) => [...(inWindow.get(p) ?? [])])).size;
  const lastOf = (pages: number[]): number | null => {
    let newest: string | null = null;
    for (const p of pages) {
      const d = last.get(p);
      if (d && (newest == null || d > newest)) newest = d;
    }
    return newest ? daysSince(newest, today) : null;
  };
  // A page never revised counts from when it was memorized, or the account's first day (ACT-25).
  const sinceOf = (p: number) => coverageSince(byNumber.get(p)?.dateMemorized, input.firstDay);
  const bandOf = (p: number) => recencyOf(last.get(p), today, sinceOf(p));
  // The juz is as stale as its least recently revised memorized page (the untouched row, ACT-4).
  const staleByDays = memorized.some((p) => bandOf(p) === 'older');

  // Being learned (MEM-7): the surahs with ayahs memorized on a page in part, and what of them is
  // memorized on the juz's pages, whole or in part.
  const ayahsHere = (p: number) => {
    const pg = byNumber.get(p);
    return pg ? memorizedAyahsOnPage({ pageNumber: p, status: pg.status as 'memorized', verses: pg.verses }) : [];
  };
  const learningSuras = new Set(learning.flatMap((p) => ayahsHere(p).map(suraOf)));
  const learned = new Set(juzPages.flatMap(ayahsHere).filter((k) => learningSuras.has(suraOf(k))));
  const learningText = learned.size > 0 ? `${describeAyahs(learned, { form: 'compact' })} so far` : null;
  let continueAt: JuzSheetModel['continueAt'] = null;
  for (const p of learning) {
    const mine = new Set(ayahsHere(p));
    const next = ayahsOnPage(p).find((k) => !mine.has(k));
    if (next != null) {
      continueAt = { page: p, label: `${surahName(suraOf(next))} ${ayahOf(next)}` };
      break;
    }
  }
  // A juz begun (ayahs memorized on a page in part) but not revised yet reads as being learned, not
  // as untouched. A page marked in progress with no ayahs saved has nothing memorized yet.
  const newest = lastOf(memorized);
  const beingLearned = learned.size > 0 && newest == null;
  const stale = staleByDays && !beingLearned;

  // One wording with Revo (lib/recency): "Last revised 3 days ago · twice in 30 days".
  const inWords = input.windowWords ?? `in ${windowDays} days`;
  const inTheLast = input.windowInTheLast ?? `in the last ${windowDays} days`;
  const timesText = (n: number) => (n > 0 ? `${timesWord(n)} ${inWords}` : `not ${inTheLast}`);
  const recency = (ago: number | null, n: number) =>
    input.windowWords ? (ago == null ? lastRevisedWords(null) : `${lastRevisedWords(ago)} · ${timesText(n)}`) : recencyLine(ago, n, windowDays);

  const strength = (p: number): Strength => strengthOf(byNumber.get(p)?.weaknessRating ?? 4);
  const cellState = (p: number): JuzCellState =>
    !memorizedSet.has(p)
      ? byNumber.get(p)?.status === 'in_progress'
        ? 'learning'
        : 'not-memorized'
      : smartTracking
        ? strength(p)
        : bandOf(p);
  const cells = juzPages.map((page) => {
    const state = cellState(page);
    if (state !== 'learning') return { page, state };
    const pg = byNumber.get(page)!;
    return { page, state, share: pageShare({ pageNumber: page, status: 'in_progress', verses: pg.verses }) };
  });

  const kinds: (Strength | Recency)[] = smartTracking ? ['weak', 'moderate', 'strong'] : ['week', 'month', 'new', 'older'];
  const counts = kinds.map((state) => ({ state, n: cells.filter((c) => c.state === state).length })).filter((c) => c.n > 0);

  // One row per surah the juz holds, in order.
  const suras: number[] = [];
  const pagesOfSura = new Map<number, number[]>();
  for (const p of juzPages) {
    for (const s of getSurahsForPage(p)) {
      if (!pagesOfSura.has(s.number)) {
        suras.push(s.number);
        pagesOfSura.set(s.number, []);
      }
      pagesOfSura.get(s.number)!.push(p);
    }
  }
  const surahs: JuzSurahRow[] = suras.map((sura) => {
    const pages = pagesOfSura.get(sura)!;
    const mine = pages.filter((p) => memorizedSet.has(p));
    const base = { sura, name: surahName(sura), firstPage: pages[0] };
    if (learningSuras.has(sura)) {
      // Being learned: what is memorized of it here, and what is to go (MEM-7).
      const all = [...new Set(pages.flatMap((p) => ayahsOnPage(p)).filter((k) => suraOf(k) === sura))].sort((a, b) => a - b);
      const done = all.filter((k) => learned.has(k));
      const toGo = all.filter((k) => !learned.has(k));
      const doneRun = firstRun(done.map(ayahOf));
      const text = [`${doneRun.one ? 'Ayah' : 'Ayahs'} ${doneRun.text}`, toGo.length > 0 ? `${firstRun(toGo.map(ayahOf)).text} to go` : null]
        .filter(Boolean)
        .join(' · ');
      return { ...base, firstPage: toGo.length > 0 ? pageOfAyah(toGo[0]) : base.firstPage, text, alert: false, state: 'learning' as const };
    }
    if (mine.length === 0) {
      const partly = pages.some((p) => byNumber.get(p)?.status === 'in_progress');
      return { ...base, text: 'Not memorized', alert: false, state: partly ? ('learning' as const) : ('not-memorized' as const) };
    }
    if (smartTracking) {
      const weakest = mine.reduce<Strength>((w, p) => (ORDER[strength(p)] < ORDER[w] ? strength(p) : w), 'strong');
      if (weakest !== 'strong') {
        const at = ayahsIn(sura, mine.filter((p) => strength(p) === weakest));
        return { ...base, text: `${at} ${weakest}`.trim(), alert: weakest === 'weak', state: weakest };
      }
      const skips = mine.reduce((n, p) => n + (byNumber.get(p)?.skipCount ?? 0), 0);
      return { ...base, text: skips > 0 ? `Strong · skipped ${skipsWord(skips)}` : 'Strong', alert: false, state: 'strong' as const };
    }
    const ago = lastOf(mine);
    const n = daysOf(mine);
    // Never revised yet, and none of it 30+ days on record: not revised yet, not stale (ACT-25).
    if (ago == null && !mine.some((p) => bandOf(p) === 'older')) return { ...base, text: 'Not revised yet', alert: false, state: 'new' as const };
    const state: Recency = ago == null || ago >= 30 ? 'older' : ago < 7 ? 'week' : 'month';
    return { ...base, text: recency(ago, n), alert: state === 'older', state };
  });

  return {
    juz,
    title: `Juz ${juz}`,
    subtitle: describeSurahs({ first: start, last: end }),
    headline: beingLearned
      ? 'Being learned'
      : memorized.length === 0
        ? 'Not memorized yet'
        : newest == null && !stale
          ? 'Not revised yet'
          : lastRevisedWords(newest),
    times: memorized.length === 0 || newest == null || beingLearned ? '' : timesText(daysOf(memorized)),
    stale,
    cells,
    ends: pageRunEnds(start, end),
    counts,
    surahs,
    memorizedPages: memorized,
    learning,
    beingLearned,
    learningText,
    continueAt,
  };
}

/** The juz most of some pages are in (a day's Revised block opens it; the earliest on a tie). */
export function juzOfPages(pages: number[]): number | null {
  const counts = new Map<number, number>();
  for (const p of pages) {
    const j = getJuzForPage(p);
    counts.set(j, (counts.get(j) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [j, n] of counts) if (best == null || n > (counts.get(best) ?? 0) || (n === counts.get(best) && j < best)) best = j;
  return best;
}
