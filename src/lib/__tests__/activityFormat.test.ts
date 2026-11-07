import { dayTitle, formatDayLong, formatMinutesLong } from '../activityFormat';

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
