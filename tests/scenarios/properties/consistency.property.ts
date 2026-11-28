// Consistency's own page (BEHAVIOUR.md ACT-43): for any days revised, any account age and any range, the figure counts
// only days in the range and never more than its days, the trend is measured only when the account and the items reach
// back as far as the range again, the weeks never start before the account and end with this one, and the full cycles
// follow one another day after day, each finished one having revised every page it needed.
import fc from 'fast-check';
import {
  CONSISTENCY_LOAD_DAYS,
  cyclesFigure,
  daysAgainstBefore,
  fullCycles,
  mostWeeks,
  SPAN_WEEKS,
  weekBars,
  wholeWeekCounts,
} from '../../../src/lib/consistencyView';
import { daysBetween, shiftDay } from '../../../src/lib/dayKeys';
import { weekStart } from '../../../src/lib/activityHeatmap';
import { runs } from './fixtures';

const TODAY = '2026-11-27';
const RANGES = [7, 30, 90] as const;

/** An account up to two years old, revised on some of its days. */
const history = fc
  .record({
    age: fc.integer({ min: 0, max: 730 }),
    gaps: fc.array(fc.boolean(), { minLength: 1, maxLength: 60 }),
    range: fc.constantFrom(...RANGES),
    all: fc.boolean(),
  })
  .map(({ age, gaps, range, all }) => {
    const firstDay = shiftDay(TODAY, -age);
    const days: string[] = [];
    for (let k = 0; k <= age; k++) if (gaps[k % gaps.length]) days.push(shiftDay(TODAY, -k));
    return { firstDay, days: days.sort(), range, all };
  });

describe('[ACT-43] Consistency’s figure, trend and weeks', () => {
  it('the figure counts the range’s days only, never more than its days or the account’s; the trend only when both spans are read', () => {
    fc.assert(
      fc.property(history, fc.integer({ min: 0, max: 800 }), ({ firstDay, days, range, all }, loaded) => {
        const set = new Set(days);
        const window = all ? daysBetween(firstDay, TODAY) + 1 : range;
        const itemsFrom = shiftDay(TODAY, -loaded);
        const f = daysAgainstBefore(set, TODAY, window, all, firstDay, itemsFrom);
        const age = daysBetween(firstDay, TODAY) + 1;
        if (f.of !== Math.min(window, age) || f.done > f.of) return false;
        if (f.done !== days.filter((d) => daysBetween(d, TODAY) < f.of).length) return false;
        const reaches = !all && age >= 2 * window && loaded >= 2 * window - 1;
        if (reaches !== (f.before != null)) return false;
        return f.before == null || (f.before >= 0 && f.before <= window);
      }),
      { numRuns: runs(300) },
    );
  });

  it('the weeks end with this one, start no earlier than the account’s first, count no day before it or after today', () => {
    fc.assert(
      fc.property(history, fc.constantFrom('4w', '3m', '1y') as fc.Arbitrary<keyof typeof SPAN_WEEKS>, ({ firstDay, days }, span) => {
        const bars = weekBars(days.map((day) => ({ day, minutes: 10 })), TODAY, SPAN_WEEKS[span], firstDay);
        if (bars.length === 0 || bars.length > SPAN_WEEKS[span]) return false;
        if (bars[bars.length - 1].week !== weekStart(TODAY) || !bars[bars.length - 1].current) return false;
        if (bars[0].week < weekStart(firstDay)) return false;
        for (let i = 1; i < bars.length; i++) if (daysBetween(bars[i - 1].week, bars[i].week) !== 7) return false;
        return bars.every((b) => b.days <= b.of && b.of <= 7 && b.of >= 1 && b.minutes === b.days * 10);
      }),
      { numRuns: runs(300) },
    );
  });

  it('most weeks is the middle half of whole weeks only, and none under three of them', () => {
    fc.assert(
      fc.property(history, ({ firstDay, days, range }) => {
        const counts = wholeWeekCounts(new Set(days), TODAY, range, firstDay);
        if (counts.some((c) => c < 0 || c > 7)) return false;
        const m = mostWeeks(counts);
        if (counts.length < 3) return m == null;
        return m != null && m.lo <= m.hi && counts.includes(m.lo) && counts.includes(m.hi);
      }),
      { numRuns: runs(300) },
    );
  });

  it('the page reads a year of weeks and this one', () => {
    expect(CONSISTENCY_LOAD_DAYS).toBeGreaterThanOrEqual(7 * SPAN_WEEKS['1y'] + 6);
  });
});

describe('[ACT-43] full cycles', () => {
  const pagesArb = fc.integer({ min: 1, max: 40 });
  it('follow one another day after day; a finished one revised every page it needed; the one under way ends today', () => {
    fc.assert(
      fc.property(
        pagesArb,
        fc.array(fc.record({ ago: fc.integer({ min: 0, max: 200 }), pages: fc.array(fc.integer({ min: 1, max: 40 }), { maxLength: 12 }) }), { maxLength: 120 }),
        fc.integer({ min: 1, max: 40 }),
        (count, raw, planDays) => {
          const memorized = new Set(Array.from({ length: count }, (_, i) => i + 1));
          const revised = raw.map((r) => ({ day: shiftDay(TODAY, -r.ago), pages: r.pages }));
          const cycles = fullCycles({ revised, memorized, today: TODAY });
          if (revised.length === 0) return cycles.length === 0;
          for (let i = 0; i < cycles.length; i++) {
            const c = cycles[i];
            if (c.days !== daysBetween(c.from, c.to ?? TODAY) + 1) return false;
            if (i > 0 && c.from !== shiftDay(cycles[i - 1].to!, 1)) return false;
            if (c.to != null) {
              if (c.covered !== c.of) return false;
              // Every page it needed was revised between its first and last day.
              const seen = new Set(revised.filter((r) => r.day >= c.from && r.day <= c.to!).flatMap((r) => r.pages));
              for (const p of memorized) if (!seen.has(p)) return false;
            } else if (i !== cycles.length - 1 || c.covered > c.of) return false;
          }
          const f = cyclesFigure(cycles, planDays, TODAY, 30, false, '2020-01-01', '2020-01-01');
          return f.onTime <= f.finished.length && f.finished.every((c) => c.to != null && daysBetween(c.to, TODAY) < 30);
        },
      ),
      { numRuns: runs(300) },
    );
  });

  it('a page memorized after a cycle began is not needed until the next', () => {
    const memorized = new Set([1, 2, 3]);
    const since = new Map([[3, '2026-11-20']]);
    const revised = [
      { day: '2026-11-18', pages: [1] },
      { day: '2026-11-19', pages: [2] },
      { day: '2026-11-21', pages: [1, 2] },
      { day: '2026-11-22', pages: [3] },
    ];
    expect(fullCycles({ revised, memorized, since, today: TODAY })).toEqual([
      { from: '2026-11-18', to: '2026-11-19', days: 2, covered: 2, of: 2 },
      { from: '2026-11-20', to: '2026-11-22', days: 3, covered: 3, of: 3 },
      { from: '2026-11-23', to: null, days: 5, covered: 0, of: 3 },
    ]);
  });
});
