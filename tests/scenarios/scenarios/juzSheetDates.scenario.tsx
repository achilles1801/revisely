// The juz sheet reads a page's record as the app holds it (ACT-21): a timestamp,
// "2026-09-23T18:30:00.000Z" (AppContext's timestampToISOString), not a bare day. Read as a day it gave
// NaN days ("Last revised NaN days ago") on every real account (Nov 8 2026).
import { juzSheetModel } from '../../../src/lib/juzSheet';

const TODAY = '2026-11-03';
const JUZ28 = Array.from({ length: 20 }, (_, i) => 542 + i);

describe('the juz sheet’s dates', () => {
  it('[ACT-21] a page last revised on a timestamp counts from its day', () => {
    const m = juzSheetModel({
      juz: 28,
      today: TODAY,
      pages: JUZ28.map((pageNumber) => ({ pageNumber, status: 'memorized', weaknessRating: 4, lastRevisedDate: '2026-09-23T18:30:00.000Z', skipCount: 0 })),
      revised: [],
      windowDays: 30,
      smartTracking: false,
    });
    expect(m.headline).not.toMatch(/NaN/);
    expect(m.headline).toMatch(/41 days ago$/);
    expect(m.stale).toBe(true);
    expect(m.surahs.every((s) => !/NaN/.test(s.text))).toBe(true);
  });
});
