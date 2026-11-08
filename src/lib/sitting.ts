// A sitting in the reader: the timer, and a recording if one was made (REC-1). When it ends, one
// note says what was saved, by surah and ayah: "Saved to today: Al-Mulk, ayahs 1–26, 41 min".

import { formatMinutesLong } from './activityFormat';
import { describePassage } from './passages';

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
