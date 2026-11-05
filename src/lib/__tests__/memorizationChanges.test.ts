import { countMemorizedWithPending, markedPagesNotLoaded, pruneCustomPlanForMemorized } from '../memorizationChanges';
import type { CustomPlan, UserPage } from '../../types';

describe('the selection over pages not loaded yet (ONBOARD-1)', () => {
  const pageOf = (n: number, status: 'memorized' | 'not_memorized' = 'not_memorized') =>
    ({ pageNumber: n, status }) as unknown as UserPage;
  const first450 = Array.from({ length: 450 }, (_, i) => pageOf(i + 1));
  const marked = (from: number, to: number) =>
    new Map(Array.from({ length: to - from + 1 }, (_, i) => [from + i, 'memorized' as const]));

  it('counts a marked page whether or not it has loaded', () => {
    expect(countMemorizedWithPending(first450, marked(582, 604))).toBe(23);
    expect(countMemorizedWithPending([], marked(1, 2))).toBe(2);
  });

  it('counts a loaded memorized page, and not one a pending change unmarks', () => {
    const pages = [pageOf(1, 'memorized'), pageOf(2, 'memorized')];
    expect(countMemorizedWithPending(pages, new Map())).toBe(2);
    expect(countMemorizedWithPending(pages, new Map([[2, 'not_memorized' as const]]))).toBe(1);
  });

  it('lists the marked pages not loaded yet, and none once they are', () => {
    expect(markedPagesNotLoaded(first450, marked(582, 604))).toEqual(Array.from({ length: 23 }, (_, i) => 582 + i));
    const all = Array.from({ length: 604 }, (_, i) => pageOf(i + 1));
    expect(markedPagesNotLoaded(all, marked(582, 604))).toEqual([]);
    // Unmarking a page that hasn't loaded saves nothing that could be lost.
    expect(markedPagesNotLoaded(first450, new Map([[600, 'not_memorized' as const]]))).toEqual([]);
  });
});

function plan(days: number[][]): CustomPlan {
  return {
    days,
    cycleStartDate: '2026-01-01',
    direction: 'forward',
  };
}

describe('pruneCustomPlanForMemorized', () => {
  it('removes pages no longer in the memorized set', () => {
    const input = plan([[1, 2, 3], [4, 5, 6]]);
    const result = pruneCustomPlanForMemorized(input, [1, 2, 4, 5]);
    expect(result.plan.days).toEqual([[1, 2], [4, 5]]);
    expect(result.removedPageCount).toBe(2);
  });

  it('preserves cycleStartDate and direction', () => {
    const input: CustomPlan = {
      days: [[1, 2]],
      cycleStartDate: '2026-03-15',
      direction: 'reverse',
    };
    const result = pruneCustomPlanForMemorized(input, [1, 2]);
    expect(result.plan.cycleStartDate).toBe('2026-03-15');
    expect(result.plan.direction).toBe('reverse');
  });

  it('reports newly-memorized pages not in any day', () => {
    const input = plan([[1, 2]]);
    const result = pruneCustomPlanForMemorized(input, [1, 2, 3, 4]);
    expect(result.unscheduledMemorizedCount).toBe(2);
    expect(result.removedPageCount).toBe(0);
  });

  it('treats an empty day as a rest day (kept as empty array)', () => {
    const input = plan([[1, 2], [], [3]]);
    const result = pruneCustomPlanForMemorized(input, [1, 2, 3]);
    expect(result.plan.days).toEqual([[1, 2], [], [3]]);
    expect(result.removedPageCount).toBe(0);
  });

  it('allows a day to become empty after pruning', () => {
    const input = plan([[1, 2], [3, 4]]);
    const result = pruneCustomPlanForMemorized(input, [1, 2]);
    expect(result.plan.days).toEqual([[1, 2], []]);
    expect(result.removedPageCount).toBe(2);
  });

  it('counts unscheduled correctly when some pages were also pruned', () => {
    const input = plan([[1, 2, 3]]);
    // Memorized: 1, 2, 4 — page 3 pruned, page 4 unscheduled
    const result = pruneCustomPlanForMemorized(input, [1, 2, 4]);
    expect(result.plan.days).toEqual([[1, 2]]);
    expect(result.removedPageCount).toBe(1);
    expect(result.unscheduledMemorizedCount).toBe(1);
  });

  it('handles a plan with no memorized pages at all', () => {
    const input = plan([[1, 2], [3, 4]]);
    const result = pruneCustomPlanForMemorized(input, []);
    expect(result.plan.days).toEqual([[], []]);
    expect(result.removedPageCount).toBe(4);
    expect(result.unscheduledMemorizedCount).toBe(0);
  });
});
