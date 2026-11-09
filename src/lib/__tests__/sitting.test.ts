import { HELD_MS, notePageOnScreen, pagesHeld, pageTimesAt, pauseTimer, readingSessionFromTimer, resumeTimer, startTimer } from '../readingTimer';
import { plainText } from '../passages';
import { sittingDayWord, sittingSavedText, sittingToReviseText } from '../sitting';

const MIN = 60_000;

describe('a sitting in the reader (REC-1)', () => {
  it('times each page while it is on screen, not while paused', () => {
    let t = startTimer('stopwatch', null, '2026-11-03', 0);
    t = notePageOnScreen(t, 562, 0);
    t = notePageOnScreen(t, 563, 20 * MIN);
    t = pauseTimer(t, 30 * MIN);
    // Ten minutes paused: not counted.
    t = resumeTimer(t, 40 * MIN);
    t = notePageOnScreen(t, 564, 45 * MIN);
    expect(pageTimesAt(t, 45 * MIN + 30_000)).toEqual({ '562': 20 * MIN, '563': 15 * MIN, '564': 30_000 });
  });

  it('holds the pages on screen a minute or more, in the order first seen', () => {
    let t = { ...startTimer('stopwatch', null, '2026-11-03', 0), pagesVisited: [562, 563, 564] };
    t = notePageOnScreen(t, 562, 0);
    t = notePageOnScreen(t, 563, 20 * MIN);
    t = notePageOnScreen(t, 564, 35 * MIN);
    expect(pagesHeld(t, 35 * MIN + 40_000)).toEqual([562, 563]);
    expect(pagesHeld(t, 35 * MIN + HELD_MS)).toEqual([562, 563, 564]);
    // A timer kept before page times: every page it visited.
    expect(pagesHeld({ ...startTimer('stopwatch', null, '2026-11-03', 0), pagesVisited: [5, 6] }, MIN)).toEqual([5, 6]);
  });

  it('says what was saved, by surah and ayah, and on which day', () => {
    expect(plainText(sittingSavedText({ day: '2026-11-03', today: '2026-11-03', pages: [562, 563], seconds: 41 * 60 + 3 }))).toBe('Saved to today: Al-Mulk, ayahs 1–26, 41 min');
    expect(sittingSavedText({ day: '2026-11-02', today: '2026-11-03', pages: [], seconds: 20 })).toBe('Saved to Monday: 1 min');
    expect(sittingDayWord('2026-11-03', '2026-11-03')).toBe('today');
  });

  it('[REC-2] a sitting is saved with the pages it held when asked; pages marked revised win', () => {
    let t = { ...startTimer('stopwatch', null, '2026-11-03', 0), pagesVisited: [562, 563, 564] };
    t = notePageOnScreen(t, 562, 0);
    t = notePageOnScreen(t, 563, 20 * MIN);
    t = notePageOnScreen(t, 564, 35 * MIN);
    const end = 35 * MIN + 20_000;
    expect(readingSessionFromTimer(t, end, { pagesHeld: true }).pages).toEqual([562, 563]);
    expect(readingSessionFromTimer(t, end).pages).toEqual([]);
    expect(readingSessionFromTimer({ ...t, pagesRevised: [10] }, end, { pagesHeld: true }).pages).toEqual([10]);
    expect(readingSessionFromTimer(t, end, { pagesHeld: true }).pagesVisited).toEqual([562, 563, 564]);
  });
});

describe('a sitting’s Add to revised line (REC-3)', () => {
  it('names the pages by surah and says how much of the day’s revision they are', () => {
    expect(plainText(sittingToReviseText([556, 557], [556, 557], 'today'))).toBe('At-Taghabun is the 2 pages left of today’s revision.');
    expect(plainText(sittingToReviseText([556, 557], [554, 555, 556, 557], 'today'))).toBe('At-Taghabun is 2 of the 4 pages left of today’s revision.');
    expect(plainText(sittingToReviseText([562], [562], 'yesterday'))).toBe('Al-Mulk, ayahs 1–12 is the page left of yesterday’s revision.');
  });
});
