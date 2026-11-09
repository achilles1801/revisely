// Listen back: a recording played over the mushaf pages it was recorded on
// (screens/activity/ListenBackScreen). The page marks (lib/recordings) already
// say which page was on screen at each moment; these are the rules on top.

import type { PageMark, RecordingMeta } from './recordings';

/** The pages a recording covers, once each, in mushaf order (how the pager
 *  turns: the next page is the next one in the mushaf). */
export function recordingPages(marks: PageMark[]): number[] {
  return [...new Set(marks.map((m) => m.page))].sort((a, b) => a - b);
}

/**
 * Where to play from when the user turns from `fromPage` to `page`: forward
 * (a later page), that page's next stretch after where the recording is; back,
 * its last stretch before it. So a page recited in two rounds goes to the round
 * being listened to. Null if the page was never on screen.
 */
export function stretchStart(marks: PageMark[], page: number, positionMs: number, fromPage: number | null): number | null {
  const starts = marks.filter((m) => m.page === page).map((m) => m.atMs);
  if (starts.length === 0) return null;
  const next = starts.find((s) => s > positionMs);
  const before = starts.filter((s) => s <= positionMs);
  const last = before[before.length - 1];
  const forward = fromPage == null || page > fromPage;
  return forward ? (next ?? last) : (last ?? next) ?? null;
}

/** The recording a revision session's end card offers to listen back to: that
 *  day's latest revision recording that has pages. */
export function latestRevisionRecording(list: RecordingMeta[], day: string): RecordingMeta | null {
  return (
    list
      .filter((r) => r.kind === 'revision' && r.day === day && r.pageMarks.length > 0)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}
