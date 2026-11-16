// Last revised (BEHAVIOUR.md ACT-30; Majd, Nov 16 2026: "being able to click on a page or surah or juz or hizb and
// seeing the last time u revised it"): every memorized surah, juz, hizb or page with when it was last revised,
// longest waiting first. Recency only, so the same with Smart Tracking on or off (ACT-19).
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
/** The view last chosen, kept on the phone (Surah at first). */
export const LAST_REVISED_VIEW_KEY = 'activity.lastRevisedView';

export function parseLastRevisedView(v: string | null | undefined): LastRevisedView {
  return v === 'juz' || v === 'hizb' || v === 'page' ? v : 'surah';
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
  /** Its pages that are memorized, longest waiting first (among equals, the mushaf's order): the first is the one
   * that dates the row. */
  pages: PageRecency[];
  /** The one that has waited longest. */
  oldest: PageRecency;
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

/** Longest waiting first; among equals, the mushaf's order. */
const byWait = (a: LastRevisedRow, b: LastRevisedRow) => b.oldest.wait - a.oldest.wait || a.number - b.number;
const pageByWait = (a: PageRecency, b: PageRecency) => (b.wait === a.wait ? 0 : b.wait > a.wait ? 1 : -1) || a.page - b.page;

/** The rows of a view, longest waiting first. */
export function lastRevisedRows(view: LastRevisedView, input: LastRevisedInput): LastRevisedRow[] {
  const memorized = new Set(input.memorized);
  const recency = new Map<number, PageRecency>();
  const of = (p: number) => {
    let r = recency.get(p);
    if (!r) recency.set(p, (r = pageRecency(p, input)));
    return r;
  };
  const row = (number: number, pages: number[]): LastRevisedRow | null => {
    // Longest waiting first inside too, so the page that dates the row comes first when it opens (a surah's oldest
    // page could otherwise sit below a screenful of recent ones).
    const mine = pages.filter((p) => memorized.has(p)).map(of).sort(pageByWait);
    if (mine.length === 0) return null;
    return { view, number, pages: mine, oldest: mine[0] };
  };
  const rows: (LastRevisedRow | null)[] =
    view === 'page'
      ? [...memorized].map((p) => row(p, [p]))
      : view === 'juz'
        ? Array.from({ length: 30 }, (_, i) => row(i + 1, getPagesForJuz(i + 1)))
        : view === 'hizb'
          ? Array.from({ length: 60 }, (_, i) => row(i + 1, getPagesForHizb(i + 1)))
          : getAllSurahs().map((s) => row(s.number, Array.from({ length: s.endPage - s.startPage + 1 }, (_, k) => s.startPage + k)));
  return rows.filter((r): r is LastRevisedRow => r != null).sort(byWait);
}

// ── Words (src/i18n/en/insights.ts, `lastRevised`) ──────────────────────

/** A row's name: "Al-Baqarah", "Juz 3", "Hizb 5", or a page's passage ("Al-Baqarah, ayahs 1–5"). */
export function rowName(r: Pick<LastRevisedRow, 'view' | 'number'>): string {
  if (r.view === 'surah') return surahName(r.number);
  if (r.view === 'juz') return t('insights.lastRevised.juz', { number: r.number });
  if (r.view === 'hizb') return t('insights.lastRevised.hizb', { number: r.number });
  return describePassage([r.number]);
}

/** When: "Today", "14 Nov · yesterday", "24 Oct · 22 days ago", "Not revised yet", "Never revised". */
export function recencyText(r: PageRecency): string {
  if (r.state === 'notYet') return t('insights.lastRevised.notYet');
  if (r.state === 'never' || !r.last) return t('insights.lastRevised.never');
  if (r.wait === 0) return t('insights.lastRevised.today');
  if (r.wait === 1) return t('insights.lastRevised.yesterday', { date: gapDate(r.last) });
  return t('insights.lastRevised.ago', { date: gapDate(r.last), count: r.wait });
}
