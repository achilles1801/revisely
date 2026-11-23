// Which athan voice the prayers use, as the voice picker shows and sets it.
// A voice can be chosen for every prayer at once or for one prayer. Fajr takes
// the voice's own Fajr athan when its style has one (makkah-regular → makkah-fajr);
// a Fajr athan with no voice of its style is chosen for Fajr alone.
// No voice chosen (null): the prayer plays the standard tone.

import { fajrVariant, type AthanVoice } from '../athan/catalog';
import { PRAYERS, type PrayerAlert, type PrayerName } from './prefs';

/**
 * What the picker lists: one list, every voice a prayer can play (it has a notification clip). A Fajr
 * athan that goes with a listed voice isn't an entry of its own (it is that voice's Fajr). A Fajr athan
 * that stands alone is one, for Fajr only: a picker opened from another prayer leaves it out.
 */
export function athanChoices(voices: AthanVoice[], prayer?: PrayerName): AthanVoice[] {
  const regular = voices.filter((v) => v.clip && !v.fajr);
  const paired = new Set(regular.map((v) => fajrVariant(v, voices)?.id).filter(Boolean));
  return voices.filter((v) => v.clip && (!v.fajr || (!paired.has(v.id) && (!prayer || prayer === 'fajr'))));
}

/**
 * The voice chosen: one prayer's, or (no prayer) the one the prayers other than Fajr use. A Fajr athan
 * reads as its style's regular voice (the one another prayer uses, when two share it). Null: none.
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
    const same = voices.filter((x) => !x.fajr && x.clip && x.style === v.style);
    const used = same.find((x) => PRAYERS.some((p) => alerts[p].voice === x.id));
    return (used ?? same[0])?.id ?? id;
  };
  if (prayer) return regular(alerts[prayer].voice);
  for (const p of PRAYERS) if (p !== 'fajr' && alerts[p].voice) return alerts[p].voice ?? null;
  return regular(alerts.fajr.voice);
}

/** The entries the picker ticks: the chosen voice, and (no prayer) Fajr's own athan when it is an entry itself. */
export function chosenAthanVoiceIds(
  alerts: Record<PrayerName, PrayerAlert>,
  voices: AthanVoice[] = [],
  prayer?: PrayerName,
): Set<string> {
  const ids = new Set<string>();
  const chosen = chosenAthanVoiceId(alerts, voices, prayer);
  if (chosen) ids.add(chosen);
  const fajr = alerts.fajr.voice;
  if (!prayer && fajr && athanChoices(voices).some((v) => v.id === fajr)) ids.add(fajr);
  return ids;
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
 * the athan unchanged), or for one prayer, which is then set to the athan. A Fajr athan chosen for
 * every prayer is Fajr's alone.
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
  if (voice.fajr) return { ...alerts, fajr: { ...alerts.fajr, voice: voice.id } };
  const ids = athanVoicesFor(voice, voices);
  return Object.fromEntries(PRAYERS.map((p) => [p, { ...alerts[p], voice: ids[p] }])) as Record<PrayerName, PrayerAlert>;
}

/** The voices to download for a choice. */
export function athanDownloadsFor(voice: AthanVoice, voices: AthanVoice[], prayer?: PrayerName): string[] {
  if (prayer) return [athanVoiceFor(prayer, voice, voices)];
  if (voice.fajr) return [voice.id];
  return [...new Set(Object.values(athanVoicesFor(voice, voices)))];
}
