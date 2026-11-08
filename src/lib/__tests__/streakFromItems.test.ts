import { streakDetailFromItems, type HistoryItem } from '../streakFromItems';
import type { User } from '../../types';

// A session's own item for Monday (its five pages, all revised) and pages added to Monday by hand.
const MON = '2026-11-02';
const at = Date.UTC(2026, 10, 2, 20);
const session: HistoryItem = { id: MON, day: MON, countsFor: MON, pages: [1, 2, 3, 4, 5], assigned: [1, 2, 3, 4, 5], occurredAt: at };
const byHand: HistoryItem = { id: `manual-${MON}-${at}-abc123`, day: MON, countsFor: MON, pages: [3], assigned: [], occurredAt: at + 3600_000 };
const user = { id: 'u1', fajrBoundaryEnabled: false } as unknown as User;

describe('the streak from the Activity items (ACT-15)', () => {
  it('[ACT-15] pages added by hand never stand in for the day’s own item, in either order', () => {
    for (const items of [[session, byHand], [byHand, session]]) {
      const { done } = streakDetailFromItems({ user, pages: [], items, today: '2026-11-03' });
      expect(done.has(MON)).toBe(true);
    }
  });
});
