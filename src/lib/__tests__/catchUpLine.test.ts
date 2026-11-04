// The catch-up line on Home: one line, no guilt, the same words in VoiceOver.
import { catchUpLine } from '../todayLines';

const N = ' ';
const one = (pages: number[], ago: number, missed = true) => ({
  pages,
  days: [{ day: `d${ago}`, ago, missed }],
});

describe('catchUpLine', () => {
  it('nothing left over: no line', () => {
    expect(catchUpLine({ pages: [], days: [] })).toBeNull();
  });

  it('a missed yesterday: "Missed yesterday · Revise p. 559–563"', () => {
    const got = catchUpLine(one([559, 560, 561, 562, 563], 1));
    expect(got?.title).toBe(`Missed yesterday · Revise p.${N}559–563`);
    expect(got?.label).toBe('Missed yesterday · Revise page 559–563');
  });

  it('a single page reads "p. 7", not a range', () => {
    expect(catchUpLine(one([7], 1))?.title).toBe(`Missed yesterday · Revise p.${N}7`);
  });

  it('two days back says how long ago', () => {
    expect(catchUpLine(one([6, 7], 2))?.title).toBe(`Missed 2 days ago · Revise p.${N}6–7`);
  });

  it('several missed days say how many, and show their pages as one range', () => {
    const got = catchUpLine({
      pages: Array.from({ length: 15 }, (_, i) => 6 + i),
      days: [
        { day: 'd3', ago: 3, missed: true },
        { day: 'd2', ago: 2, missed: true },
        { day: 'd1', ago: 1, missed: true },
      ],
    });
    expect(got?.title).toBe(`Missed 3 days · Revise p.${N}6–20`);
  });

  it('a partly revised day reads "Left", not "Missed"', () => {
    expect(catchUpLine(one([13, 14, 15], 1, false))?.title).toBe(`Left yesterday · Revise p.${N}13–15`);
  });

  it('pages in two runs read "pp." and list both', () => {
    expect(catchUpLine(one([6, 7, 1, 2], 1))?.title).toBe(`Missed yesterday · Revise pp.${N}1–2, 6–7`);
  });

  it('more than two runs: the first two, then how many more', () => {
    expect(catchUpLine(one([1, 3, 5, 7], 1))?.title).toBe(`Missed yesterday · Revise pp.${N}1, 3 and 2 more`);
  });

  it('pages are shown in page order, whatever order they came in', () => {
    expect(catchUpLine(one([563, 559, 561], 1))?.title).toBe(`Missed yesterday · Revise pp.${N}559, 561 and 1 more`);
  });
});
