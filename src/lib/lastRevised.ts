// Last revised (BEHAVIOUR.md ACT-30; Majd, Nov 16 2026: "being able to click on a page or surah or juz or hizb and
// seeing the last time u revised it"): every memorized surah, juz, hizb or page with when it was last revised.
// Recency only, so the same with Smart Tracking on or off (ACT-19).
//
// Majd, after trying it (Nov 16 2026): "showing recents with either surah/juz/hizb/page depending on what makes the
// most sense for each user then there should be a filter and sort options like by date". So the rows come in the
// unit that suits the account (suggestedView) unless the user picked one, recent first unless they sort otherwise
// (LastRevisedSort), and a filter narrows them to the pages that match (LastRevisedFilter).
//
// A surah, juz or hizb is as recent as its least recently revised memorized page (as Coverage reads a juz, ACT-25),
// and lists its pages. A page never revised waits from when it was memorized: "Not revised yet" for its first 30
// days (ACT-25), "Never revised" after.

import { t } from '../i18n';
import { describePassage } from './passages';
import { getAllSurahs, getPagesForHizb, getPagesForJuz } from './quranData';
import { surahName } from './passages';
import { COVERAGE_STALE_DAYS, daysSince } from './recency';
import { gapDate } from './insightsGaps';

export type LastRevisedView = 'surah' | 'juz' | 'hizb' | 'page';
export const LAST_REVISED_VIEWS: LastRevisedView[] = ['surah', 'juz', 'hizb', 'page'];
/** Recent first (the latest revised at the top), longest waiting first, or the mushaf's order. */
export type LastRevisedSort = 'recent' | 'waiting' | 'mushaf';
export const LAST_REVISED_SORTS: LastRevisedSort[] = ['recent', 'waiting', 'mushaf'];
/** Everything; revised in the last 7 days; waiting 2 weeks or more; never revised since memorized. */
export type LastRevisedFilter = 'all' | 'week' | 'waiting' | 'never';
export const LAST_REVISED_FILTERS: LastRevisedFilter[] = ['all', 'week', 'waiting', 'never'];
/** The filter's "2 weeks or more". */
export const WAITING_DAYS = 14;

/** The unit and sort the user picked, kept on the phone per account (the filter starts at All each visit). */
export const lastRevisedPrefsKey = (uid: string) => `activity.lastRevised:${uid}`;
/** The first version's key (the tabs' last view, picked or not): no longer read, removed when seen. */
export const OLD_LAST_REVISED_VIEW_KEY = 'activity.lastRevisedView';

export interface LastRevisedPrefs {
  view?: LastRevisedView;
  sort?: LastRevisedSort;
}

export function parseLastRevisedView(v: unknown): LastRevisedView | undefined {
  return v === 'surah' || v === 'juz' || v === 'hizb' || v === 'page' ? v : undefined;
}

export function parseLastRevisedPrefs(raw: string | null | undefined): LastRevisedPrefs {
  try {
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!v || typeof v !== 'object') return {};
    const sort = LAST_REVISED_SORTS.includes(v.sort as LastRevisedSort) ? (v.sort as LastRevisedSort) : undefined;
    return { view: parseLastRevisedView(v.view), sort };
  } catch {
    return {};
  }
}

/** From this many memorized pages (about 10 juz) the juz is the unit that suits: 114 surah rows is a long list. */
export const JUZ_FROM_PAGES = 200;

/**
 * The unit that suits the account, until the user picks one: Juz on the juz plan (it revises whole juz) or with
 * about 10 juz memorized or more; Page while everything memorized is in one surah (its pages are what changes);
 * otherwise Surah, as most memorize.
 */
export function suggestedView({ memorized, juzPlan }: { memorized: readonly number[]; juzPlan: boolean }): LastRevisedView {
  if (juzPlan || memorized.length >= JUZ_FROM_PAGES) return 'juz';
  const surahs = new Set<number>();
  for (const s of getAllSurahs()) {
    if (memorized.some((p) => p >= s.startPage && p <= s.endPage)) surahs.add(s.number);
    if (surahs.size > 1) return 'surah';
  }
  return surahs.size === 1 ? 'page' : 'surah';
}

export interface PageRecency {
  page: number;
  /** Its last revision day, null when never revised. */
  last: string | null;
  /** 'dated' (revised), 'notYet' (never, memorized under 30 days ago), 'never'. */
  state: 'dated' | 'notYet' | 'never';
  /** Days it has waited: since its last revision, or since it was memorized; Infinity when unknown. */
  wait: number;
}

export interface LastRevisedRow {
  view: LastRevisedView;
  /** The surah's, juz's, hizb's or page's number. */
  number: number;
  /** Its memorized pages that pass the filter, in the sort's order (among equals, the mushaf's order). */
  pages: PageRecency[];
  /** The one of them that has waited longest: it dates the row. */
  oldest: PageRecency;
  /** Its memorized pages in all, the filter aside. */
  total: number;
}

export interface LastRevisedInput {
  /** The memorized pages (lib/memorizedAyahs revisablePages). */
  memorized: readonly number[];
  /** A page's last revision day (lib/recency lastRevisedDay), null when never revised. */
  last: (page: number) => string | null;
  /** A never-revised page's first day on record (lib/recency coverageSince). */
  since: (page: number) => string | null;
  today: string;
}

export function pageRecency(page: number, input: Pick<LastRevisedInput, 'last' | 'since' | 'today'>): PageRecency {
  const last = input.last(page);
  if (last) return { page, last, state: 'dated', wait: Math.max(0, daysSince(last, input.today)) };
  const since = input.since(page);
  const wait = since ? Math.max(0, daysSince(since, input.today)) : Infinity;
  return { page, last: null, state: wait < COVERAGE_STALE_DAYS ? 'notYet' : 'never', wait };
}

/** Whether a page passes the filter. */
export function matchesFilter(r: PageRecency, filter: LastRevisedFilter): boolean {
  if (filter === 'week') return r.state === 'dated' && r.wait <= 6;
  if (filter === 'waiting') return r.wait >= WAITING_DAYS;
  if (filter === 'never') return r.state !== 'dated';
  return true;
}

/** Longer waits first (Infinity, unknown, longest); 0 for equals. */
const longer = (a: number, b: number) => (b === a ? 0 : b > a ? 1 : -1);
/** How recent: days since the last revision; never revised comes after every revised one. */
const recency = (r: PageRecency) => (r.state === 'dated' ? r.wait : Infinity);
const sooner = (a: PageRecency, b: PageRecency) => {
  const x = recency(a);
  const y = recency(b);
  return x === y ? 0 : x < y ? -1 : 1;
};
/** Pages in a sort's order; equals keep the mushaf's. */
const pageOrder = (sort: LastRevisedSort) => (a: PageRecency, b: PageRecency) =>
  (sort === 'waiting' ? longer(a.wait, b.wait) : sort === 'recent' ? sooner(a, b) : 0) || a.page - b.page;
/** Rows by their date (their least recently revised page shown); equals keep the mushaf's order. */
const rowOrder = (sort: LastRevisedSort) => (a: LastRevisedRow, b: LastRevisedRow) =>
  (sort === 'waiting' ? longer(a.oldest.wait, b.oldest.wait) : sort === 'recent' ? sooner(a.oldest, b.oldest) : 0) || a.number - b.number;

/**
 * The rows of a view, in the sort's order (longest waiting first unless told), narrowed by the filter: a surah, juz
 * or hizb is there when one of its memorized pages passes, lists only those (`total` says how many it has in all),
 * and is as recent as the least recently revised of them.
 */
export function lastRevisedRows(
  view: LastRevisedView,
  input: LastRevisedInput,
  { sort = 'waiting', filter = 'all' }: { sort?: LastRevisedSort; filter?: LastRevisedFilter } = {},
): LastRevisedRow[] {
  const memorized = new Set(input.memorized);
  const recency = new Map<number, PageRecency>();
  const of = (p: number) => {
    let r = recency.get(p);
    if (!r) recency.set(p, (r = pageRecency(p, input)));
    return r;
  };
  const row = (number: number, pages: number[]): LastRevisedRow | null => {
    const all = pages.filter((p) => memorized.has(p)).map(of);
    // Its pages in the same order as the rows (longest waiting first puts the page that dates it first).
    const mine = all.filter((r) => matchesFilter(r, filter)).sort(pageOrder(sort));
    if (mine.length === 0) return null;
    const oldest = mine.reduce((o, r) => (r.wait > o.wait ? r : o));
    return { view, number, pages: mine, oldest, total: all.length };
  };
  const rows: (LastRevisedRow | null)[] =
    view === 'page'
      ? [...memorized].map((p) => row(p, [p]))
      : view === 'juz'
        ? Array.from({ length: 30 }, (_, i) => row(i + 1, getPagesForJuz(i + 1)))
        : view === 'hizb'
          ? Array.from({ length: 60 }, (_, i) => row(i + 1, getPagesForHizb(i + 1)))
          : getAllSurahs().map((s) => row(s.number, Array.from({ length: s.endPage - s.startPage + 1 }, (_, k) => s.startPage + k)));
  return rows.filter((r): r is LastRevisedRow => r != null).sort(rowOrder(sort));
}

// ── Words (src/i18n/en/insights.ts, `lastRevised`) ──────────────────────

/** A row's name: "Al-Baqarah", "Juz 3", "Hizb 5", or a page's passage ("Al-Baqarah, ayahs 1–5"). */
export function rowName(r: Pick<LastRevisedRow, 'view' | 'number'>): string {
  if (r.view === 'surah') return surahName(r.number);
  if (r.view === 'juz') return t('insights.lastRevised.juz', { number: r.number });
  if (r.view === 'hizb') return t('insights.lastRevised.hizb', { number: r.number });
  return describePassage([r.number]);
}

/** A page under its row, where the row already gives the date: "Today", "Yesterday", "22 days ago". */
export function recencyShort(r: PageRecency): string {
  if (r.state === 'notYet') return t('insights.lastRevised.notYet');
  if (r.state === 'never' || !r.last) return t('insights.lastRevised.never');
  if (r.wait === 0) return t('insights.lastRevised.today');
  if (r.wait === 1) return t('insights.lastRevised.yesterdayShort');
  return t('insights.lastRevised.agoShort', { count: r.wait });
}

/** When: "Today", "14 Nov · yesterday", "24 Oct · 22 days ago", "Not revised yet", "Never revised". */
export function recencyText(r: PageRecency): string {
  if (r.state === 'notYet') return t('insights.lastRevised.notYet');
  if (r.state === 'never' || !r.last) return t('insights.lastRevised.never');
  if (r.wait === 0) return t('insights.lastRevised.today');
  if (r.wait === 1) return t('insights.lastRevised.yesterday', { date: gapDate(r.last) });
  return t('insights.lastRevised.ago', { date: gapDate(r.last), count: r.wait });
}
