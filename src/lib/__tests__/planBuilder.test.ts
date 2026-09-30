import {
  applyGroupSelection,
  buildBalancedPlanFromStart,
  buildJuzPlanFromStart,
  defaultStartPage,
  effectiveDailyPages,
  groupDays,
  isGroupFullyIncluded,
  moveDay,
  orderPages,
  planStats,
  resolveStartPage,
  rotateCustomPlanToToday,
  rotateDaysToStartPage,
  rotatePagesToStart,
  splitIntoBalancedDays,
} from '../planBuilder';
import {
  describeStartPage,
  memorizedJuzGroups,
  memorizedSurahGroups,
  pageRangeLabel,
  summarizeDay,
} from '../planDisplay';
import type { UserPage } from '../../types';

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function makePage(pageNumber: number): UserPage {
  return {
    pageNumber,
    status: 'memorized',
    dateMemorized: '2026-01-01',
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  };
}

describe('orderPages', () => {
  it('dedupes and sorts ascending, or descending for reverse', () => {
    expect(orderPages([5, 1, 3, 3])).toEqual([1, 3, 5]);
    expect(orderPages([5, 1, 3], 'reverse')).toEqual([5, 3, 1]);
  });
});

describe('resolveStartPage', () => {
  const memorized = [1, 2, 3, 10, 11, 12];

  it('returns the start page itself when memorized', () => {
    expect(resolveStartPage(memorized, 10)).toBe(10);
  });

  it('snaps forward to the next memorized page', () => {
    expect(resolveStartPage(memorized, 5)).toBe(10);
  });

  it('wraps to the first memorized page past the end', () => {
    expect(resolveStartPage(memorized, 200)).toBe(1);
  });

  it('snaps backward in reverse and wraps to the last page', () => {
    expect(resolveStartPage(memorized, 5, 'reverse')).toBe(3);
    expect(resolveStartPage([10, 11], 2, 'reverse')).toBe(11);
  });

  it('defaults to the natural beginning and handles empty sets', () => {
    expect(resolveStartPage(memorized, null)).toBe(1);
    expect(resolveStartPage(memorized, undefined, 'reverse')).toBe(12);
    expect(resolveStartPage([], 3)).toBeNull();
  });
});

describe('rotatePagesToStart', () => {
  it('starts at the chosen page and wraps the rest to the end', () => {
    expect(rotatePagesToStart([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5, 1, 2]);
  });

  it('works in reverse', () => {
    expect(rotatePagesToStart([1, 2, 3, 4, 5], 3, 'reverse')).toEqual([3, 2, 1, 5, 4]);
  });
});

describe('splitIntoBalancedDays', () => {
  it('uses the fewest days that fit the quota and evens them out', () => {
    const days = splitIntoBalancedDays(range(1, 25), 10);
    expect(days.map((d) => d.length)).toEqual([9, 8, 8]);
    expect(days.flat()).toEqual(range(1, 25));
  });

  it('gives exact days when the quota divides evenly', () => {
    expect(splitIntoBalancedDays(range(1, 20), 5).map((d) => d.length)).toEqual([
      5, 5, 5, 5,
    ]);
  });

  it('returns a single day when the quota exceeds the total', () => {
    expect(splitIntoBalancedDays([1, 2, 3], 20)).toEqual([[1, 2, 3]]);
  });

  it('guards against zero / invalid quotas', () => {
    expect(splitIntoBalancedDays([1, 2], 0)).toEqual([[1], [2]]);
    expect(splitIntoBalancedDays([], 5)).toEqual([]);
  });
});

describe('buildBalancedPlanFromStart', () => {
  const memorized = range(1, 30);

  it('starts today at the chosen page and wraps around', () => {
    const days = buildBalancedPlanFromStart(memorized, { pagesPerDay: 10, startPage: 21 });
    expect(days).toEqual([range(21, 30), range(1, 10), range(11, 20)]);
  });

  it('never repeats or drops a page', () => {
    const days = buildBalancedPlanFromStart(memorized, { pagesPerDay: 7, startPage: 13 });
    const flat = days.flat();
    expect(flat).toHaveLength(30);
    expect(new Set(flat).size).toBe(30);
    expect(flat[0]).toBe(13);
    expect(Math.max(...days.map((d) => d.length))).toBeLessThanOrEqual(7);
  });

  it('resolves a non-memorized start (e.g. a surah start) to the next memorized page', () => {
    const days = buildBalancedPlanFromStart([1, 2, 50, 51], { pagesPerDay: 2, startPage: 22 });
    expect(days).toEqual([[50, 51], [1, 2]]);
  });

  it('supports reverse order', () => {
    const days = buildBalancedPlanFromStart(range(1, 6), {
      pagesPerDay: 3,
      startPage: 4,
      direction: 'reverse',
    });
    expect(days).toEqual([[4, 3, 2], [1, 6, 5]]);
  });

  it('matches the plain split when no start is given', () => {
    expect(buildBalancedPlanFromStart(range(1, 4), { pagesPerDay: 2 })).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe('rotateDaysToStartPage', () => {
  const days = [[1, 2], [3, 4], [5, 6]];

  it('brings the day containing the start page to index 0', () => {
    expect(rotateDaysToStartPage(days, 4)).toEqual([[3, 4], [5, 6], [1, 2]]);
  });

  it('snaps to the next day when the page is not in the plan', () => {
    expect(rotateDaysToStartPage([[1], [10], [20]], 12)).toEqual([[20], [1], [10]]);
  });

  it('returns a copy when no start is given', () => {
    const out = rotateDaysToStartPage(days, null);
    expect(out).toEqual(days);
    expect(out).not.toBe(days);
  });
});

describe('groupDays', () => {
  it('merges consecutive days', () => {
    expect(groupDays([[1], [2], [3]], 2)).toEqual([[1, 2], [3]]);
    expect(groupDays([[1], [2]], 1)).toEqual([[1], [2]]);
  });
});

describe('buildJuzPlanFromStart', () => {
  // Juz 1 = pages 1–21, juz 2 = 22–41, juz 3 = 42–61 (Madani mushaf).
  const pages = [...range(1, 3), ...range(22, 24), ...range(42, 44)].map(makePage);

  it('builds one day per juz starting with the juz that holds the start page', () => {
    const days = buildJuzPlanFromStart(pages, { startPage: 22 });
    expect(days.map((d) => d[0])).toEqual([22, 42, 1]);
  });

  it('groups several juz per day', () => {
    const days = buildJuzPlanFromStart(pages, { juzPerDay: 2 });
    expect(days).toHaveLength(2);
    expect(days[0]).toEqual([...range(1, 3), ...range(22, 24)]);
  });

  it('reverses the day order', () => {
    const days = buildJuzPlanFromStart(pages, { direction: 'reverse' });
    expect(days.map((d) => d[0])).toEqual([42, 22, 1]);
  });
});

describe('effectiveDailyPages', () => {
  it('uses the page capacity in pages mode and ~20 pages per juz in juz mode', () => {
    expect(
      effectiveDailyPages({ scheduleMode: 'pages', dailyPageCapacity: 12, dailyJuzCount: 1 }),
    ).toBe(12);
    expect(
      effectiveDailyPages({ scheduleMode: 'juz', dailyPageCapacity: 12, dailyJuzCount: 2 }),
    ).toBe(40);
  });
});

describe('defaultStartPage', () => {
  it("prefers where today's revision begins", () => {
    expect(defaultStartPage([[40, 41], [1, 2]], [1, 2, 40, 41])).toBe(40);
  });

  it('skips a rest day today', () => {
    expect(defaultStartPage([[], [7]], [1, 7])).toBe(7);
  });

  it('falls back to the first memorized page', () => {
    expect(defaultStartPage([], [9, 3])).toBe(3);
    expect(defaultStartPage([], [])).toBeNull();
  });
});

describe('planStats', () => {
  it('counts days, rest days and the per-day range', () => {
    expect(planStats([[1, 2, 3], [], [4]])).toEqual({
      dayCount: 3,
      totalPages: 4,
      restDays: 1,
      minPerDay: 1,
      maxPerDay: 3,
    });
  });
});

describe('rotateCustomPlanToToday', () => {
  const plan = { days: [[1], [2], [3]], cycleStartDate: '2026-06-01' };

  it('is unchanged on the start day', () => {
    expect(rotateCustomPlanToToday(plan, new Date(2026, 5, 1, 15))).toEqual([[1], [2], [3]]);
  });

  it("puts today's slot first", () => {
    expect(rotateCustomPlanToToday(plan, new Date(2026, 5, 3, 9))).toEqual([[3], [1], [2]]);
    expect(rotateCustomPlanToToday(plan, new Date(2026, 5, 5, 9))).toEqual([[2], [3], [1]]);
  });

  it('does not rotate a cycle that starts in the future', () => {
    expect(rotateCustomPlanToToday(plan, new Date(2026, 4, 30))).toEqual([[1], [2], [3]]);
  });
});

describe('moveDay', () => {
  it('moves a day and clamps the target', () => {
    expect(moveDay([[1], [2], [3]], 0, 1)).toEqual([[2], [1], [3]]);
    expect(moveDay([[1], [2], [3]], 2, 99)).toEqual([[1], [2], [3]]);
    expect(moveDay([[1], [2], [3]], 2, -1)).toEqual([[3], [1], [2]]);
  });
});

describe('planDisplay', () => {
  it('summarizes a day', () => {
    expect(summarizeDay([])).toMatchObject({ title: 'Rest Day', isRest: true });
    const s = summarizeDay(range(22, 31));
    expect(s.title).toBe('Juz 2');
    expect(s.subtitle).toContain('Al-Baqarah');
    expect(s.subtitle).toContain('10 pages');
    expect(summarizeDay([21, 22]).title).toBe('Juz 1–2');
  });

  it('formats page ranges', () => {
    expect(pageRangeLabel([3, 1, 2])).toBe('p. 1–3');
    expect(pageRangeLabel([1, 5, 6, 9], 2)).toBe('p. 1, 5–6 +1 more');
  });

  it('groups memorized pages by surah including shared short-surah pages', () => {
    const groups = memorizedSurahGroups([603]);
    expect(groups.map((g) => g.number)).toEqual([109, 110, 111]);
  });

  it('groups memorized pages by juz', () => {
    expect(memorizedJuzGroups([22, 1, 2])).toEqual([
      expect.objectContaining({ juz: 1, pages: [1, 2] }),
      expect.objectContaining({ juz: 2, pages: [22] }),
    ]);
  });

  it('describes a start page', () => {
    expect(describeStartPage(22)).toEqual({ title: 'Al-Baqarah', subtitle: 'Page 22 · Juz 2' });
  });
});

describe('applyGroupSelection', () => {
  const groups = [
    { key: 'surah:1', pages: [1] },
    { key: 'surah:2', pages: [2, 3, 4, 5] },
    { key: 'juz:2', pages: [22, 23] },
  ];

  it('keeps partial content untouched when nothing changes', () => {
    const day = [3, 4];
    expect(applyGroupSelection(day, groups, new Set(), new Set())).toEqual([3, 4]);
  });

  it('adds newly checked groups after existing pages', () => {
    expect(
      applyGroupSelection([3, 4], groups, new Set(), new Set(['juz:2', 'surah:1'])),
    ).toEqual([3, 4, 1, 22, 23]);
  });

  it('removes groups that were unchecked', () => {
    expect(
      applyGroupSelection([1, 22, 23], groups, new Set(['surah:1', 'juz:2']), new Set(['juz:2'])),
    ).toEqual([22, 23]);
  });

  it('completes a partially included group when checked', () => {
    expect(applyGroupSelection([3], groups, new Set(), new Set(['surah:2']))).toEqual([
      3, 2, 4, 5,
    ]);
  });

  it('reports full inclusion', () => {
    expect(isGroupFullyIncluded([1, 2], groups[0])).toBe(true);
    expect(isGroupFullyIncluded([2, 3], groups[1])).toBe(false);
  });
});
