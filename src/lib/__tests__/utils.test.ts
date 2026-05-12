import { formatDate, daysBetween, isToday, generateId } from '../utils';

describe('formatDate', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-05-10T12:34:56Z'))).toBe('2026-05-10');
  });

  it('produces a 10-character string', () => {
    expect(formatDate(new Date()).length).toBe(10);
  });
});

describe('daysBetween', () => {
  it('returns the integer day difference for forward dates', () => {
    const a = new Date('2026-05-01T00:00:00Z');
    const b = new Date('2026-05-11T00:00:00Z');
    expect(daysBetween(a, b)).toBe(10);
  });

  it('returns a negative number when d2 precedes d1', () => {
    const a = new Date('2026-05-11T00:00:00Z');
    const b = new Date('2026-05-01T00:00:00Z');
    expect(daysBetween(a, b)).toBe(-10);
  });

  it('accepts ISO string inputs', () => {
    expect(daysBetween('2026-05-01', '2026-05-08')).toBe(7);
  });
});

describe('isToday', () => {
  it('returns true for the current date', () => {
    expect(isToday(new Date())).toBe(true);
  });

  it('returns false for a date one week ago', () => {
    const aWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(isToday(aWeekAgo)).toBe(false);
  });
});

describe('generateId', () => {
  it('returns unique values across rapid calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('matches the expected shape (timestamp-suffix)', () => {
    expect(generateId()).toMatch(/^\d+-[a-z0-9]+$/);
  });
});
