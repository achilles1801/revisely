import { plainText } from '../passages';
import { creditLine, dayTitle, formatDayLong, formatMinutesLong, formatPagesShort, windowFooter } from '../activityFormat';

describe('Activity minutes (gap audit H)', () => {
  it('reads "8 min", "1 h 5 min" and "2 h"', () => {
    expect(formatMinutesLong(8)).toBe('8 min');
    expect(formatMinutesLong(0)).toBe('0 min');
    expect(formatMinutesLong(65)).toBe('1 h 5 min');
    expect(formatMinutesLong(120)).toBe('2 h');
    expect(formatMinutesLong(17.4)).toBe('17 min');
  });
});

describe('Day titles (gap audit §4)', () => {
  it('reads "Wednesday 28 October"', () => {
    expect(formatDayLong('2026-10-28')).toBe('Wednesday 28 October');
  });
  it('names today and yesterday, and earlier days by weekday', () => {
    expect(dayTitle('2026-11-03', '2026-11-03')).toEqual({ title: 'Today', subtitle: 'Tuesday 3 November' });
    expect(dayTitle('2026-11-02', '2026-11-03')).toEqual({ title: 'Yesterday', subtitle: 'Monday 2 November' });
    expect(dayTitle('2026-10-28', '2026-11-03')).toEqual({ title: 'Wednesday', subtitle: '28 October' });
    expect(dayTitle('2026-12-31', '2027-01-01')).toEqual({ title: 'Yesterday', subtitle: 'Thursday 31 December' });
    expect(dayTitle('2026-12-28', '2027-01-05')).toEqual({ title: 'Monday', subtitle: '28 December 2026' });
  });
});

describe('the short page form (mocks d1, d5–d7)', () => {
  it('reads "p. 562", "p. 548–549" and "p. 540–541 and 548"', () => {
    expect(formatPagesShort([562])).toBe('p. 562');
    expect(formatPagesShort([549, 548])).toBe('p. 548–549');
    expect(formatPagesShort([540, 541, 548])).toBe('p. 540–541 and 548');
  });
});

describe('the day view footer (gap audit §4)', () => {
  it('runs today and ahead, ran once the day is over', () => {
    expect(windowFooter('2026-11-03', '2026-11-03', { from: '5:22 AM', to: '5:23 AM' })).toBe('Tuesday runs Fajr to Fajr, 5:22 AM to 5:23 AM');
    expect(windowFooter('2026-11-01', '2026-11-03', { from: '5:19 AM', to: '5:20 AM' })).toBe('Sunday ran Fajr to Fajr, 5:19 AM to 5:20 AM');
    expect(windowFooter('2026-10-28', '2026-11-03', null)).toBe('Wednesday ran midnight to midnight');
    expect(windowFooter('2026-11-04', '2026-11-03', null)).toBe('Wednesday runs midnight to midnight');
  });
});

describe('pages credited to another day (AHEAD-2, SESS-7)', () => {
  const day = '2026-11-03';
  const line = (...a: Parameters<typeof creditLine>) => plainText(creditLine(...a));
  it('names the day by its date and the pages by surah, never as YYYY-MM-DD or page numbers', () => {
    expect(line(day, { countsFor: '2026-11-04', pages: [562, 563] })).toBe('Ahead for Wednesday 4 November: Al-Mulk 1–26');
    expect(line(day, { fromDay: '2026-11-02', pages: [556, 557] })).toBe('Done ahead on Monday 2 November: At-Taghabun');
  });
  it('a catch-up page reads as caught up for the day it was missed, never as ahead [SESS-7]', () => {
    expect(line(day, { countsFor: '2026-11-02', pages: [556, 557] })).toBe('Catch-up for Monday 2 November: At-Taghabun');
    expect(line('2026-11-02', { fromDay: '2026-11-03', pages: [556, 557] })).toBe('Caught up on Tuesday 3 November: At-Taghabun');
  });
});
