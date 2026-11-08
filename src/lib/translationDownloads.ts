// Downloading a whole QuranEnc translation to the phone, from the translation picker (testers;
// TRANS-6). A download is the translation's store fetching every sura not on the phone at the newest
// version (lib/quranenc), on whatever connection the phone has: it is a tap on one translation, a
// few megabytes. It can be stopped, and carries on from where it stopped (the suras on the phone
// stay). Saheeh International isn't downloaded or removed here: it comes and goes with the offline
// mushaf (lib/mushafOffline). The Clear Quran® is never downloaded whole (its terms).

import { useEffect, useState } from 'react';
import { logger } from './logger';
import { QURANENC_SURAS, quranEncStore } from './quranenc';
import type { TranslationInfo } from './translation';

export type DownloadPhase = 'none' | 'partial' | 'downloading' | 'complete' | 'failed';

export interface DownloadStatus {
  phase: DownloadPhase;
  /** Suras on the phone (while downloading: at the newest version). */
  suras: number;
  total: number;
  /** About how many bytes the whole translation takes, and how many are on the phone. */
  bytes: number;
  bytesOnPhone: number;
  /** Downloaded or removed here (not Saheeh International, not The Clear Quran®). */
  manageable: boolean;
}

const SAHEEH_ID = 'en.sahih';

interface Run {
  stop: boolean;
  done: number;
}

const running = new Map<string, Run>();
const failed = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** What is on the phone of a QuranEnc translation; null for one that isn't QuranEnc's. */
export function downloadStatus(t: TranslationInfo): DownloadStatus | null {
  if (t.source !== 'quranenc' || !t.key) return null;
  const store = quranEncStore(t.key);
  if (!store) return null;
  const onPhone = store.surasOnPhone();
  const run = running.get(t.key);
  const total = QURANENC_SURAS;
  const suras = run ? Math.max(run.done, onPhone) : onPhone;
  const phase: DownloadPhase = run
    ? 'downloading'
    : onPhone >= total
      ? 'complete'
      : failed.has(t.key)
        ? 'failed'
        : onPhone > 0
          ? 'partial'
          : 'none';
  const bytes = t.bytes ?? 0;
  return {
    phase,
    suras,
    total,
    bytes,
    bytesOnPhone: Math.round((bytes * Math.min(onPhone, total)) / total),
    manageable: t.id !== SAHEEH_ID,
  };
}

/** Downloads every sura not on the phone. Never fails: a failure shows as the 'failed' phase. */
export async function startDownload(t: TranslationInfo): Promise<void> {
  if (t.id === SAHEEH_ID || !t.key || running.has(t.key)) return;
  const store = quranEncStore(t.key);
  if (!store) return;
  const run: Run = { stop: false, done: store.surasOnPhone() };
  running.set(t.key, run);
  failed.delete(t.key);
  notify();
  try {
    await store.download(
      () => !run.stop,
      (done) => {
        run.done = done;
        notify();
      },
    );
  } catch (err) {
    logger.warn('Translation download failed', err);
    if (!run.stop) failed.add(t.key);
  } finally {
    running.delete(t.key);
    notify();
  }
}

/** Stops a download between suras; the suras on the phone stay. */
export function stopDownload(t: TranslationInfo): void {
  const run = t.key ? running.get(t.key) : undefined;
  if (run) run.stop = true;
}

/** Deletes a translation from the phone (a download in flight stops). Suras read later are kept again. */
export function removeTranslation(t: TranslationInfo): void {
  if (t.id === SAHEEH_ID || !t.key) return;
  stopDownload(t);
  quranEncStore(t.key)?.remove();
  failed.delete(t.key);
  notify();
}

/** Called when a download moves on, starts, stops or ends, or a translation is removed. */
export function onDownloadsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Re-renders on any change to these translations on the phone: a download's progress, a removal,
 * or a sura kept as it was read.
 */
export function useDownloadsTick(translations: TranslationInfo[]): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const offs = [onDownloadsChange(bump)];
    for (const t of translations) {
      const store = t.key ? quranEncStore(t.key) : undefined;
      if (store) offs.push(store.onChange(bump));
    }
    return () => offs.forEach((off) => off());
  }, [translations]);
  return tick;
}

/** Test hook. */
export function __resetDownloadsForTests(): void {
  running.clear();
  failed.clear();
  listeners.clear();
}
