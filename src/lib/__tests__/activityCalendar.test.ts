import { CALENDAR_SCREEN_LABEL, parseSpan, periodForSpan, shiftWeek, showsToday, weekDays, weekTitle } from '../activityCalendar';

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

describe('switching Week | Month keeps you where you were', () => {
  const today = '2026-11-05';
  it('month to week: the picked day’s week, else today’s, else the month’s first week', () => {
    const base = { span: 'month' as const, month: '2026-09', week: '2026-11-01', today };
    expect(periodForSpan('week', { ...base, picked: '2026-09-17' }).week).toBe('2026-09-13');
    expect(periodForSpan('week', { ...base, picked: null }).week).toBe('2026-08-30');
    expect(periodForSpan('week', { ...base, month: '2026-11', picked: null }).week).toBe('2026-11-01');
    // A picked day off screen doesn't count.
    expect(periodForSpan('week', { ...base, picked: '2026-10-20' }).week).toBe('2026-08-30');
  });

  it('week to month: the picked day’s month, else today’s, else the month holding most of the week', () => {
    const base = { span: 'week' as const, month: '2026-11', week: '2026-09-27', today };
    expect(periodForSpan('month', { ...base, picked: '2026-10-02' }).month).toBe('2026-10');
    // 27 Sep – 3 Oct: its Wednesday is 30 September.
    expect(periodForSpan('month', { ...base, picked: null }).month).toBe('2026-09');
    expect(periodForSpan('month', { ...base, week: '2026-11-01', picked: null }).month).toBe('2026-11');
  });

  it('the same span changes nothing', () => {
    const p = { span: 'week' as const, month: '2026-03', week: '2026-09-27', today, picked: null };
    expect(periodForSpan('week', p)).toEqual({ month: '2026-03', week: '2026-09-27' });
  });

  it('shows today: its month, or the week holding it', () => {
    expect(showsToday('month', { month: '2026-11', week: '2026-01-04' }, today)).toBe(true);
    expect(showsToday('month', { month: '2026-10', week: '2026-11-01' }, today)).toBe(false);
    expect(showsToday('week', { month: '2026-10', week: '2026-11-01' }, today)).toBe(true);
    expect(showsToday('week', { month: '2026-11', week: '2026-10-25' }, today)).toBe(false);
  });
});
