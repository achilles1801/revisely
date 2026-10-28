import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** What the optional progress card on Home shows. Per-device preference. */
export type HomeMetric = 'juz' | 'pages' | 'surahs';

/**
 * How Today's post shows how much is memorized. Tester-only while the user
 * compares them (Settings → Home screen, lib/tester); the winner stays.
 */
export type ProgressStyle = 'ring' | 'hairline' | 'dots';
export const PROGRESS_STYLES: ProgressStyle[] = ['ring', 'hairline', 'dots'];
export const PROGRESS_STYLE_LABELS: Record<ProgressStyle, string> = {
  ring: 'Ring',
  hairline: 'Hairline',
  dots: 'Juz dots',
};

export interface HomePrefs {
  showProgressCard: boolean;
  /** Ring (around the mark), Hairline or Juz dots (under the post). */
  progressStyle: ProgressStyle;
  metrics: HomeMetric[];
  /** Friday card suggesting Surah Al-Kahf. */
  fridayKahfReminder: boolean;
  /** Revision day on which the Al-Kahf card was dismissed ("Not today"). */
  kahfDismissedDay: string | null;
}

export const HOME_METRIC_LABELS: Record<HomeMetric, string> = {
  juz: 'Juz memorized',
  pages: 'Pages memorized',
  surahs: 'Surahs memorized',
};

export const ALL_HOME_METRICS: HomeMetric[] = ['juz', 'pages', 'surahs'];

const HOME_METRIC_SHORT: Record<HomeMetric, string> = { juz: 'Juz', pages: 'Pages', surahs: 'Surahs' };

/** What the card shows, for the folded row in Settings: "Juz, Pages". */
export function homeMetricsSummary(metrics: HomeMetric[]): string {
  return ALL_HOME_METRICS.filter((m) => metrics.includes(m))
    .map((m) => HOME_METRIC_SHORT[m])
    .join(', ');
}

const STORAGE_KEY = '@revisely_home_prefs';
const DEFAULT_PREFS: HomePrefs = {
  showProgressCard: true,
  progressStyle: 'ring',
  metrics: ['juz', 'pages'],
  fridayKahfReminder: true,
  kahfDismissedDay: null,
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
    progressStyle: PROGRESS_STYLES.includes(saved.progressStyle as ProgressStyle)
      ? (saved.progressStyle as ProgressStyle)
      : DEFAULT_PREFS.progressStyle,
    metrics: (Array.isArray(saved.metrics) ? saved.metrics : DEFAULT_PREFS.metrics).filter(
      (m) => ALL_HOME_METRICS.includes(m),
    ),
    fridayKahfReminder:
      typeof saved.fridayKahfReminder === 'boolean'
        ? saved.fridayKahfReminder
        : DEFAULT_PREFS.fridayKahfReminder,
    kahfDismissedDay:
      typeof saved.kahfDismissedDay === 'string' ? saved.kahfDismissedDay : null,
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
