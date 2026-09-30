import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** What the optional progress card on Home shows. Per-device preference. */
export type HomeMetric = 'juz' | 'pages' | 'surahs';

export interface HomePrefs {
  showProgressCard: boolean;
  metrics: HomeMetric[];
}

export const HOME_METRIC_LABELS: Record<HomeMetric, string> = {
  juz: 'Juz memorized',
  pages: 'Pages memorized',
  surahs: 'Surahs memorized',
};

export const ALL_HOME_METRICS: HomeMetric[] = ['juz', 'pages', 'surahs'];

const STORAGE_KEY = '@revisely_home_prefs';
const DEFAULT_PREFS: HomePrefs = { showProgressCard: true, metrics: ['juz', 'pages'] };

let prefs: HomePrefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();

AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<HomePrefs>;
    prefs = {
      showProgressCard: saved.showProgressCard ?? DEFAULT_PREFS.showProgressCard,
      metrics: (saved.metrics ?? DEFAULT_PREFS.metrics).filter((m) =>
        ALL_HOME_METRICS.includes(m),
      ),
    };
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
