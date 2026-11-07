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
  it('draws levels from 0 to 100, with silences long enough to show as dots', () => {
    const levels = demoLevels(42);
    expect(levels).toHaveLength(96);
    expect(levels.every((l) => l >= 0 && l <= 100)).toBe(true);
    // Runs of at least three quiet levels.
    expect(levels.join(',')).toMatch(/(^|,)0,0,0(,|$)/);
    expect(demoLevels(42)).toEqual(levels);
  });
});
