// Insights' one chart (BEHAVIOUR.md ACT-41): which bars show their value and their label, for any number of bars and any
// pick. Values over every bar up to 7, else over the lit one; labels for every bar up to 10, else the ends and the pick,
// never two side by side past 10.
import fc from 'fast-check';
import { LABELS_ALL_UP_TO, labelShown, litIndex, VALUES_ALL_UP_TO, valueShown } from '../../../src/components/activity/TapChart';
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

  it('every label up to 10; past that the pick always, the ends unless next to it, and no two labels side by side', () => {
    fc.assert(
      fc.property(chart, ({ n, picked }) => {
        const shown = Array.from({ length: n }, (_, i) => labelShown(n, i, picked));
        if (n <= LABELS_ALL_UP_TO) return shown.every(Boolean);
        if (picked != null && !shown[picked]) return false;
        for (const end of [0, n - 1]) if (picked == null || Math.abs(end - picked) > 1) if (!shown[end]) return false;
        for (let i = 1; i < n; i++) if (shown[i] && shown[i - 1]) return false;
        return shown.filter(Boolean).length <= 3;
      }),
      { numRuns: runs(300) },
    );
  });
});
