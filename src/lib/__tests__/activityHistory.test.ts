import { sameHistory } from '../activityHistory';
import type { HistoryItem } from '../streakFromItems';

const item = (over: Partial<HistoryItem> = {}): HistoryItem => ({
  id: '2026-11-03',
  day: '2026-11-03',
  countsFor: '2026-11-03',
  pages: [542, 543],
  assigned: [542, 543, 544],
  occurredAt: 1_000,
  ...over,
});

// Home reads the history again each time it comes back into view (ACT-15); a read that came back the
// same keeps the copy it has, so Home doesn't render again (every swipe back from Read rendered it twice).
describe('sameHistory', () => {
  it('two reads of the same items are the same, though they are new objects', () => {
    expect(sameHistory([item(), item({ id: 'manual-1', pages: [1] })], [item(), item({ id: 'manual-1', pages: [1] })])).toBe(true);
    expect(sameHistory([], [])).toBe(true);
  });

  it('any change counts: an item more or less, its pages, what it counts for, its time, its order', () => {
    const a = [item(), item({ id: 'manual-1', pages: [1] })];
    expect(sameHistory(a, [item()])).toBe(false);
    expect(sameHistory(a, [item(), item({ id: 'manual-1', pages: [1, 2] })])).toBe(false);
    expect(sameHistory(a, [item({ assigned: [542] }), a[1]])).toBe(false);
    expect(sameHistory(a, [item({ countsFor: '2026-11-04' }), a[1]])).toBe(false);
    expect(sameHistory(a, [item({ occurredAt: null }), a[1]])).toBe(false);
    expect(sameHistory(a, [a[1], a[0]])).toBe(false);
  });
});
