// Athan voices on this phone: the catalog (read from revisely.app, kept for
// offline), each voice's clip downloaded or not, and the sound a prayer's
// notification plays.
//
// iOS plays a notification sound only from the app itself or from
// Library/Sounds, so a chosen voice's clip (≤ 30 s .caf) is downloaded there as
// athan-<id>.caf, excluded from iCloud backup (it can be downloaded again).
// Whatever isn't there (never downloaded, deleted, withdrawn, Android) plays the
// bundled voice instead (assets/sounds), so a prayer's athan never goes quiet.
// When a clip arrives or goes, listeners (PrayerSync) reschedule.

import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { createDownloadResumable, type DownloadResumable } from 'expo-file-system/legacy';
import RecitationAudio from '../../../modules/recitation-audio';
import { logger } from '../logger';
import { ATHAN_DEFAULT_SOUND_IOS } from '../notificationChannels';
import {
  ATHAN_BASE_URL,
  ATHAN_CATALOG_URL,
  AthanVoice,
  BUNDLED_ATHAN_VOICE_ID,
  clipIds,
  isAthanVoiceId,
  parseAthanCatalog,
} from './catalog';

export type AthanVoiceState =
  /** In the app: always ready. */
  | { status: 'bundled' }
  | { status: 'missing'; error: string | null }
  | { status: 'downloading'; progress: number }
  | { status: 'ready' };

/** Downloaded voices work on iPhone only; Android plays the bundled one (a channel's sound is fixed). */
export const ATHAN_DOWNLOADS_SUPPORTED = Platform.OS === 'ios';

const CATALOG_KEY = '@revisely_athan_catalog';
/** Read the catalog again after this long (it changes when voices are added or withdrawn). */
const CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** A clip is 30 s of IMA4 (about 350 KB); anything far outside that isn't one. */
const CLIP_MIN_BYTES = 10 * 1024;
const CLIP_MAX_BYTES = 3 * 1024 * 1024;

// ---------------------------------------------------------------- files

function soundsDir(): Directory {
  // <container>/Library/Sounds: Documents' sibling.
  const dir = new Directory(Paths.document.parentDirectory, 'Library', 'Sounds');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** The file name iOS looks up (notification content.sound). */
export function athanClipName(id: string): string {
  return `athan-${id}.caf`;
}

function clipFile(id: string): File {
  return new File(soundsDir(), athanClipName(id));
}

function onDisk(id: string): boolean {
  try {
    const f = clipFile(id);
    return f.exists && f.size >= CLIP_MIN_BYTES;
  } catch (err) {
    logger.warn('Athan clip lookup failed', err);
    return false;
  }
}

// ---------------------------------------------------------------- state

let catalog: AthanVoice[] = parseAthanCatalog(null, { downloads: ATHAN_DOWNLOADS_SUPPORTED });
let catalogLoading = false;
let catalogError: string | null = null;
let catalogFetchedAt = 0;
let catalogEtag: string | null = null;
let restored = false;
const states = new Map<string, AthanVoiceState>();
const downloads = new Map<string, { task: DownloadResumable | null; cancelled: boolean }>();
/** Bumped when a clip arrives or goes: the sounds notifications should use changed. */
let soundsVersion = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function setState(id: string, next: AthanVoiceState, soundsChanged = false) {
  states.set(id, next);
  if (soundsChanged) soundsVersion++;
  notify();
}

/** Tests: forget everything. */
export function resetAthanStoreForTests(): void {
  catalog = parseAthanCatalog(null, { downloads: ATHAN_DOWNLOADS_SUPPORTED });
  catalogLoading = false;
  catalogError = null;
  catalogFetchedAt = 0;
  catalogEtag = null;
  restored = false;
  states.clear();
  downloads.clear();
  soundsVersion = 0;
}

export function getAthanVoiceState(id: string): AthanVoiceState {
  if (id === BUNDLED_ATHAN_VOICE_ID) return { status: 'bundled' };
  let s = states.get(id);
  if (!s) {
    s = ATHAN_DOWNLOADS_SUPPORTED && onDisk(id) ? { status: 'ready' } : { status: 'missing', error: null };
    states.set(id, s);
  }
  return s;
}

// ---------------------------------------------------------------- the sound to play

/**
 * The sound a prayer's athan plays on iOS: the chosen voice's clip if it's on
 * the phone, else the bundled voice. Never a missing file (iOS would play the
 * default tone instead of an athan).
 */
export function athanSoundFile(voiceId: string | null | undefined): string {
  if (!voiceId || voiceId === BUNDLED_ATHAN_VOICE_ID || !ATHAN_DOWNLOADS_SUPPORTED || !isAthanVoiceId(voiceId)) {
    return ATHAN_DEFAULT_SOUND_IOS;
  }
  return getAthanVoiceState(voiceId).status === 'ready' ? athanClipName(voiceId) : ATHAN_DEFAULT_SOUND_IOS;
}

/** Changes whenever a clip arrives or goes (PrayerSync reschedules on it). */
export function useAthanSoundsVersion(): number {
  return useSyncExternalStore(subscribe, () => soundsVersion, () => soundsVersion);
}

// ---------------------------------------------------------------- catalog

async function restoreCatalog() {
  if (restored) return;
  restored = true;
  try {
    const raw = await AsyncStorage.getItem(CATALOG_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { json: unknown; etag: string | null; fetchedAt: number };
    catalog = parseAthanCatalog(saved.json, { downloads: ATHAN_DOWNLOADS_SUPPORTED });
    catalogEtag = saved.etag ?? null;
    catalogFetchedAt = Number(saved.fetchedAt) || 0;
    notify();
  } catch (err) {
    logger.warn('Could not read the saved athan catalog', err);
  }
}

/** Delete clips of voices the catalog no longer offers (withdrawn on a rights claim). */
function sweep(voices: AthanVoice[]) {
  if (!ATHAN_DOWNLOADS_SUPPORTED) return;
  const keep = clipIds(voices);
  let changed = false;
  try {
    for (const entry of soundsDir().list()) {
      const m = entry instanceof File ? /^athan-([a-z0-9-]+)\.caf$/.exec(entry.name) : null;
      if (!m || keep.has(m[1]) || downloads.has(m[1])) continue;
      entry.delete();
      states.set(m[1], { status: 'missing', error: null });
      changed = true;
    }
  } catch (err) {
    logger.warn('Could not tidy athan clips', err);
  }
  if (changed) {
    soundsVersion++;
    notify();
  }
}

/**
 * Read the catalog from revisely.app (a no-op when it was read in the last six
 * hours, unless `force`). Offline or failing: the saved one stays, with an error.
 */
export async function refreshAthanCatalog({ force = false } = {}): Promise<void> {
  await restoreCatalog();
  if (catalogLoading) return;
  if (!force && Date.now() - catalogFetchedAt < CATALOG_MAX_AGE_MS) return;
  catalogLoading = true;
  catalogError = null;
  notify();
  try {
    const res = await fetch(ATHAN_CATALOG_URL, {
      headers: catalogEtag ? { 'If-None-Match': catalogEtag } : {},
    });
    if (res.status === 304) {
      catalogFetchedAt = Date.now();
    } else if (res.ok) {
      const json = await res.json();
      catalog = parseAthanCatalog(json, { downloads: ATHAN_DOWNLOADS_SUPPORTED });
      catalogEtag = res.headers.get('ETag');
      catalogFetchedAt = Date.now();
      await AsyncStorage.setItem(CATALOG_KEY, JSON.stringify({ json, etag: catalogEtag, fetchedAt: catalogFetchedAt })).catch(
        () => undefined,
      );
      sweep(catalog);
    } else {
      throw new Error(`Catalog ${res.status}`);
    }
  } catch (err) {
    logger.warn('Could not read the athan catalog', err);
    catalogError = "Couldn't load the voices. Check your connection and try again.";
  } finally {
    catalogLoading = false;
    notify();
  }
}

export interface AthanCatalog {
  /** The bundled voice first, then the catalog's. Always at least the bundled one. */
  voices: AthanVoice[];
  loading: boolean;
  /** Set when the last read failed (the saved list is still shown). */
  error: string | null;
  refresh: () => Promise<void>;
}

const refresh = () => refreshAthanCatalog({ force: true });

/** The voices, read from revisely.app when the screen opens (at most every six hours). */
export function useAthanCatalog(): AthanCatalog {
  const voices = useSyncExternalStore(subscribe, () => catalog, () => catalog);
  const loading = useSyncExternalStore(subscribe, () => catalogLoading, () => catalogLoading);
  const error = useSyncExternalStore(subscribe, () => catalogError, () => catalogError);
  useEffect(() => {
    refreshAthanCatalog().catch(() => undefined);
  }, []);
  return { voices, loading, error, refresh };
}

export function getAthanCatalog(): AthanVoice[] {
  return catalog;
}

/** One voice's state, live. */
export function useAthanVoiceState(id: string): AthanVoiceState {
  const get = () => getAthanVoiceState(id);
  return useSyncExternalStore(subscribe, get, get);
}

// ---------------------------------------------------------------- download, cancel, delete

/**
 * Download a voice's clip into Library/Sounds. Resolves true once it's ready
 * (at once for the bundled voice or one already here), false if it failed or
 * was cancelled (the state says why).
 */
export async function downloadAthanVoice(id: string): Promise<boolean> {
  const now = getAthanVoiceState(id);
  if (now.status === 'bundled' || now.status === 'ready') return true;
  if (!ATHAN_DOWNLOADS_SUPPORTED) return false;
  if (now.status === 'downloading') return false;
  const voice = catalog.find((v) => v.id === id);
  if (!voice?.clip) {
    setState(id, { status: 'missing', error: 'This voice can’t be used for notifications.' });
    return false;
  }
  // Our own URL for this id, whatever the catalog says.
  const url = `${ATHAN_BASE_URL}notif/${id}.caf`;
  const job: { task: DownloadResumable | null; cancelled: boolean } = { task: null, cancelled: false };
  downloads.set(id, job);
  setState(id, { status: 'downloading', progress: 0 });
  const target = clipFile(id);
  const partial = new File(soundsDir(), `${athanClipName(id)}.part`);
  try {
    if (partial.exists) partial.delete();
    job.task = createDownloadResumable(url, partial.uri, {}, (p) => {
      const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : (voice.clip?.bytes ?? 0);
      if (total > 0 && downloads.get(id) === job) {
        setState(id, { status: 'downloading', progress: Math.min(1, p.totalBytesWritten / total) });
      }
    });
    const result = await job.task.downloadAsync();
    if (job.cancelled || !result) throw new Error('cancelled');
    if (result.status !== 200) throw new Error(`Download failed (${result.status})`);
    const done = new File(partial.uri);
    if (done.size < CLIP_MIN_BYTES || done.size > CLIP_MAX_BYTES) {
      done.delete();
      throw new Error(`Not a notification clip (${done.size} bytes)`);
    }
    if (target.exists) target.delete();
    done.move(target);
    try {
      RecitationAudio?.excludeFromBackup(target.uri.replace(/^file:\/\//, ''));
    } catch (err) {
      logger.warn('Could not exclude an athan clip from backup', err);
    }
    downloads.delete(id);
    setState(id, { status: 'ready' }, true);
    return true;
  } catch (err) {
    const cancelled = job.cancelled || (err instanceof Error && err.message === 'cancelled');
    if (downloads.get(id) === job) downloads.delete(id);
    try {
      if (partial.exists) partial.delete();
    } catch {
      // Left for the next download, which replaces it.
    }
    if (!cancelled) logger.warn('Athan download failed', err);
    if (!job.cancelled) {
      setState(id, {
        status: 'missing',
        error: cancelled ? null : 'The download stopped. Check your connection and try again.',
      });
    }
    return false;
  }
}

export function cancelAthanDownload(id: string): void {
  const job = downloads.get(id);
  if (!job) return;
  job.cancelled = true;
  downloads.delete(id);
  job.task?.cancelAsync().catch(() => undefined);
  setState(id, { status: 'missing', error: null });
}

/** Delete a downloaded voice (prayers set to it play the bundled voice until it's downloaded again). */
export function deleteAthanVoice(id: string): void {
  if (id === BUNDLED_ATHAN_VOICE_ID) return;
  cancelAthanDownload(id);
  try {
    const f = clipFile(id);
    if (f.exists) f.delete();
  } catch (err) {
    logger.warn('Could not delete an athan clip', err);
  }
  setState(id, { status: 'missing', error: null }, true);
}
