// Insights' one chart (BEHAVIOUR.md ACT-41): which bars show their value and their label, for any number of bars and any
// pick. Values over every bar up to 7, else over the lit one; labels for every bar up to 10, else the ends and the pick,
// each in room of its own inside the chart, never two side by side or over each other past 10.
import fc from 'fast-check';
import { chartLayout, LABEL_WIDTH, labelLeft, labelRoom, LABELS_ALL_UP_TO, labelShown, litIndex, MAX_BAR_WIDTH, MIN_SLOTS, VALUES_ALL_UP_TO, valueShown } from '../../../src/components/activity/TapChart';
import { runs } from './fixtures';

const chart = fc.integer({ min: 1, max: 60 }).chain((n) => fc.record({ n: fc.constant(n), picked: fc.option(fc.integer({ min: 0, max: n - 1 }), { nil: null }) }));

describe('[ACT-41] the chart’s values and labels', () => {
  it('a value over every bar up to 7, else over the lit one only: the pick, or the newest', () => {
    fc.assert(
      fc.property(chart, ({ n, picked }) => {
        const shown = Array.from({ length: n }, (_, i) => valueShown(n, i, picked));
        if (n <= VALUES_ALL_UP_TO) return shown.every(Boolean);
        const lit = litIndex(n, picked);
        return shown.filter(Boolean).length === 1 && shown[lit] && lit === (picked ?? n - 1);
      }),
      { numRuns: runs(300) },
    );
  });

  it('every label up to 10; past that the pick always, the ends unless within a label’s room of it, never two side by side', () => {
    fc.assert(
      fc.property(chart, fc.integer({ min: 1, max: 30 }), ({ n, picked }, room) => {
        const shown = Array.from({ length: n }, (_, i) => labelShown(n, i, picked, room));
        if (n <= LABELS_ALL_UP_TO) return shown.every(Boolean);
        if (picked != null && !shown[picked]) return false;
        for (const end of [0, n - 1]) if (shown[end] !== (end === picked || picked == null || Math.abs(end - picked) > room)) return false;
        for (let i = 1; i < n; i++) if (shown[i] && shown[i - 1]) return false;
        return shown.filter(Boolean).length <= 3;
      }),
      { numRuns: runs(300) },
    );
  });

  it('past 10 bars a label has room of its own, inside the chart, and never meets another (ACT-43: "31 Aug" was cut to its 3 pt slot)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 11, max: 60 }), fc.integer({ min: 240, max: 500 }), fc.double({ min: 1, max: 1.4, noNaN: true }), fc.integer({ min: 0, max: 59 }), (n, width, scale, p) => {
        const picked = p % n;
        const l = chartLayout(n, width);
        const step = l.slot + l.gap;
        const w = Math.min(width / 2, LABEL_WIDTH * scale);
        const room = labelRoom(step, w);
        const spans = Array.from({ length: n }, (_, i) => i)
          .filter((i) => labelShown(n, i, picked, room))
          .map((i) => labelLeft(i, l.lead, step, l.gap, w, width))
          .sort((a, b) => a - b);
        for (const left of spans) if (left < -1e-6 || left + w > width + 1e-6) return false;
        for (let i = 1; i < spans.length; i++) if (spans[i] < spans[i - 1] + w - 1e-6) return false;
        return true;
      }),
      { numRuns: runs(300) },
    );
  });

  it('never one block: a bar is never wider than the maximum, at least 7 slots, and they fit the width (Majd: "garbage ui")', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 120 }), fc.integer({ min: 280, max: 500 }), (n, width) => {
        const l = chartLayout(n, width);
        return (
          l.slots >= MIN_SLOTS &&
          l.slots === Math.max(n, MIN_SLOTS) &&
          l.lead === l.slots - n &&
          l.bar <= MAX_BAR_WIDTH &&
          l.bar > 0 &&
          l.bar <= l.slot &&
          l.slots * l.slot + (l.slots - 1) * l.gap <= width + 1e-6
        );
      }),
      { numRuns: runs(300) },
    );
  });
});
