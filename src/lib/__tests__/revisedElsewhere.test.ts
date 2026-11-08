import { revisedElsewhereChoices } from '../activityAdd';
import { handLogsOf, withPendingHandLogs } from '../activityHistory';
import type { HistoryItem } from '../streakFromItems';

describe('Revised elsewhere (ACT-5, ACT-15)', () => {
  it('[ACT-5] offers the day’s scheduled pages that are memorized and not revised, in order, once', () => {
    expect(revisedElsewhereChoices({ due: [6, 7, 8, 9, 10, 8], revised: [7, 9], memorized: new Set([6, 7, 8, 9]) })).toEqual([6, 8]);
    expect(revisedElsewhereChoices({ due: [1, 2], revised: [1, 2], memorized: new Set([1, 2]) })).toEqual([]);
  });

  it('[ACT-15] pages logged by hand become one log per day they count for, each page once; sessions’ items are left out', () => {
    const history: HistoryItem[] = [
      { id: 'manual-2026-11-02-1-aaaaaa', day: '2026-11-02', countsFor: '2026-11-02', pages: [3, 1], assigned: [], occurredAt: 1 },
      { id: 'manual-2026-11-02-2-bbbbbb', day: '2026-11-02', countsFor: '2026-11-02', pages: [1, 2], assigned: [], occurredAt: 2 },
      { id: '2026-11-03', day: '2026-11-03', countsFor: '2026-11-03', pages: [6], assigned: [6, 7], occurredAt: 3 },
    ];
    expect(handLogsOf(history)).toEqual([
      { id: 'hand-2026-11-02', date: '2026-11-02', pagesRevised: [1, 2, 3], pagesSkipped: [], weaknessUpdates: [], durationMinutes: null },
    ]);
    expect(handLogsOf(null)).toEqual([]);
  });

  it('[ACT-15] Home’s history takes pages logged by hand that are still waiting, and drops ones deleted here', () => {
    const item = { id: 'manual-x', uid: 'u', day: '2026-11-03', occurredAt: 5, countsFor: '2026-11-03', source: 'manual' as const, pages: [8], skipped: [], assigned: [], minutes: null, recordings: [] };
    const added = withPendingHandLogs([], [{ id: 'e1', at: 5, op: { kind: 'revision.add', item } }]);
    expect(added?.map((x) => x.id)).toEqual(['manual-x']);
    expect(withPendingHandLogs(added, [{ id: 'e2', at: 6, op: { kind: 'revision.delete', day: '2026-11-03', id: 'manual-x' } }])).toEqual([]);
    expect(withPendingHandLogs(null, [])).toBeNull();
  });
});
