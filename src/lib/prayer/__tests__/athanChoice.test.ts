import { athanChoices, athanDownloadsFor, athanVoiceFor, athanVoicesFor, chosenAthanVoiceId, chosenAthanVoiceIds, withAthanVoice } from '../athanChoice';
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
  voice('ayasofya-fajr', 'turkiye', { fajr: true }),
  voice('madinah-surayhi', 'madinah-two'),
  voice('madinah-sunbul', 'madinah-two'),
  voice('madinah-sunbul-fajr', 'madinah-two', { fajr: true }),
];
const ayasofya = VOICES[5];
const sunbul = VOICES[7];
const makkah = VOICES[1];
const aqsa = VOICES[4];

describe('athanChoices', () => {
  it('one list: every voice with a notification clip; a style’s Fajr athan goes with its voice; a Fajr athan alone is an entry', () => {
    expect(athanChoices(VOICES).map((v) => v.id)).toEqual(['makkah-regular', 'aqsa-maghrib', 'ayasofya-fajr', 'madinah-surayhi', 'madinah-sunbul']);
    // Opened from a prayer other than Fajr: no Fajr athan.
    expect(athanChoices(VOICES, 'asr').map((v) => v.id)).toEqual(['makkah-regular', 'aqsa-maghrib', 'madinah-surayhi', 'madinah-sunbul']);
    expect(athanChoices(VOICES, 'fajr').map((v) => v.id)).toContain('ayasofya-fajr');
  });
});

describe('a Fajr athan that stands alone', () => {
  it('chosen for every prayer, it is Fajr’s voice and nothing else changes; both it and the other prayers’ voice are ticked', () => {
    const all = withAthanVoice(DEFAULT_PRAYER_PREFS.alerts, makkah, VOICES);
    const next = withAthanVoice(all, ayasofya, VOICES);
    expect(next.fajr).toEqual({ ...all.fajr, voice: 'ayasofya-fajr' });
    expect(next.dhuhr).toEqual(all.dhuhr);
    expect([...chosenAthanVoiceIds(next, VOICES)].sort()).toEqual(['ayasofya-fajr', 'makkah-regular']);
    expect(athanDownloadsFor(ayasofya, VOICES)).toEqual(['ayasofya-fajr']);
    // A voice's own Fajr athan isn't an entry, so only the voice is ticked.
    expect([...chosenAthanVoiceIds(all, VOICES)]).toEqual(['makkah-regular']);
  });

  it('chosen from Fajr’s own picker, it sets Fajr to the athan', () => {
    const next = withAthanVoice(DEFAULT_PRAYER_PREFS.alerts, ayasofya, VOICES, 'fajr');
    expect(next.fajr).toMatchObject({ sound: 'athan', voice: 'ayasofya-fajr' });
    expect([...chosenAthanVoiceIds(next, VOICES, 'fajr')]).toEqual(['ayasofya-fajr']);
  });

  it('two voices sharing a Fajr athan: the one the prayers use is ticked, not the first of the style', () => {
    const next = withAthanVoice(DEFAULT_PRAYER_PREFS.alerts, sunbul, VOICES);
    expect(next.fajr.voice).toBe('madinah-sunbul-fajr');
    expect([...chosenAthanVoiceIds(next, VOICES)]).toEqual(['madinah-sunbul']);
    expect(chosenAthanVoiceId(next, VOICES, 'fajr')).toBe('madinah-sunbul');
    expect(athanDownloadsFor(sunbul, VOICES).sort()).toEqual(['madinah-sunbul', 'madinah-sunbul-fajr']);
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
