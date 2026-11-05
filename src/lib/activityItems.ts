import type { JournalEntry, JournalNote, ReadingSession, RevisionLog, User } from '../types';
import { isRevisionActivity, normalizeReadingSession } from './activity';
import { formatMinutesShort } from './activityHeatmap';
import { formatEntryTime, isJournalNoteEmpty, JournalFilter, journalFilterRange } from './journal';
import { describePageRuns, describeRevised, describeSurahRuns, pageRuns } from './pageRanges';
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

/** The pages a session revised for its own day: revised, less those credited ahead to later days. */
export function ownRevised(log: RevisionLog): number[] {
  const ahead = new Set(Object.values(log.ahead ?? {}).flat());
  return log.pagesRevised.filter((p) => !ahead.has(p));
}

/** How items name what was revised: `juzPlan` is the account's plan (scheduleMode 'juz'). */
export interface ActivityLabelOptions {
  juzPlan?: boolean;
}

export function revisionItem(log: RevisionLog, opts: ActivityLabelOptions = {}): ActivityItem {
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
    detail: [
      describePageRuns(pageRuns(pages)),
      minutes,
      describeRevised(pages, { juzPlan: opts.juzPlan, revised: ownRevised(log) }),
    ].filter(Boolean).join(' · '),
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

/** One note of a day's log: its time, what it says, its minutes. */
function logItem(day: JournalEntry, note: JournalNote, user?: User | null): ActivityItem {
  const text = note.text.trim();
  const said =
    note.kind === 'memorization' ? `Memorized ${text}` : note.kind === 'revision' ? `Revised ${text}` : text;
  const parts = [
    formatEntryTime(note.at, day.date, user),
    said || null,
    note.minutes ? formatMinutesShort(note.minutes) : null,
  ].filter(Boolean);
  return item({
    key: `log-${day.date}-${note.id}`,
    kind: 'log',
    day: day.date,
    at: note.at,
    title: 'Daily log',
    detail: parts.join(' · '),
  });
}

function weekdayName(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * A session's pages revised ahead (lib/aheadCredit): one item on the day they
 * were revised ("Revised ahead for Wed"). Nothing goes on the day they count
 * for: Activity shows what was done on each day, and that day may not have
 * started yet (DAY-9). Home and the schedule still count them for it.
 */
function aheadItems(log: RevisionLog, opts: ActivityLabelOptions = {}): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const [day, pages] of Object.entries(log.ahead ?? {})) {
    if (!DAY_RE.test(day) || pages.length === 0) continue;
    const runs = pageRuns(pages);
    const detail = [describePageRuns(runs), describeRevised(pages, { juzPlan: opts.juzPlan })].filter(Boolean).join(' · ');
    // Just after the session's own item on its day.
    const at = Number.MAX_SAFE_INTEGER - 1;
    out.push(item({
      key: `ahead-from-${log.id}-${day}`,
      kind: 'revision',
      day: log.date,
      at,
      title: `Revised ahead for ${weekdayName(day)} · ${plural(pages.length, 'page')}`,
      detail,
    }, pages));
  }
  return out;
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
  const labels: ActivityLabelOptions = { juzPlan: user?.scheduleMode === 'juz' };
  for (const log of logs) {
    if (!isRevisionActivity(log) || !DAY_RE.test(log.date)) continue;
    out.push(revisionItem(log, labels), ...aheadItems(log, labels));
  }
  for (const raw of readings) {
    const s = normalizeReadingSession(raw, user);
    if (s) out.push(readingItem(s));
  }
  for (const r of recordings) if (DAY_RE.test(r.day)) out.push(recordingItem(r));
  for (const day of journal) {
    if (!DAY_RE.test(day.date)) continue;
    for (const note of day.entries) if (!isJournalNoteEmpty(note)) out.push(logItem(day, note, user));
  }
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
