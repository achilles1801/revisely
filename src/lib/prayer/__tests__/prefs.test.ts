import { DEFAULT_PRAYER_PREFS, parsePrayerPrefs } from '../prefs';

describe('parsePrayerPrefs: the sound', () => {
  const withSound = (sound: unknown) =>
    parsePrayerPrefs(JSON.stringify({ alerts: { fajr: { on: true, before: 10, sound } } })).alerts.fajr.sound;

  it('keeps standard, silent and athan', () => {
    expect(withSound('standard')).toBe('standard');
    expect(withSound('silent')).toBe('silent');
    expect(withSound('athan')).toBe('athan');
  });

  it('anything else (or missing) is the standard tone', () => {
    expect(withSound('trumpet')).toBe('standard');
    expect(withSound(undefined)).toBe('standard');
    expect(parsePrayerPrefs(null)).toBe(DEFAULT_PRAYER_PREFS);
  });
});
