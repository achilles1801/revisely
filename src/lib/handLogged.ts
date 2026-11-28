// Pages logged by hand (Activity's + → Revised elsewhere, ACT-15) in the session and the review Home opens. Home counts
// them as done ("Continue at …", "Done · 5 pages"); the session opens after them with them checked, and the review holds
// them, so Home's button opens what it names (USER-2). Before (found by the user-matrix sweep, Nov 27 2026) both read
// only the phone's sessions: Continue opened on the first page with nothing checked, and Review session opened empty.
//
// What unchecking one does there is Majd's call (asked Nov 27 2026). Each answer is this one switch:
//   'locked': it stays checked there; it comes off only in Activity, from its own row (ACT-14, ACT-7);
//   'remove': unchecking takes it off its hand-logged entry, as unchecking a page revised ahead takes back its credit
//             (SESS-4); `takeBackHandLogged` says how.

import { manualRevisionItem } from './manualRevision';
import { handLogsOf, isHandLogged } from './activityHistory';
import type { HistoryItem } from './streakFromItems';
import type { OutboxOp } from './offline/ops';

export type HandLoggedUncheck = 'locked' | 'remove';

/**
 * Majd, Nov 27 2026: "i mean it should be removed right? it means the user didn't revise that page therefore it should be
 * removed". Unchecking a page logged by hand takes it off its entry.
 */
export const HAND_LOGGED_UNCHECK: HandLoggedUncheck = 'remove';

/** Of `pages`, those logged by hand for `day`, in the Activity items (with those still waiting on the phone). */
export function handLoggedOn(history: readonly HistoryItem[] | null | undefined, day: string, pages: readonly number[]): number[] {
  const logged = new Set(handLogsOf(history).filter((l) => l.date === day).flatMap((l) => l.pagesRevised));
  return pages.filter((p) => logged.has(p));
}

/** Whether a page can be unchecked in the session or the review (HAND_LOGGED_UNCHECK). */
export function canUncheck(page: number, handLogged: ReadonlySet<number>, mode: HandLoggedUncheck = HAND_LOGGED_UNCHECK): boolean {
  return mode === 'remove' || !handLogged.has(page);
}

/**
 * With 'remove': the outbox changes that take `pages` off `day`'s hand-logged entries. Each entry holding one is
 * deleted, and what else it held is logged again as a new entry, at the same time.
 */
export function takeBackHandLogged(
  history: readonly HistoryItem[] | null | undefined,
  day: string,
  pages: readonly number[],
  uid: string,
): OutboxOp[] {
  const out = new Set(pages);
  const ops: OutboxOp[] = [];
  for (const x of history ?? []) {
    if (!isHandLogged(x) || x.countsFor !== day || !x.id || !x.pages.some((p) => out.has(p))) continue;
    ops.push({ kind: 'revision.delete', day: x.day, id: x.id });
    const rest = x.pages.filter((p) => !out.has(p));
    if (rest.length > 0) {
      ops.push({ kind: 'revision.add', item: manualRevisionItem({ uid, day, now: x.occurredAt ?? Date.now(), pages: rest, minutes: null }) });
    }
  }
  return ops;
}
