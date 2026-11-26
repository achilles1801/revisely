// What a Ramadan has held so far (BEHAVIOUR.md THEME-6, THEME-7): the days revised, the pages and minutes, and the pages
// through the Qur'an since 1 Ramadan.

import { ramadanStats } from '../ramadanStats';

const D = { start: '2027-02-08', eid: '2027-03-09' };
const log = (date: string, pages: number[], minutes: number | null = 10) => ({ date, pagesRevised: pages, durationMinutes: minutes });
const reading = (date: string, pages: number[], visited: number[] = [], seconds = 600) => ({ date, pages, pagesVisited: visited, durationSeconds: seconds });

describe('[THEME-7] a Ramadan’s figures', () => {
  it('counts only Ramadan’s days up to today, a day revised only when it revised pages', () => {
    const s = ramadanStats(
      [log('2027-02-07', [1, 2]), log('2027-02-08', [1, 2, 3]), log('2027-02-10', []), log('2027-02-12', [3, 4], null), log('2027-02-25', [9])],
      [],
      D,
      '2027-02-19',
    );
    expect(s.daysSoFar).toBe(12);
    expect(s.revisedDays).toEqual([1, 5]);
    expect(s.pagesRevised).toBe(5);
    expect(s.minutesRevised).toBe(10);
    expect(s.covered).toBe(4);
  });

  it('reads a reading’s own pages, else the pages it opened, once each', () => {
    const s = ramadanStats([], [reading('2027-02-09', [10, 11]), reading('2027-02-10', [], [11, 12], 1200), reading('2027-01-30', [500])], D, '2027-02-19');
    expect(s.pagesRead).toBe(3);
    expect(s.minutesRead).toBe(30);
    expect(s.covered).toBe(3);
  });

  it('reaches 604, and no further, when every page has been revised or read', () => {
    const all = Array.from({ length: 604 }, (_, i) => i + 1);
    const s = ramadanStats([log('2027-02-20', all.slice(0, 300))], [reading('2027-02-21', [...all.slice(300), 605])], D, '2027-03-11');
    expect(s.covered).toBe(604);
    expect(s.daysSoFar).toBe(29);
  });

  it('is empty before Ramadan', () => {
    const s = ramadanStats([log('2027-02-01', [1])], [], D, '2027-02-01');
    expect(s).toMatchObject({ daysSoFar: 0, revisedDays: [], covered: 0 });
  });
});
