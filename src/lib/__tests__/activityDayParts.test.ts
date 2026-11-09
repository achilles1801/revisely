import { stripCells, strengthCounts, strengthOf, stripSummary } from '../activityDayParts';

describe('the day view’s figures', () => {
  it('the strip has one cell per assigned page: revised, skipped (hollow) or not reached', () => {
    const cells = stripCells([1, 2, 3, 4], [1, 2], [3], new Set([2]));
    expect(cells.map((c) => c.state)).toEqual(['revised', 'revised', 'skipped', 'not-reached']);
    expect(cells[1].weak).toBe(true);
    expect(cells[0].weak).toBe(false);
  });

  it('strength: 1–2 weak, 3 moderate, 4–5 strong; the counts add up to the revised pages', () => {
    expect([1, 2, 3, 4, 5].map(strengthOf)).toEqual(['weak', 'weak', 'moderate', 'strong', 'strong']);
    const counts = strengthCounts([1, 2, 3, 9], (p) => ({ 1: 1, 2: 2, 3: 3 } as Record<number, number>)[p]);
    expect(counts).toEqual({ weak: 2, moderate: 1, strong: 1 });
  });
});

describe('the strip in words (without Smart Tracking, ACT-19)', () => {
  it('names each state it has, in the strip’s order', () => {
    expect(stripSummary(stripCells([1, 2, 3, 4, 5], [1, 2], [3], new Set()))).toBe('2 revised · 1 skipped · 2 not reached');
    expect(stripSummary(stripCells([1, 2], [1, 2], [], new Set()))).toBe('2 revised');
    expect(stripSummary([])).toBe('');
  });
});
