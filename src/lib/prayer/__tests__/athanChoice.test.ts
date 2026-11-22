import { athanChoices, athanVoiceFor, athanVoicesFor, chosenAthanVoiceId, withAthanVoice } from '../athanChoice';
import type { AthanVoice } from '../../athan/catalog';
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
  ...opts,
});

const VOICES: AthanVoice[] = [
  voice('tr-gocek-fajr', 'turkish', { fajr: true, clip: null }),
  voice('makkah-regular', 'makkah', { provenance: 'unclear' }),
  voice('makkah-fajr', 'makkah', { fajr: true, provenance: 'unclear' }),
  voice('madinah-fajr', 'madinah', { fajr: true, clip: null, provenance: 'unclear' }),
  voice('aqsa-maghrib', 'aqsa', { provenance: 'unclear' }),
];
const makkah = VOICES[1];
const aqsa = VOICES[4];

describe('athanChoices', () => {
  it('lists the voices with a notification clip; a style’s Fajr athan goes with its voice', () => {
    const { choices, listenOnly } = athanChoices(VOICES);
    expect(choices.map((v) => v.id)).toEqual(['makkah-regular', 'aqsa-maghrib']);
    expect(listenOnly.map((v) => v.id)).toEqual(['tr-gocek-fajr', 'madinah-fajr']);
  });
});

describe('choosing a voice for every prayer', () => {
  it('all prayers take it, Fajr its Fajr athan when the style has one', () => {
    expect(athanVoicesFor(makkah, VOICES)).toEqual({
      fajr: 'makkah-fajr',
      dhuhr: 'makkah-regular',
      asr: 'makkah-regular',
      maghrib: 'makkah-regular',
      isha: 'makkah-regular',
    });
    expect(athanVoicesFor(aqsa, VOICES).fajr).toBe('aqsa-maghrib');
  });

  it('keeps each prayer’s sound, reminder and switch', () => {
    const alerts = {
      ...DEFAULT_PRAYER_PREFS.alerts,
      asr: { on: true, before: 10 as const, sound: 'athan' as const, voice: null },
    };
    const next = withAthanVoice(alerts, makkah, VOICES);
    expect(next.asr).toEqual({ on: true, before: 10, sound: 'athan', voice: 'makkah-regular' });
    expect(next.dhuhr).toEqual({ ...alerts.dhuhr, voice: 'makkah-regular' });
  });

  it('the chosen voice is the one the prayers other than Fajr use; none until one is chosen', () => {
    expect(chosenAthanVoiceId(DEFAULT_PRAYER_PREFS.alerts, VOICES)).toBeNull();
    const alerts = withAthanVoice(DEFAULT_PRAYER_PREFS.alerts, makkah, VOICES);
    expect(chosenAthanVoiceId(alerts, VOICES)).toBe('makkah-regular');
  });
});

describe('choosing a voice for one prayer', () => {
  it('sets that prayer to the athan with the voice, and leaves the others alone', () => {
    const next = withAthanVoice(DEFAULT_PRAYER_PREFS.alerts, aqsa, VOICES, 'maghrib');
    expect(next.maghrib).toMatchObject({ sound: 'athan', voice: 'aqsa-maghrib' });
    expect(next.isha).toEqual(DEFAULT_PRAYER_PREFS.alerts.isha);
    expect(chosenAthanVoiceId(next, VOICES, 'maghrib')).toBe('aqsa-maghrib');
    expect(chosenAthanVoiceId(next, VOICES, 'isha')).toBeNull();
  });

  it('Fajr takes the voice’s Fajr athan, and the picker still ticks the voice', () => {
    const next = withAthanVoice(DEFAULT_PRAYER_PREFS.alerts, makkah, VOICES, 'fajr');
    expect(next.fajr.voice).toBe('makkah-fajr');
    expect(athanVoiceFor('fajr', makkah, VOICES)).toBe('makkah-fajr');
    expect(athanVoiceFor('asr', makkah, VOICES)).toBe('makkah-regular');
    expect(chosenAthanVoiceId(next, VOICES, 'fajr')).toBe('makkah-regular');
  });
});
