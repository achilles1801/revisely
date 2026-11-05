import { CALENDAR_SCREEN_LABEL, parseSpan, shiftWeek, weekDays, weekTitle } from '../activityCalendar';

describe('the History/Overview calendar (week and month)', () => {
  it('the screen label is one constant, Overview for now', () => {
    expect(CALENDAR_SCREEN_LABEL).toBe('Overview');
  });

  it('the last choice is kept; nothing or junk is the month', () => {
    expect(parseSpan('week')).toBe('week');
    expect(parseSpan('month')).toBe('month');
    expect(parseSpan(null)).toBe('month');
    expect(parseSpan('{')).toBe('month');
  });

  it('a week is seven days from its Sunday; weeks step by seven days', () => {
    expect(weekDays('2026-11-01')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(shiftWeek('2026-11-01', -1)).toBe('2026-10-25');
  });

  it('the week title names both ends', () => {
    expect(weekTitle('2026-11-01')).toBe('Nov 1 – 7');
    expect(weekTitle('2026-10-25')).toBe('Oct 25 – 31');
  });
});
