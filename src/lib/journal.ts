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
