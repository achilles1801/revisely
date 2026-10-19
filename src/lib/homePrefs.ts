import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** What the optional progress card on Home shows. Per-device preference. */
export type HomeMetric = 'juz' | 'pages' | 'surahs';

export interface HomePrefs {
  showProgressCard: boolean;
  metrics: HomeMetric[];
  /** Friday card suggesting Surah Al-Kahf. */
  fridayKahfReminder: boolean;
  /** Revision day on which the Al-Kahf card was dismissed ("Not today"). */
  kahfDismissedDay: string | null;
  /** Keep the screen from locking while reading, revising or listening. */
  keepScreenOn: boolean;
}

export const HOME_METRIC_LABELS: Record<HomeMetric, string> = {
  juz: 'Juz memorized',
  pages: 'Pages memorized',
  surahs: 'Surahs memorized',
};

export const ALL_HOME_METRICS: HomeMetric[] = ['juz', 'pages', 'surahs'];

const STORAGE_KEY = '@revisely_home_prefs';
const DEFAULT_PREFS: HomePrefs = {
  showProgressCard: true,
  metrics: ['juz', 'pages'],
  fridayKahfReminder: true,
  kahfDismissedDay: null,
  keepScreenOn: true,
};

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
    showProgressCard: saved.showProgressCard ?? DEFAULT_PREFS.showProgressCard,
    metrics: (Array.isArray(saved.metrics) ? saved.metrics : DEFAULT_PREFS.metrics).filter(
      (m) => ALL_HOME_METRICS.includes(m),
    ),
    fridayKahfReminder:
      typeof saved.fridayKahfReminder === 'boolean'
        ? saved.fridayKahfReminder
        : DEFAULT_PREFS.fridayKahfReminder,
    kahfDismissedDay:
      typeof saved.kahfDismissedDay === 'string' ? saved.kahfDismissedDay : null,
    keepScreenOn:
      typeof saved.keepScreenOn === 'boolean' ? saved.keepScreenOn : DEFAULT_PREFS.keepScreenOn,
  };
}

let prefs: HomePrefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();

AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    prefs = parseHomePrefs(raw);
    listeners.forEach((l) => l());
  })
  .catch(() => {});

export function setHomePrefs(update: Partial<HomePrefs>) {
  prefs = { ...prefs, ...update };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {});
}

/** Toggle a metric, keeping the canonical order and at least one selected. */
export function toggleHomeMetric(metric: HomeMetric) {
  const has = prefs.metrics.includes(metric);
  if (has && prefs.metrics.length === 1) return;
  const next = has ? prefs.metrics.filter((m) => m !== metric) : [...prefs.metrics, metric];
  setHomePrefs({ metrics: ALL_HOME_METRICS.filter((m) => next.includes(m)) });
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
