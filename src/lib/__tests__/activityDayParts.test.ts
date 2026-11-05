import { stripCells, strengthCounts, strengthOf, windowFooterText } from '../activityDayParts';

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

  it('the footer names the Fajr window when there is one, and midnight otherwise', () => {
    const fmt = (d: Date) => `${d.getHours()}:${d.getMinutes()}`;
    expect(windowFooterText('Tuesday', new Date(2026, 10, 3, 5, 22), new Date(2026, 10, 4, 5, 23), fmt)).toBe(
      'Tuesday runs Fajr to Fajr, 5:22 to 5:23',
    );
    expect(windowFooterText('Tuesday', null, null, fmt)).toBe('Tuesday runs midnight to midnight');
  });
});
