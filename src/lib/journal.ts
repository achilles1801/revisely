import { JournalEntry, JournalKind, JournalNote, User } from '../types';
import { getSurahsForPage } from './quranData';
import { getRevisionDayForUser, revisionDayOf } from './fajrBoundary';

// Limits mirrored in firestore.rules — keep them in sync.
export const JOURNAL_TEXT_MAX = 200;
export const JOURNAL_NOTES_MAX = 5000;
/**
 * The most a stored note may hold. A note typed in the app stays within
 * JOURNAL_NOTES_MAX; a day migrated from the single block can run longer,
 * since its memorization and revision lines are joined under the notes.
 */
export const JOURNAL_NOTE_STORED_MAX = 5500;
export const JOURNAL_MINUTES_MAX = 1440;
/** Notes per revision day. Rules can't count them, so the app enforces this. */
export const JOURNAL_ENTRIES_PER_DAY = 50;
/** The id of a day's single block once it is read as an entry (before any new entry). */
export const LEGACY_NOTE_ID = 'legacy';

export const JOURNAL_KIND_LABELS: Record<JournalKind, string> = {
  memorization: 'Memorization',
  revision: 'Revision',
  note: 'Note',
};

/** The longest text a note of this kind may hold. */
export function journalTextMax(kind: JournalKind): number {
  return kind === 'note' ? JOURNAL_NOTES_MAX : JOURNAL_TEXT_MAX;
}

export function emptyJournalEntry(date: string): JournalEntry {
  return {
    date,
    entries: [],
    memorization: '',
    memorizationMinutes: null,
    revision: '',
    revisionMinutes: null,
    notes: '',
  };
}

/**
 * A day's log from its notes: the notes oldest first, and the memorization /
 * revision / notes summaries joined from them. `notes` may come in any order.
 */
export function journalDayFromEntries(date: string, notes: JournalNote[]): JournalEntry {
  const entries = [...notes].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const texts = (kind: JournalKind) =>
    entries
      .filter((n) => n.kind === kind && n.text.trim() !== '')
      .map((n) => n.text.trim())
      .join('\n');
  const minutes = (kind: JournalKind) => {
    const parts = entries.filter((n) => n.kind === kind && n.minutes != null);
    return parts.length === 0 ? null : parts.reduce((sum, n) => sum + (n.minutes ?? 0), 0);
  };
  return {
    date,
    entries,
    memorization: texts('memorization'),
    memorizationMinutes: minutes('memorization'),
    revision: texts('revision'),
    revisionMinutes: minutes('revision'),
    notes: texts('note'),
    updatedAt: entries.length > 0 ? Math.max(...entries.map((n) => n.at)) : undefined,
  };
}

/**
 * A day's single block (written before timestamped entries) read as one
 * entry at `at`, or none when the block is empty. Its memorization and
 * revision lines are labelled inside the text when they sit with notes.
 */
export function legacyJournalNotes(
  block: Pick<JournalEntry, 'memorization' | 'memorizationMinutes' | 'revision' | 'revisionMinutes' | 'notes'>,
  at: number,
): JournalNote[] {
  const memorization = block.memorization.trim();
  const revision = block.revision.trim();
  const notes = block.notes.trim();
  const minutesSum =
    block.memorizationMinutes == null && block.revisionMinutes == null
      ? null
      : Math.min((block.memorizationMinutes ?? 0) + (block.revisionMinutes ?? 0), JOURNAL_MINUTES_MAX);
  if (!memorization && !revision && !notes && minutesSum == null) return [];

  let kind: JournalKind = 'note';
  let text = notes;
  if (memorization && !revision && !notes) {
    kind = 'memorization';
    text = memorization;
  } else if (revision && !memorization && !notes) {
    kind = 'revision';
    text = revision;
  } else if (!memorization && !revision) {
    text = notes;
  } else {
    text = [memorization && `Memorized: ${memorization}`, revision && `Revised: ${revision}`, notes]
      .filter(Boolean)
      .join('\n');
  }
  return [{ id: LEGACY_NOTE_ID, at, kind, text, minutes: minutesSum }];
}

export function isJournalNoteEmpty(note: JournalNote): boolean {
  return note.text.trim() === '' && note.minutes == null;
}

export function isJournalEntryEmpty(entry: JournalEntry): boolean {
  return (
    entry.memorization.trim() === '' &&
    entry.revision.trim() === '' &&
    entry.notes.trim() === '' &&
    !entry.memorizationMinutes &&
    !entry.revisionMinutes
  );
}

/**
 * The day's minutes: the sum over its notes once it has any, otherwise the
 * two time columns. Null when none was filled in.
 */
export function journalTotalMinutes(entry: JournalEntry): number | null {
  if (entry.entries.length > 0) {
    const withMinutes = entry.entries.filter((n) => n.minutes != null);
    return withMinutes.length === 0 ? null : withMinutes.reduce((sum, n) => sum + (n.minutes ?? 0), 0);
  }
  if (entry.memorizationMinutes == null && entry.revisionMinutes == null) {
    return null;
  }
  return (entry.memorizationMinutes ?? 0) + (entry.revisionMinutes ?? 0);
}

/**
 * The clock time a note was written: "7:12 am". A note written on the log's own
 * revision day shows only its time, 12:40 am before Fajr included: it belongs
 * to that day (LOG-3, DAY-9), so no other weekday is named. One written on
 * another day (added later to an older day's log) gets that day's weekday:
 * "9:05 am Wed". Without the account, the calendar day decides.
 */
export function formatEntryTime(at: number, day: string, user?: User | null): string {
  const d = new Date(at);
  const clock = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const writtenOn = user !== undefined ? revisionDayOf(at, user) : toDay(d);
  if (writtenOn === day) return clock;
  return `${clock} ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
}

/** "45m", "1h", "1h 5m". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Parse the contents of a minutes field. Non-digits are dropped, blank means
 * "not recorded" (null), and values are capped at a full day.
 */
export function parseMinutesInput(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '');
  if (digits === '') return null;
  return Math.min(parseInt(digits, 10), JOURNAL_MINUTES_MAX);
}

// YYYY-MM-DD → local midnight (new Date('YYYY-MM-DD') would parse as UTC).
function parseDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDay(date: string, deltaDays: number): string {
  const d = parseDay(date);
  d.setDate(d.getDate() + deltaDays);
  return toDay(d);
}

/** "Wed 9/23" — the same compact label people use in a notes-app table. */
export function formatJournalDay(date: string): string {
  const d = parseDay(date);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** "Today" / "Yesterday" relative to `today`, otherwise "Wed 9/23". */
export function formatJournalDayRelative(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === shiftDay(today, -1)) return 'Yesterday';
  return formatJournalDay(date);
}

/**
 * The last `count` days ending at `today`, newest first, each paired with its
 * entry if one exists. Used so recent days without an entry still show up as
 * rows the user can tap to backfill.
 *
 * Days before `firstDay` (the revision day the account was created) are left
 * out unless they somehow have an entry: a new user should not be shown blank
 * rows for days before they signed up. Today is always included.
 */
export function recentJournalDays(
  entries: JournalEntry[],
  today: string,
  count: number,
  firstDay?: string | null,
): { date: string; entry: JournalEntry | null }[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const days: { date: string; entry: JournalEntry | null }[] = [];
  for (let i = 0; i < count; i++) {
    const date = shiftDay(today, -i);
    const entry = byDate.get(date) ?? null;
    if (i > 0 && firstDay && date < firstDay && !entry) continue;
    days.push({ date, entry });
  }
  return days;
}

/**
 * The revision day ('YYYY-MM-DD') the user's account was created on, or null
 * when `createdAt` is missing or unparseable (then nothing is hidden). Uses
 * the same fajr boundary as "today", so signing up at 2am before fajr counts
 * as the previous day, exactly like a log written at that moment would.
 */
export function journalFirstDay(
  user: Pick<User, 'createdAt' | 'fajrBoundaryEnabled' | 'locationCoords' | 'fajrCalculationMethod'> | null | undefined,
  entries: { date: string }[] = [],
): string | null {
  if (!user?.createdAt) return null;
  const created = new Date(user.createdAt);
  if (isNaN(created.getTime())) return null;
  const signUpDay = getRevisionDayForUser(user as User, created);
  // A missing createdAt reads as "now" (timestampToISOString), so never start
  // after the oldest entry: those days are clearly part of the account.
  const oldest = entries.reduce<string | null>(
    (min, e) => (min == null || e.date < min ? e.date : min),
    null,
  );
  return oldest != null && oldest < signUpDay ? oldest : signUpDay;
}

/** True when the log has no entry with any content in it. */
export function hasNoJournalContent(entries: JournalEntry[]): boolean {
  return entries.every(isJournalEntryEmpty);
}

/** Totals over entries dated within the `days`-day window ending at `today`. */
export function sumJournalMinutes(
  entries: JournalEntry[],
  today: string,
  days: number,
): { memorization: number; revision: number; total: number; activeDays: number } {
  const from = shiftDay(today, -(days - 1));
  let memorization = 0;
  let revision = 0;
  let activeDays = 0;
  for (const e of entries) {
    if (e.date < from || e.date > today) continue;
    memorization += e.memorizationMinutes ?? 0;
    revision += e.revisionMinutes ?? 0;
    if (!isJournalEntryEmpty(e)) activeDays++;
  }
  return { memorization, revision, total: memorization + revision, activeDays };
}

/**
 * Describe a set of revised pages in words: "4 pages, Maryam",
 * "5 pages, Maryam and Taha", or "12 pages, An-Naba to Al-Infitar" when many
 * surahs are covered.
 */
export function summarizeRevisedPages(pages: number[]): string {
  const unique = [...new Set(pages)].sort((a, b) => a - b);
  if (unique.length === 0) return '';

  const surahs: string[] = [];
  for (const pn of unique) {
    for (const s of getSurahsForPage(pn)) {
      if (!surahs.includes(s.name)) surahs.push(s.name);
    }
  }

  const count = unique.length === 1 ? '1 page' : `${unique.length} pages`;
  if (surahs.length === 0) return count;
  if (surahs.length <= 2) return `${count}, ${surahs.join(' and ')}`;
  return `${count}, ${surahs[0]} to ${surahs[surahs.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Filtering & sorting (Daily log list)
// ---------------------------------------------------------------------------

export type JournalSort = 'newest' | 'oldest' | 'recentlyLogged' | 'mostTime';

export const JOURNAL_SORT_LABELS: Record<JournalSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  recentlyLogged: 'Recently logged',
  mostTime: 'Most time spent',
};

/** 'all' | 'last7' | 'last30' | a month key like '2026-09'. */
export type JournalFilter = 'all' | 'last7' | 'last30' | string;

export function journalFilterLabel(filter: JournalFilter): string {
  if (filter === 'all') return 'All dates';
  if (filter === 'last7') return 'Last 7 days';
  if (filter === 'last30') return 'Last 30 days';
  return formatJournalMonth(filter);
}

/** '2026-09' → 'September 2026'. */
export function formatJournalMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/** Distinct months that have entries, newest first ('YYYY-MM'). */
export function journalMonths(entries: JournalEntry[]): string[] {
  return [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort().reverse();
}

/** Inclusive [from, to] day range a filter covers; null for 'all'. */
export function journalFilterRange(
  filter: JournalFilter,
  today: string,
): { from: string; to: string } | null {
  if (filter === 'all') return null;
  if (filter === 'last7') return { from: shiftDay(today, -6), to: today };
  if (filter === 'last30') return { from: shiftDay(today, -29), to: today };
  return { from: `${filter}-01`, to: `${filter}-31` };
}

export function filterJournalEntries(
  entries: JournalEntry[],
  filter: JournalFilter,
  today: string,
): JournalEntry[] {
  const range = journalFilterRange(filter, today);
  if (!range) return entries;
  return entries.filter((e) => e.date >= range.from && e.date <= range.to);
}

export function sortJournalEntries(
  entries: JournalEntry[],
  sort: JournalSort,
): JournalEntry[] {
  const byDateDesc = (a: JournalEntry, b: JournalEntry) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  const sorted = [...entries];
  switch (sort) {
    case 'newest':
      return sorted.sort(byDateDesc);
    case 'oldest':
      return sorted.sort((a, b) => byDateDesc(b, a));
    case 'recentlyLogged':
      return sorted.sort(
        (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || byDateDesc(a, b),
      );
    case 'mostTime':
      return sorted.sort(
        (a, b) =>
          (journalTotalMinutes(b) ?? -1) - (journalTotalMinutes(a) ?? -1) ||
          byDateDesc(a, b),
      );
  }
}
