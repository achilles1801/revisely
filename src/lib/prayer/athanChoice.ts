// Which athan voice the prayers use, as the voice picker shows and sets it.
// One choice for all five prayers: Fajr takes the voice's own Fajr athan when
// its style has one (makkah-regular → makkah-fajr), the others the voice
// itself. The bundled voice is stored as null (lib/prayer/prefs).

import { fajrVariant, type AthanVoice } from '../athan/catalog';
import { PRAYERS, type PrayerAlert, type PrayerName } from './prefs';

/**
 * What the picker lists. `choices`: voices that can be a prayer's sound (they
 * have a notification clip), the bundled one first; a Fajr athan isn't one of
 * them (it is its style's Fajr). `listenOnly`: the rest, to listen to.
 */
export function athanChoices(voices: AthanVoice[]): { choices: AthanVoice[]; listenOnly: AthanVoice[] } {
  const choices = voices.filter((v) => v.clip && !v.fajr).sort((a, b) => Number(b.bundled) - Number(a.bundled));
  const usedForFajr = new Set(choices.map((v) => fajrVariant(v, voices)?.id).filter(Boolean));
  const listenOnly = voices.filter((v) => !choices.includes(v) && !usedForFajr.has(v.id) && v.previewUrl);
  return { choices, listenOnly };
}

/** The voice chosen: the one the prayers other than Fajr use (null: the bundled one). */
export function chosenAthanVoiceId(alerts: Record<PrayerName, PrayerAlert>): string | null {
  for (const p of PRAYERS) if (p !== 'fajr' && alerts[p].voice) return alerts[p].voice ?? null;
  return null;
}

/** Each prayer's voice for a choice (null: the bundled one). */
export function athanVoicesFor(voice: AthanVoice, voices: AthanVoice[]): Record<PrayerName, string | null> {
  const id = voice.bundled ? null : voice.id;
  const fajr = fajrVariant(voice, voices);
  const fajrId = fajr && fajr.clip && fajr.id !== voice.id ? (fajr.bundled ? null : fajr.id) : id;
  return Object.fromEntries(PRAYERS.map((p) => [p, p === 'fajr' ? fajrId : id])) as Record<PrayerName, string | null>;
}

/** The prayers' alerts with a voice chosen (sounds, reminders and on/off unchanged). */
export function withAthanVoice(
  alerts: Record<PrayerName, PrayerAlert>,
  voice: AthanVoice,
  voices: AthanVoice[],
): Record<PrayerName, PrayerAlert> {
  const ids = athanVoicesFor(voice, voices);
  return Object.fromEntries(PRAYERS.map((p) => [p, { ...alerts[p], voice: ids[p] }])) as Record<PrayerName, PrayerAlert>;
}
