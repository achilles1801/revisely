import { JournalEntry } from '../types';
import { getSurahsForPage } from './quranData';

// Limits mirrored in firestore.rules — keep them in sync.
export const JOURNAL_TEXT_MAX = 200;
export const JOURNAL_NOTES_MAX = 5000;
export const JOURNAL_MINUTES_MAX = 1440;

export function emptyJournalEntry(date: string): JournalEntry {
  return {
    date,
    memorization: '',
    memorizationMinutes: null,
    revision: '',
    revisionMinutes: null,
    notes: '',
  };
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

/** Sum of both time columns, or null when neither was filled in. */
export function journalTotalMinutes(entry: JournalEntry): number | null {
  if (entry.memorizationMinutes == null && entry.revisionMinutes == null) {
    return null;
  }
  return (entry.memorizationMinutes ?? 0) + (entry.revisionMinutes ?? 0);
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
 */
export function recentJournalDays(
  entries: JournalEntry[],
  today: string,
  count: number,
): { date: string; entry: JournalEntry | null }[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  return Array.from({ length: count }, (_, i) => {
    const date = shiftDay(today, -i);
    return { date, entry: byDate.get(date) ?? null };
  });
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
 * Describe a set of revised pages in journal shorthand: "4p Maryam",
 * "5p Maryam + Taha", or "12p An-Naba – Al-Infitar" when many surahs are
 * covered.
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

  const count = `${unique.length}p`;
  if (surahs.length === 0) return count;
  if (surahs.length <= 2) return `${count} ${surahs.join(' + ')}`;
  return `${count} ${surahs[0]} – ${surahs[surahs.length - 1]}`;
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
