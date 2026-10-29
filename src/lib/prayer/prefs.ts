// Prayer settings kept on this phone (AsyncStorage): how times are worked out
// beyond the method, each prayer's notification, and the place they were last
// worked out for. Nothing here leaves the phone; the method itself is the
// account's (User.fajrCalculationMethod), shared with "Start day at fajr".

import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAthanVoiceId } from '../athan/catalog';

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type TimeName = PrayerName | 'sunrise';
export const PRAYERS: readonly PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const DAY_TIMES: readonly TimeName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** adhan's HighLatitudeRule values, or "recommended" for its pick by latitude. */
export type HighLatitude = 'recommended' | 'middleofthenight' | 'seventhofthenight' | 'twilightangle';
export type AsrMadhab = 'standard' | 'hanafi';
/** 'athan': the athan at the prayer's time, in `voice` (lib/athan); its
 *  reminder before plays the standard tone. */
export type PrayerSound = 'standard' | 'silent' | 'athan';
/** Minutes before the prayer for its reminder (0: none). */
export const REMINDER_OPTIONS = [0, 5, 10, 15, 30] as const;
export type ReminderBefore = (typeof REMINDER_OPTIONS)[number];

export interface PrayerAlert {
  on: boolean;
  before: ReminderBefore;
  sound: PrayerSound;
  /** The athan voice (lib/athan) when `sound` is 'athan'; null or absent: the
   *  bundled voice. One that isn't on the phone plays the bundled voice. */
  voice?: string | null;
}

export interface Place {
  latitude: number;
  longitude: number;
}

export interface PrayerPrefs {
  highLatitude: HighLatitude;
  madhab: AsrMadhab;
  /** ± minutes added to each time. */
  adjustments: Record<PrayerName, number>;
  alerts: Record<PrayerName, PrayerAlert>;
  /** Where times were last worked out (the phone's position), so notifications
   *  can be kept going without asking for it again. On this phone only. */
  place: Place | null;
  /** The method was set from the country once (lib/prayer/times defaultMethodFor). */
  methodSuggested: boolean;
  /** "Next prayer" line under Home's header. */
  homeLine: boolean;
}

export const ADJUST_LIMIT = 30;

const ALERT_OFF: PrayerAlert = { on: false, before: 0, sound: 'standard', voice: null };
export const DEFAULT_PRAYER_PREFS: PrayerPrefs = {
  highLatitude: 'recommended',
  madhab: 'standard',
  adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  alerts: { fajr: ALERT_OFF, dhuhr: ALERT_OFF, asr: ALERT_OFF, maghrib: ALERT_OFF, isha: ALERT_OFF },
  place: null,
  methodSuggested: false,
  homeLine: true,
};

const HIGH: HighLatitude[] = ['recommended', 'middleofthenight', 'seventhofthenight', 'twilightangle'];
const clampAdjust = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(-ADJUST_LIMIT, Math.min(ADJUST_LIMIT, Math.round(n))) : 0;

function parseAlert(raw: unknown): PrayerAlert {
  const a = (raw ?? {}) as Partial<PrayerAlert>;
  return {
    on: a.on === true,
    before: (REMINDER_OPTIONS as readonly number[]).includes(a.before as number) ? (a.before as ReminderBefore) : 0,
    sound: a.sound === 'silent' || a.sound === 'athan' ? a.sound : 'standard',
    voice: isAthanVoiceId(a.voice) ? a.voice : null,
  };
}

/** Saved prefs over the defaults; anything missing or odd falls back. */
export function parsePrayerPrefs(raw: string | null): PrayerPrefs {
  if (!raw) return DEFAULT_PRAYER_PREFS;
  let s: Partial<PrayerPrefs>;
  try {
    s = JSON.parse(raw) ?? {};
  } catch {
    return DEFAULT_PRAYER_PREFS;
  }
  const adj = (s.adjustments ?? {}) as Partial<Record<PrayerName, number>>;
  const alerts = (s.alerts ?? {}) as Partial<Record<PrayerName, unknown>>;
  const place =
    s.place && Number.isFinite(s.place.latitude) && Number.isFinite(s.place.longitude)
      ? { latitude: s.place.latitude, longitude: s.place.longitude }
      : null;
  return {
    highLatitude: HIGH.includes(s.highLatitude as HighLatitude) ? (s.highLatitude as HighLatitude) : 'recommended',
    madhab: s.madhab === 'hanafi' ? 'hanafi' : 'standard',
    adjustments: {
      fajr: clampAdjust(adj.fajr),
      dhuhr: clampAdjust(adj.dhuhr),
      asr: clampAdjust(adj.asr),
      maghrib: clampAdjust(adj.maghrib),
      isha: clampAdjust(adj.isha),
    },
    alerts: {
      fajr: parseAlert(alerts.fajr),
      dhuhr: parseAlert(alerts.dhuhr),
      asr: parseAlert(alerts.asr),
      maghrib: parseAlert(alerts.maghrib),
      isha: parseAlert(alerts.isha),
    },
    place,
    methodSuggested: s.methodSuggested === true,
    homeLine: s.homeLine !== false,
  };
}

const STORAGE_KEY = '@revisely_prayer_prefs';
let prefs: PrayerPrefs = DEFAULT_PRAYER_PREFS;
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    loaded = true;
    if (!raw) return notify();
    prefs = parsePrayerPrefs(raw);
    notify();
  })
  .catch(() => {
    loaded = true;
    notify();
  });

/** The settings now (for code outside React: the Fajr day boundary). */
export function getPrayerPrefs(): PrayerPrefs {
  return prefs;
}

/** Whether the saved settings have been read (before that: the defaults). */
export function prayerPrefsLoaded(): boolean {
  return loaded;
}

export function setPrayerPrefs(update: Partial<PrayerPrefs>) {
  prefs = { ...prefs, ...update };
  notify();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {});
}

/** One prayer's notification, changed. */
export function setPrayerAlert(prayer: PrayerName, update: Partial<PrayerAlert>) {
  setPrayerPrefs({ alerts: { ...prefs.alerts, [prayer]: { ...prefs.alerts[prayer], ...update } } });
}

export function subscribePrayerPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePrayerPrefs(): PrayerPrefs {
  return useSyncExternalStore(subscribePrayerPrefs, getPrayerPrefs, getPrayerPrefs);
}

/** For tests. */
export function resetPrayerPrefsForTests(next: PrayerPrefs = DEFAULT_PRAYER_PREFS) {
  prefs = next;
  loaded = true;
  notify();
}
