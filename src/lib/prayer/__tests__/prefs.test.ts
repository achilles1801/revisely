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

describe('parsePrayerPrefs: the athan voice', () => {
  const withVoice = (voice: unknown) =>
    parsePrayerPrefs(JSON.stringify({ alerts: { fajr: { on: true, before: 0, sound: 'athan', voice } } })).alerts.fajr.voice;

  it('keeps a voice id; anything else is the bundled voice (null)', () => {
    expect(withVoice('makkah-fajr')).toBe('makkah-fajr');
    expect(withVoice('../x')).toBeNull();
    expect(withVoice(42)).toBeNull();
    expect(withVoice(undefined)).toBeNull();
  });
});
