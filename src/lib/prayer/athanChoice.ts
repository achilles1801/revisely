// Which athan voice the prayers use, as the voice picker shows and sets it.
// A voice can be chosen for every prayer at once or for one prayer. Fajr takes
// the voice's own Fajr athan when its style has one (makkah-regular → makkah-fajr).
// No voice chosen (null): the prayer plays the standard tone.

import { fajrVariant, type AthanVoice } from '../athan/catalog';
import { PRAYERS, type PrayerAlert, type PrayerName } from './prefs';

/**
 * What the picker lists. `choices`: voices that can be a prayer's sound (they
 * have a notification clip); a Fajr athan isn't one of them (it is its style's
 * Fajr). `listenOnly`: the rest, to listen to.
 */
export function athanChoices(voices: AthanVoice[]): { choices: AthanVoice[]; listenOnly: AthanVoice[] } {
  const choices = voices.filter((v) => v.clip && !v.fajr);
  const usedForFajr = new Set(choices.map((v) => fajrVariant(v, voices)?.id).filter(Boolean));
  const listenOnly = voices.filter((v) => !choices.includes(v) && !usedForFajr.has(v.id) && v.previewUrl);
  return { choices, listenOnly };
}

/**
 * The voice chosen, as the picker ticks it: one prayer's, or (no prayer) the one the prayers other
 * than Fajr use. A Fajr athan reads as its style's regular voice. Null: none.
 */
export function chosenAthanVoiceId(
  alerts: Record<PrayerName, PrayerAlert>,
  voices: AthanVoice[] = [],
  prayer?: PrayerName,
): string | null {
  const regular = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const v = voices.find((x) => x.id === id);
    if (!v?.fajr) return id;
    return voices.find((x) => !x.fajr && x.clip && x.style === v.style)?.id ?? id;
  };
  if (prayer) return regular(alerts[prayer].voice);
  for (const p of PRAYERS) if (p !== 'fajr' && alerts[p].voice) return alerts[p].voice ?? null;
  return regular(alerts.fajr.voice);
}

/** The voice a prayer plays for a choice: Fajr's own athan when the style has one. */
export function athanVoiceFor(prayer: PrayerName, voice: AthanVoice, voices: AthanVoice[]): string {
  if (prayer !== 'fajr') return voice.id;
  const fajr = fajrVariant(voice, voices);
  return fajr && fajr.clip ? fajr.id : voice.id;
}

/** Each prayer's voice for a choice. */
export function athanVoicesFor(voice: AthanVoice, voices: AthanVoice[]): Record<PrayerName, string> {
  return Object.fromEntries(PRAYERS.map((p) => [p, athanVoiceFor(p, voice, voices)])) as Record<PrayerName, string>;
}

/**
 * The prayers' alerts with a voice chosen: for every prayer (reminders, on/off and which prayers play
 * the athan unchanged), or for one prayer, which is then set to the athan.
 */
export function withAthanVoice(
  alerts: Record<PrayerName, PrayerAlert>,
  voice: AthanVoice,
  voices: AthanVoice[],
  prayer?: PrayerName,
): Record<PrayerName, PrayerAlert> {
  if (prayer) {
    return { ...alerts, [prayer]: { ...alerts[prayer], sound: 'athan', voice: athanVoiceFor(prayer, voice, voices) } };
  }
  const ids = athanVoicesFor(voice, voices);
  return Object.fromEntries(PRAYERS.map((p) => [p, { ...alerts[p], voice: ids[p] }])) as Record<PrayerName, PrayerAlert>;
}
