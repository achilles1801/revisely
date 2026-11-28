// Activity's rows (BEHAVIOUR.md ACT-37; Majd, Nov 27 2026: "the consistency text on the right ... is too much and starts
// to break the formatting -- this should never happen for any of them"): whatever the numbers, a row's figure and its
// words fit half the row on an iPhone SE, side by side at the usual text size and stacked at the largest the row allows,
// measured with the system font's own widths (jest/textWidth, from scripts/measure-sf-advances.swift).
import fc from 'fast-check';
import { textWidth } from '../../../jest/textWidth';
import { consistencyRow, coverageRow, gapsRow, pagesRow, paceRow, recitationRow, ROW_STACK_AT, type RowValue } from '../../../src/lib/activityRowValues';
import { ramadanRowValue } from '../../../src/components/ramadan/RamadanRow';
import { CHROME_MAX_SCALE } from '../../../src/components/activity/ChromeText';
import { runs } from './fixtures';

/** Half the row on an SE (320 pt, less layoutV2.gutter each side), the figure's `maxWidth: '50%'`. */
const ROOM = (320 - 2 * 16) / 2;

function fits(v: Pick<RowValue, 'figure' | 'unit'>): boolean {
  const figure = textWidth(v.figure, 'figure@20');
  const unit = v.unit ? textWidth(v.unit, 'meta@13') : 0;
  const inline = (figure + (v.unit ? 4 + unit : 0)) * ROW_STACK_AT;
  const stacked = Math.max(figure, unit) * CHROME_MAX_SCALE;
  return inline <= ROOM && stacked <= ROOM;
}

describe('[ACT-37] a row’s figure and its words fit half the row on an SE, whatever the numbers', () => {
  it('Consistency: any days revised of up to five years counted', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1826 }), fc.double({ min: 0, max: 1, noNaN: true }), (of, share) => fits(consistencyRow(Math.round(of * share), of))),
      { numRuns: runs(300) },
    );
  });

  it('Gaps: from today to ten years since the last revision', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 3650 }), (days) => fits(gapsRow(days))), { numRuns: runs(300) });
  });

  it('Coverage, Weak spots, Memorization, Pace and Recitation at any value they can show', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 999 }),
        fc.integer({ min: 0, max: 604 }),
        fc.double({ min: 0.1, max: 99, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (pct, tenths, pages, pace, score) =>
          fits(coverageRow(pct, null)) && fits(coverageRow(0, (tenths / 10).toFixed(1))) && fits(pagesRow(pages)) && fits(paceRow(pace)) && fits(recitationRow(score)!),
      ),
      { numRuns: runs(300) },
    );
  });

  it('Ramadan: before the month, any day of it, and Eid', () => {
    const dates = { start: '2027-02-08', eid: '2027-03-10' };
    const stats = (n: number) => ({ revisedDays: Array.from({ length: n }, (_, i) => `d${i}`), covered: 0 });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), fc.integer({ min: 1, max: 30 }), fc.double({ min: 0, max: 1, noNaN: true }), (daysTo, day, share) => {
        const done = Math.round(day * share);
        return (
          fits(ramadanRowValue({ phase: { kind: 'before', daysTo }, stats: stats(0), dates } as never)) &&
          fits(ramadanRowValue({ phase: { kind: 'during', day, lastTen: day > 20 }, stats: stats(done), dates } as never)) &&
          fits(ramadanRowValue({ phase: { kind: 'eid', day: 1 }, stats: stats(done), dates } as never))
        );
      }),
      { numRuns: runs(200) },
    );
  });

  it('the old words are what broke it: Consistency’s and Gaps’ longer forms don’t fit', () => {
    expect(fits({ figure: '7', unit: 'of the last 7 days · 8 of 9 since 19 November' })).toBe(false);
    expect(fits({ figure: 'Today', unit: 'you revised, after a 12-day gap' })).toBe(false);
    expect(fits({ figure: 'Over 3 weeks', unit: 'since your last revision, on 24 Oct' })).toBe(false);
  });
});
