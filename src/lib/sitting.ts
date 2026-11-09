// A sitting in the reader: the timer, and a recording if one was made (REC-1). When it ends, one
// note says what was saved, by surah and ayah: "Saved to today: Al-Mulk, ayahs 1–26, 41 min".

import { formatMinutesLong } from './activityFormat';
import { describePassage } from './passages';

/**
 * Whether the reader's sittings are on (REC-1, REC-2) and with them the schedule editor's "Not in your plan"
 * (MEM-6): every account since the November 2026 release (Majd, Nov 8 2026); testers only before. One gate
 * for all of them, as activityBlocksEnabled is for the day's blocks (the Day's Add to memorized, MEM-5, is
 * one of those), so they can be gated again in one place.
 */
export const sittingsEnabled = (user: { previewTester?: boolean } | null | undefined) => user != null;

/** The day as the note names it: "today", or its weekday ("Tuesday") for an earlier revision day. */
export function sittingDayWord(day: string, today: string): string {
  if (day === today) return 'today';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
}

/** "Saved to today: Al-Mulk, ayahs 1–26, 41 min"; without pages, "Saved to today: 41 min". */
export function sittingSavedText(input: { day: string; today: string; pages: readonly number[]; seconds: number }): string {
  const minutes = Math.max(1, Math.round(input.seconds / 60));
  const what = input.pages.length > 0 ? describePassage(input.pages) : '';
  return `Saved to ${sittingDayWord(input.day, input.today)}: ${[what, formatMinutesLong(minutes)].filter(Boolean).join(', ')}`;
}

/**
 * The Day's line over a sitting's Add to revised (REC-3): "At-Taghabun is the 2 pages left of today’s
 * revision", or "… is 2 of the 4 pages left …" when it holds only some of them.
 */
export function sittingToReviseText(pages: readonly number[], left: readonly number[], day: 'today' | 'yesterday'): string {
  const what = describePassage([...pages]);
  const share =
    pages.length >= left.length
      ? pages.length === 1
        ? 'the page left'
        : `the ${pages.length} pages left`
      : `${pages.length} of the ${left.length} pages left`;
  return `${what} is ${share} of ${day}’s revision.`;
}
