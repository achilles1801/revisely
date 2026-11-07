import { manualRevisionItem, pagesInRange, parsePageRange, STRENGTH_RATING } from '../manualRevision';

describe('manual Revised items', () => {
  it('reads a page range: integers 1–604, From not after To', () => {
    expect(parsePageRange('556', '557')).toEqual({ from: 556, to: 557 });
    expect(parsePageRange(' 5 ', '5')).toEqual({ from: 5, to: 5 });
    expect(parsePageRange('557', '556')).toBeNull();
    expect(parsePageRange('0', '3')).toBeNull();
    expect(parsePageRange('600', '605')).toBeNull();
    expect(parsePageRange('', '3')).toBeNull();
    expect(parsePageRange('1.5', '3')).toBeNull();
    expect(pagesInRange({ from: 3, to: 5 })).toEqual([3, 4, 5]);
  });

  it('builds a manual item for today, with no plan assignment or skips', () => {
    const item = manualRevisionItem({ uid: 'u1', day: '2026-11-03', now: 1000, pages: [557, 556], minutes: 8 });
    expect(item).toEqual({
      id: 'manual-2026-11-03-1000',
      uid: 'u1',
      day: '2026-11-03',
      occurredAt: 1000,
      countsFor: '2026-11-03',
      source: 'manual',
      pages: [556, 557],
      skipped: [],
      assigned: [],
      minutes: 8,
      recordings: [],
    });
  });

  it('[ACT-16] carries the strength chosen as each page’s rating, for the self-heal', () => {
    const item = manualRevisionItem({ uid: 'u1', day: '2026-11-03', now: 1000, pages: [557, 556], minutes: null, rating: STRENGTH_RATING.weak });
    expect(item.ratings).toEqual({ '556': 2, '557': 2 });
    expect('ratings' in manualRevisionItem({ uid: 'u1', day: '2026-11-03', now: 1000, pages: [1], minutes: null })).toBe(false);
  });

  it('maps strength to the weakness rating bins (ACT-8)', () => {
    expect(STRENGTH_RATING).toEqual({ weak: 2, moderate: 3, strong: 4 });
  });
});
