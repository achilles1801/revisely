import { canUncheck, handLoggedOn, takeBackHandLogged } from '../handLogged';
import type { HistoryItem } from '../streakFromItems';

const DAY = '2026-11-03';
const item = (id: string, pages: number[], countsFor = DAY): HistoryItem => ({ id, day: DAY, countsFor, pages, assigned: [], occurredAt: 1_000 });
const history: HistoryItem[] = [item('manual-a', [6, 7]), item('manual-b', [8, 12]), item(DAY, [9]), item('manual-c', [10], '2026-11-02')];

describe('pages logged by hand in the session and the review (lib/handLogged)', () => {
  it('[USER-2] picks the day’s pages logged by hand, not a session’s or another day’s', () => {
    expect(handLoggedOn(history, DAY, [6, 7, 8, 9, 10])).toEqual([6, 7, 8]);
    expect(handLoggedOn(null, DAY, [6])).toEqual([]);
  });

  it('[USER-2] locked: a hand-logged page can’t be unchecked; remove: it can, and comes off its entry', () => {
    const hand = new Set([6, 7, 8]);
    expect(canUncheck(6, hand, 'locked')).toBe(false);
    expect(canUncheck(9, hand, 'locked')).toBe(true);
    expect(canUncheck(6, hand, 'remove')).toBe(true);
    // Unchecking 7 and 8: both entries go, and what else they held (6, 12) is logged again.
    const ops = takeBackHandLogged(history, DAY, [7, 8], 'uid');
    expect(ops.filter((o) => o.kind === 'revision.delete')).toEqual([
      { kind: 'revision.delete', day: DAY, id: 'manual-a' },
      { kind: 'revision.delete', day: DAY, id: 'manual-b' },
    ]);
    const added = ops.flatMap((o) => (o.kind === 'revision.add' ? [o.item] : []));
    expect(added.map((i) => i.pages)).toEqual([[6], [12]]);
    expect(added.every((i) => i.id.startsWith('manual-') && i.countsFor === DAY && i.source === 'manual' && i.occurredAt === 1_000)).toBe(true);
    // A page in no hand-logged entry changes nothing.
    expect(takeBackHandLogged(history, DAY, [9], 'uid')).toEqual([]);
  });
});
