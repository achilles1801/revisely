// The athan as a prayer's notification sound (BEHAVIOUR.md, ATHAN-*): which voice each prayer takes, and what
// the plan gives a prayer's time and its reminder. The files on the phone and the scheduling itself are
// src/lib/athan/__tests__/store.test.ts and src/lib/prayer/__tests__/sync.test.ts.

import fc from 'fast-check';
import { athanChoices, athanVoiceFor, chosenAthanVoiceId, withAthanVoice } from '../../../src/lib/prayer/athanChoice';
import type { AthanVoice } from '../../../src/lib/athan/catalog';
import { DEFAULT_PRAYER_PREFS, PRAYERS, type PrayerAlert, type PrayerName } from '../../../src/lib/prayer/prefs';
import { planPrayerNotifications } from '../../../src/lib/prayer/schedule';
import { dayTimes } from '../../../src/lib/prayer/times';
import { runs } from './fixtures';

const voice = (id: string, style: string, opts: Partial<AthanVoice> = {}): AthanVoice => ({
  id,
  name: id,
  style,
  fajr: false,
  provenance: 'unclear',
  credit: id,
  licence: 'See source',
  licenceUrl: null,
  sourceUrl: null,
  clip: { url: `https://example.invalid/athan/notif/${id}.caf`, seconds: 29.5, bytes: null },
  full: null,
  previewUrl: null,
  ...opts,
});
const VOICES = [
  voice('makkah', 'makkah'),
  voice('makkah-fajr', 'makkah', { fajr: true }),
  voice('madinah', 'madinah'),
  voice('aqsa', 'aqsa'),
  voice('egypt-fajr', 'egypt', { fajr: true, clip: null }),
];
const CHOICES = athanChoices(VOICES).choices;
const prayerArb = fc.constantFrom<PrayerName>(...PRAYERS);
const alertArb: fc.Arbitrary<PrayerAlert> = fc.record({
  on: fc.boolean(),
  before: fc.constantFrom(0 as const, 5 as const, 10 as const, 15 as const, 30 as const),
  sound: fc.constantFrom('standard' as const, 'silent' as const, 'athan' as const),
  voice: fc.constantFrom(null, 'makkah', 'aqsa'),
});
const alertsArb = fc.record({ fajr: alertArb, dhuhr: alertArb, asr: alertArb, maghrib: alertArb, isha: alertArb });

describe('choosing an athan voice', () => {
  it('[ATHAN-2] for every prayer: each takes the voice, Fajr its Fajr athan, and nothing else about a prayer changes', () => {
    fc.assert(
      fc.property(alertsArb, fc.constantFrom(...CHOICES), (alerts, v) => {
        const next = withAthanVoice(alerts, v, VOICES);
        for (const p of PRAYERS) {
          expect(next[p].voice).toBe(athanVoiceFor(p, v, VOICES));
          expect({ ...next[p], voice: null }).toEqual({ ...alerts[p], voice: null });
        }
        expect(next.fajr.voice).toBe(v.id === 'makkah' ? 'makkah-fajr' : v.id);
        expect(chosenAthanVoiceId(next, VOICES)).toBe(v.id);
      }),
      { numRuns: runs(200) },
    );
  });

  it('[ATHAN-2] for one prayer: that prayer is set to the athan with the voice, the others are untouched', () => {
    fc.assert(
      fc.property(alertsArb, fc.constantFrom(...CHOICES), prayerArb, (alerts, v, prayer) => {
        const next = withAthanVoice(alerts, v, VOICES, prayer);
        expect(next[prayer]).toEqual({ ...alerts[prayer], sound: 'athan', voice: athanVoiceFor(prayer, v, VOICES) });
        for (const p of PRAYERS) if (p !== prayer) expect(next[p]).toEqual(alerts[p]);
        // The picker ticks the voice chosen, though Fajr may hold its Fajr athan.
        expect(chosenAthanVoiceId(next, VOICES, prayer)).toBe(v.id);
      }),
      { numRuns: runs(200) },
    );
  });

  it('[ATHAN-2] a Fajr athan is never offered as a choice of its own, and one without a clip is never used', () => {
    expect(CHOICES.map((v) => v.id)).toEqual(['makkah', 'madinah', 'aqsa']);
    expect(athanVoiceFor('fajr', voice('egypt', 'egypt'), VOICES)).toBe('egypt');
  });
});

describe('what a prayer set to the athan plans', () => {
  const place = { latitude: 41.88, longitude: -87.63 };
  const settings = { method: 'NorthAmerica', highLatitude: 'recommended' as const, madhab: 'standard' as const, adjustments: DEFAULT_PRAYER_PREFS.adjustments };
  const day = new Date(2026, 10, 23, 12);
  const days = [0, 1, 2].map((k) => dayTimes(place, new Date(2026, 10, 23 + k, 12), settings));
  const now = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 1);

  it('[ATHAN-1] the athan (with its voice) at the prayer’s time, and the standard tone for the reminder before it', () => {
    fc.assert(
      fc.property(alertsArb, (alerts) => {
        const plan = planPrayerNotifications({ now, days, alerts, budget: 62, place: null });
        for (const n of plan) {
          if (n.kind === 'keep-going') continue;
          const a = alerts[n.prayer!];
          if (n.kind === 'at') {
            expect(n.sound).toBe(a.sound);
            expect(n.voice ?? null).toBe(a.sound === 'athan' ? a.voice ?? null : null);
          } else {
            // A reminder is never the athan: the athan is for the time itself.
            expect(n.sound).toBe(a.sound === 'athan' ? 'standard' : a.sound);
            expect(n.voice ?? null).toBeNull();
          }
        }
      }),
      { numRuns: runs(200) },
    );
  });

  it('[ATHAN-3] a prayer set to the athan with no voice chosen is still planned with a sound, never dropped or silent', () => {
    const alerts = { ...DEFAULT_PRAYER_PREFS.alerts, asr: { on: true, before: 0 as const, sound: 'athan' as const, voice: null } };
    const plan = planPrayerNotifications({ now, days, alerts, budget: 62, place: null });
    const asr = plan.filter((n) => n.prayer === 'asr');
    expect(asr).toHaveLength(3);
    // No voice: the scheduler (lib/prayer/sync `iosSound`) plays the standard tone for it.
    expect(asr.every((n) => n.sound === 'athan' && (n.voice ?? null) === null)).toBe(true);
  });
});
