// Gaps on its own page (BEHAVIOUR.md ACT-42): for any history, from one day old to years, every day of the range is
// drawn once and marked as it was (revised, one day missed, a gap's day, today), the tiles say which length is which,
// at most three, and their values fit their tiles on an SE, side by side or stacked, measured with the system font's
// own widths (jest/textWidth).
import fc from 'fast-check';
import { textWidth } from '../../../jest/textWidth';
import { dayMarks, gapTiles, gapsView, MIN_GAP_DAYS, revisionDays } from '../../../src/lib/insightsGaps';
import { tileRoom, tilesStack, TILE_MIN_SHRINK } from '../../../src/components/activity/GapsPage';
import { runs } from './fixtures';

const TODAY = '2026-11-27';
const day = (back: number) => new Date(Date.UTC(2026, 10, 27 - back)).toISOString().slice(0, 10);

const history = fc.record({
  age: fc.integer({ min: 0, max: 900 }),
  window: fc.constantFrom(28, 90, 365),
  // Each day revised with this chance, so some histories are dense and some full of gaps.
  rate: fc.double({ min: 0.05, max: 1, noNaN: true }),
  seed: fc.integer({ min: 0, max: 1e6 }),
});

function build({ age, window, rate, seed }: { age: number; window: number; rate: number; seed: number }) {
  const days: string[] = [];
  for (let b = 0; b <= age; b++) {
    const x = Math.sin((b + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    if (x - Math.floor(x) < rate || b === age) days.push(day(b));
  }
  const revised = days.map((d) => ({ day: d, pages: [1] }));
  const firstDay = day(age);
  return { revised, window, firstDay, view: gapsView({ revised, today: TODAY, window, firstDay, knownSince: firstDay })! };
}

describe('[ACT-42] Gaps’ own page, for any history', () => {
  it('every day of the range once, marked as it was', () => {
    fc.assert(
      fc.property(history, (h) => {
        const { revised, view } = build(h);
        const marks = dayMarks(view, revised, TODAY);
        const done = new Set(revisionDays(revised, TODAY));
        const span = Math.round((Date.parse(TODAY) - Date.parse(view.rangeStart)) / 864e5) + 1;
        if (marks.length !== span || new Set(marks.map((m) => m.day)).size !== span) return false;
        return marks.every((m, i) => {
          if (done.has(m.day)) return m.mark === 'revised';
          if (m.mark === 'gap') return m.gap != null && view.gaps[m.gap].first <= m.day && m.day <= view.gaps[m.gap].last;
          // A missed day not in a gap is alone, or today's.
          return m.mark === 'today' ? i === marks.length - 1 : m.mark === 'missed';
        });
      }),
      { numRuns: runs(200) },
    );
  });

  it('at most three tiles, a gap’s with its dates, and none with no gap', () => {
    fc.assert(
      fc.property(history, (h) => {
        const { view } = build(h);
        const tiles = gapTiles(view);
        if (view.gaps.length === 0) return tiles.length === 0;
        return tiles.length <= 3 && tiles.every((t) => t.key === 'between' || !!t.dates) && view.gaps.every((g) => g.days >= MIN_GAP_DAYS);
      }),
      { numRuns: runs(200) },
    );
  });

  it('the tiles’ values fit on an SE at any text size the page allows', () => {
    fc.assert(
      fc.property(history, fc.constantFrom(1, 1.1, 1.19, 1.2, 1.6), fc.boolean(), (h, scale, inDays) => {
        const { view } = build(h);
        const values = gapTiles(view, inDays).map((t) => t.value);
        if (values.length === 0) return true;
        const room = tilesStack(values, 320, scale) ? tileRoom(320, 1) : tileRoom(320, values.length);
        return values.every((v) => textWidth(v, 'figure@20', scale) * TILE_MIN_SHRINK <= room);
      }),
      { numRuns: runs(200) },
    );
  });
});
