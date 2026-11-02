import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Home's options, kept on this device. */
export interface HomePrefs {
  /** Friday card suggesting Surah Al-Kahf. */
  fridayKahfReminder: boolean;
  /** Revision day on which the Al-Kahf card was dismissed ("Not today"). */
  kahfDismissedDay: string | null;
}

const STORAGE_KEY = '@revisely_home_prefs';
const DEFAULT_PREFS: HomePrefs = {
  fridayKahfReminder: true,
  kahfDismissedDay: null,
};

/**
 * Settings that are gone: the progress card (Home always shows how much is
 * memorized, as a percentage) and what it showed, and whether that row was
 * folded open in Settings. Dropped from storage once read.
 */
const RETIRED_KEYS = ['showProgressCard', 'metrics', 'progressStyle'];
const RETIRED_STORAGE = ['@revisely_settings_progress_open'];

/** Saved prefs over the defaults; fields added later default for old installs. */
export function parseHomePrefs(raw: string | null): HomePrefs {
  if (!raw) return DEFAULT_PREFS;
  let saved: Partial<HomePrefs>;
  try {
    saved = JSON.parse(raw) ?? {};
  } catch {
    return DEFAULT_PREFS;
  }
  return {
    fridayKahfReminder:
      typeof saved.fridayKahfReminder === 'boolean'
        ? saved.fridayKahfReminder
        : DEFAULT_PREFS.fridayKahfReminder,
    kahfDismissedDay:
      typeof saved.kahfDismissedDay === 'string' ? saved.kahfDismissedDay : null,
  };
}

/** Whether saved prefs still hold a retired setting (then they're written back without it). */
export function hasRetiredKeys(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw);
    return !!saved && typeof saved === 'object' && RETIRED_KEYS.some((k) => k in saved);
  } catch {
    return false;
  }
}

let prefs: HomePrefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();

AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    prefs = parseHomePrefs(raw);
    listeners.forEach((l) => l());
    if (hasRetiredKeys(raw)) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {});
      AsyncStorage.multiRemove(RETIRED_STORAGE).catch(() => {});
    }
  })
  .catch(() => {});

export function setHomePrefs(update: Partial<HomePrefs>) {
  prefs = { ...prefs, ...update };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {});
}

export function useHomePrefs(): HomePrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
  );
}
