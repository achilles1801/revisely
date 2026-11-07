// The E2E build's demo recordings (Activity screenshots): the links it answers, and a waveform with
// phrases and pauses, in range.
import { demoLevels, handleRecordingsLink } from '../demoRecordings';

describe('demo recordings (E2E)', () => {
  it('answers revisely://e2e/recordings and nothing else', () => {
    jest.useFakeTimers();
    try {
      expect(handleRecordingsLink('revisely://e2e/recordings?set=activity')).toBe(true);
      expect(handleRecordingsLink('revisely://e2e/clock?at=now')).toBe(false);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
  it('draws levels from 0 to 100, with pauses', () => {
    const levels = demoLevels(42);
    expect(levels).toHaveLength(64);
    expect(levels.every((l) => l >= 0 && l <= 100)).toBe(true);
    expect(levels.filter((l) => l < 10).length).toBeGreaterThan(4);
    expect(demoLevels(42)).toEqual(levels);
  });
});
