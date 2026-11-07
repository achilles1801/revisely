import { formatMinutesLong } from '../activityFormat';

describe('Activity minutes (gap audit H)', () => {
  it('reads "8 min", "1 h 5 min" and "2 h"', () => {
    expect(formatMinutesLong(8)).toBe('8 min');
    expect(formatMinutesLong(0)).toBe('0 min');
    expect(formatMinutesLong(65)).toBe('1 h 5 min');
    expect(formatMinutesLong(120)).toBe('2 h');
    expect(formatMinutesLong(17.4)).toBe('17 min');
  });
});
