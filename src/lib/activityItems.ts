import type { JournalEntry, ReadingSession, RevisionLog, User } from '../types';
import { isRevisionActivity, normalizeReadingSession } from './activity';
import { formatMinutesShort } from './activityHeatmap';
import { isJournalEntryEmpty, JournalFilter, journalFilterRange, journalTotalMinutes } from './journal';
import { describePageRuns, describeSurahRuns, pageRuns } from './pageRanges';
import { getSurahsForPage } from './quranData';
import { formatClock } from './readingTimer';

// Activity as single things done (a revision session, a timed reading, a
// recording, a day's log), newest first: Recent on Activity and Home, and the
// searchable list behind "See all" (new design).

export type ActivityKind = 'revision' | 'reading' | 'recording' | 'log';

export const ACTIVITY_KINDS: ActivityKind[] = ['revision', 'reading', 'recording', 'log'];

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  revision: 'Revision',
  reading: 'Reading',
  recording: 'Recordings',
  log: 'Daily log',
};

/** What the list needs of a recording (lib/recordings' RecordingMeta has it). */
export interface RecordingItemSource {
  id: string;
  day: string;
  createdAt: number;
  durationMs: number;
  kind?: string;
  pageMarks?: { page: number }[];
}

export interface ActivityItem {
  key: string;
  kind: ActivityKind;
  /** Revision day, 'YYYY-MM-DD'. */
  day: string;
  /** Orders items within a day (newest first). */
  at: number;
  /** What happened: "Revised 20 pages". */
  title: string;
  /** The specifics: "Pages 503–522 · Al-Ahqaf to Adh-Dhariyat · 41 min". */
  detail: string;
  /** A revision session with every page revised. */
  done?: boolean;
  log?: RevisionLog;
  recordingId?: string;
  /** The words a search matches, lowercased, each after a space. */
  search: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A session's pages: its whole assignment where known, else what was marked. */
export function sessionPages(log: RevisionLog): number[] {
  return log.assignedPages && log.assignedPages.length > 0
    ? log.assignedPages
    : [...log.pagesRevised, ...(log.pagesSkipped ?? [])];
}

function pagesText(pages: number[]): string {
  const runs = pageRuns(pages);
  return [describePageRuns(runs), describeSurahRuns(runs)].filter(Boolean).join(' · ');
}

function dateWords(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return [
    date.toLocaleDateString('en-US', { weekday: 'long' }),
    date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    day,
  ].join(' ');
}

/** Lowercase words, separators ("·", "–", "-", ",") as spaces: "Al-Kahf" → "al kahf". */
function words(text: string): string {
  return text.toLowerCase().replace(/[·–—\-,:()]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Every surah on the pages, not only the first and last the detail names. */
function surahNames(pages: number[]): string {
  const names = new Set<string>();
  for (const p of new Set(pages)) for (const s of getSurahsForPage(p)) names.add(s.name);
  return [...names].join(' ');
}

function item(base: Omit<ActivityItem, 'search'>, pages: number[] = []): ActivityItem {
  const text = [base.title, base.detail, surahNames(pages), ACTIVITY_KIND_LABELS[base.kind], dateWords(base.day)];
  return { ...base, search: ` ${words(text.join(' '))}` };
}

export function revisionItem(log: RevisionLog): ActivityItem {
  const pages = sessionPages(log);
  const total = pageRuns(pages).reduce((n, r) => n + r.last - r.first + 1, 0);
  const revised = log.pagesRevised.length;
  const minutes = log.durationMinutes && log.durationMinutes > 0 ? formatMinutesShort(log.durationMinutes) : null;
  return item({
    key: `revision-${log.id}`,
    kind: 'revision',
    day: log.date,
    // No time is stored: a day's session leads that day.
    at: Number.MAX_SAFE_INTEGER,
    title: total > revised ? `Revised ${revised} of ${plural(total, 'page')}` : `Revised ${plural(revised, 'page')}`,
    // The time before the surahs, which a narrow line cuts off first.
    detail: [describePageRuns(pageRuns(pages)), minutes, describeSurahRuns(pageRuns(pages))].filter(Boolean).join(' · '),
    done: total > 0 && revised >= total,
    log,
  }, pages);
}

function readingItem(s: ReadingSession): ActivityItem {
  const time = s.durationSeconds < 60 ? `${Math.round(s.durationSeconds)}s` : formatMinutesShort(Math.round(s.durationSeconds / 60));
  const pages = s.pages.length > 0 ? s.pages : s.pagesVisited;
  return item({
    key: `reading-${s.id}`,
    kind: 'reading',
    day: s.date,
    at: s.endedAt,
    title: `Read for ${time}`,
    detail: pages.length > 0 ? pagesText(pages) : 'Timed session',
  }, pages);
}

function recordingItem(r: RecordingItemSource): ActivityItem {
  const pages = (r.pageMarks ?? []).map((m) => m.page);
  return item({
    key: `recording-${r.id}`,
    kind: 'recording',
    day: r.day,
    at: r.createdAt,
    title: `Recorded ${formatClock(r.durationMs)}`,
    detail: [describePageRuns(pageRuns(pages)), r.kind === 'revision' ? 'During revision' : 'While reading']
      .filter(Boolean)
      .join(' · '),
    recordingId: r.id,
  }, pages);
}

function logItem(e: JournalEntry): ActivityItem {
  const minutes = journalTotalMinutes(e);
  const parts = [
    e.memorization.trim() ? `Memorized ${e.memorization.trim()}` : null,
    e.revision.trim() ? `Revised ${e.revision.trim()}` : null,
    e.notes.trim() || null,
    minutes ? formatMinutesShort(minutes) : null,
  ].filter(Boolean);
  return item({
    key: `log-${e.date}`,
    kind: 'log',
    day: e.date,
    at: e.updatedAt ?? 0,
    title: 'Daily log',
    detail: parts.join(' · '),
  });
}

/** Everything done, one item each, newest first. */
export function buildActivityItems(
  {
    logs,
    readings = [],
    journal = [],
    recordings = [],
  }: {
    logs: RevisionLog[];
    readings?: ReadingSession[];
    journal?: JournalEntry[];
    recordings?: RecordingItemSource[];
  },
  user?: User | null,
): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const log of logs) if (isRevisionActivity(log) && DAY_RE.test(log.date)) out.push(revisionItem(log));
  for (const raw of readings) {
    const s = normalizeReadingSession(raw, user);
    if (s) out.push(readingItem(s));
  }
  for (const r of recordings) if (DAY_RE.test(r.day)) out.push(recordingItem(r));
  for (const e of journal) if (DAY_RE.test(e.date) && !isJournalEntryEmpty(e)) out.push(logItem(e));
  return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.at - a.at));
}

export interface ActivityItemFilter {
  kind?: ActivityKind | 'all';
  range?: JournalFilter;
  query?: string;
}

/**
 * The items a search, a kind and a date range leave. Every word of the query
 * must start a word of the item ("kahf", "oct 26", "1/2"), so "26" finds the
 * 26th and not 2026.
 */
export function filterActivityItems(
  items: ActivityItem[],
  { kind = 'all', range = 'all', query = '' }: ActivityItemFilter,
  today: string,
): ActivityItem[] {
  const span = journalFilterRange(range, today);
  const terms = words(query).split(' ').filter(Boolean);
  return items.filter(
    (i) =>
      (kind === 'all' || i.kind === kind) &&
      (!span || (i.day >= span.from && i.day <= span.to)) &&
      terms.every((t) => i.search.includes(` ${t}`)),
  );
}
