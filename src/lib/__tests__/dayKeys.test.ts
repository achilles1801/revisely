import { dayFromNumber, dayNumber, daysBetween, shiftDay } from '../dayKeys';

describe('day keys', () => {
  it('numbers days from 1970-01-01 and back again', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayFromNumber(0)).toBe('1970-01-01');
    expect(dayFromNumber(dayNumber('2026-11-22'))).toBe('2026-11-22');
  });

  it('counts whole days, across months, years and leap days', () => {
    expect(daysBetween('2026-11-22', '2026-11-22')).toBe(0);
    expect(daysBetween('2026-11-22', '2026-11-23')).toBe(1);
    expect(daysBetween('2026-11-23', '2026-11-22')).toBe(-1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('is not moved by daylight saving: every day is one day (US and EU changes, 2026)', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('reads a timestamp by its calendar day as written', () => {
    expect(dayNumber('2026-11-22T23:59:59.999Z')).toBe(dayNumber('2026-11-22'));
    expect(daysBetween('2026-11-21T08:00:00Z', '2026-11-22')).toBe(1);
  });

  it('shifts a day forward and back', () => {
    expect(shiftDay('2026-11-22', 1)).toBe('2026-11-23');
    expect(shiftDay('2026-11-22', -22)).toBe('2026-10-31');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftDay('2026-11-22', 0)).toBe('2026-11-22');
  });
});
