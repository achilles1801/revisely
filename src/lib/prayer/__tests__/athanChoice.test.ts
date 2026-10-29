import { athanChoices, athanVoicesFor, chosenAthanVoiceId, withAthanVoice } from '../athanChoice';
import { BUNDLED_ATHAN_VOICE, type AthanVoice } from '../../athan/catalog';
import { DEFAULT_PRAYER_PREFS } from '../prefs';

const voice = (id: string, style: string, opts: Partial<AthanVoice> = {}): AthanVoice => ({
  id,
  name: id,
  style,
  fajr: false,
  provenance: 'clear',
  credit: `${id} credit`,
  licence: 'CC0 1.0',
  licenceUrl: null,
  sourceUrl: null,
  clip: { url: `https://revisely.app/athan/notif/${id}.caf`, seconds: 29, bytes: null },
  full: null,
  previewUrl: `https://revisely.app/athan/notif/${id}.m4a`,
  bundled: false,
  ...opts,
});

// The catalog as of Oct 29 2026, in short.
const VOICES: AthanVoice[] = [
  voice('tr-gocek-fajr', 'turkish', { fajr: true, clip: null }),
  BUNDLED_ATHAN_VOICE,
  voice('makkah-regular', 'makkah', { provenance: 'unclear' }),
  voice('makkah-fajr', 'makkah', { fajr: true, provenance: 'unclear' }),
  voice('madinah-fajr', 'madinah', { fajr: true, clip: null, provenance: 'unclear' }),
  voice('aqsa-maghrib', 'aqsa', { provenance: 'unclear' }),
];

describe('athanChoices', () => {
  it('lists the voices with a notification clip, bundled first; a style’s Fajr athan goes with its voice', () => {
    const { choices, listenOnly } = athanChoices(VOICES);
    expect(choices.map((v) => v.id)).toEqual(['icr-asim-javed', 'makkah-regular', 'aqsa-maghrib']);
    expect(listenOnly.map((v) => v.id)).toEqual(['tr-gocek-fajr', 'madinah-fajr']);
  });
});

describe('choosing a voice', () => {
  it('all prayers take it, Fajr its Fajr athan when the style has one', () => {
    const makkah = VOICES.find((v) => v.id === 'makkah-regular')!;
    expect(athanVoicesFor(makkah, VOICES)).toEqual({
      fajr: 'makkah-fajr',
      dhuhr: 'makkah-regular',
      asr: 'makkah-regular',
      maghrib: 'makkah-regular',
      isha: 'makkah-regular',
    });
    const aqsa = VOICES.find((v) => v.id === 'aqsa-maghrib')!;
    expect(athanVoicesFor(aqsa, VOICES).fajr).toBe('aqsa-maghrib');
  });

  it('the bundled voice is stored as none (null)', () => {
    expect(Object.values(athanVoicesFor(BUNDLED_ATHAN_VOICE, VOICES))).toEqual([null, null, null, null, null]);
  });

  it('keeps each prayer’s sound, reminder and switch', () => {
    const alerts = {
      ...DEFAULT_PRAYER_PREFS.alerts,
      asr: { on: true, before: 10 as const, sound: 'athan' as const, voice: null },
    };
    const next = withAthanVoice(alerts, VOICES[2], VOICES);
    expect(next.asr).toEqual({ on: true, before: 10, sound: 'athan', voice: 'makkah-regular' });
    expect(next.dhuhr).toEqual({ ...alerts.dhuhr, voice: 'makkah-regular' });
  });

  it('the chosen voice is the one the prayers other than Fajr use', () => {
    expect(chosenAthanVoiceId(DEFAULT_PRAYER_PREFS.alerts)).toBeNull();
    const alerts = withAthanVoice(DEFAULT_PRAYER_PREFS.alerts, VOICES[2], VOICES);
    expect(chosenAthanVoiceId(alerts)).toBe('makkah-regular');
  });
});
