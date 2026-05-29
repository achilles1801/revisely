import { pruneCustomPlanForMemorized } from '../memorizationChanges';
import type { CustomPlan } from '../../types';

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
