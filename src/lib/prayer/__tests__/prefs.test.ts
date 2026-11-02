import { DEFAULT_PRAYER_PREFS, parsePrayerPrefs } from '../prefs';

describe('parsePrayerPrefs: the sound', () => {
  const alert = (fajr: Record<string, unknown>) => parsePrayerPrefs(JSON.stringify({ alerts: { fajr } })).alerts.fajr;

  it('keeps the standard tone and silent', () => {
    expect(alert({ on: true, before: 10, sound: 'standard' }).sound).toBe('standard');
    expect(alert({ on: true, before: 10, sound: 'silent' }).sound).toBe('silent');
  });

  it('"athan" saved by a 1.0.3 TestFlight build becomes the standard tone (the athan was removed); its voice is dropped', () => {
    const a = alert({ on: true, before: 5, sound: 'athan', voice: 'makkah-fajr' });
    expect(a).toEqual({ on: true, before: 5, sound: 'standard' });
  });

  it('anything else (or missing) is the standard tone', () => {
    expect(alert({ on: true, sound: 'trumpet' }).sound).toBe('standard');
    expect(alert({ on: true }).sound).toBe('standard');
    expect(parsePrayerPrefs(null)).toBe(DEFAULT_PRAYER_PREFS);
  });
});
