// Audio Options kept per account on this phone: speed, repeats, the pause after
// each verse and "Play up to". (The reciter is on the account itself, as
// before.) One store, so the reader and the revision session share them.

import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cleanOptions, DEFAULT_PLAYBACK, PlaybackOptions, storableOptions } from './playbackPlan';
import { logger } from './logger';

export const audioOptionsKey = (uid: string) => `@revisely_audio_options:${uid}`;

let owner: string | null = null;
let current: PlaybackOptions = DEFAULT_PLAYBACK;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Load the account's settings (the defaults until they arrive, or for a new account). */
export async function loadAudioOptions(uid: string | null | undefined): Promise<PlaybackOptions> {
  if (!uid) {
    owner = null;
    current = DEFAULT_PLAYBACK;
    notify();
    return current;
  }
  if (owner !== uid) {
    owner = uid;
    current = DEFAULT_PLAYBACK;
    notify();
  }
  try {
    const raw = await AsyncStorage.getItem(audioOptionsKey(uid));
    if (owner !== uid) return current;
    current = cleanOptions(raw ? JSON.parse(raw) : null);
  } catch (err) {
    logger.warn('Audio options unreadable', err);
    current = DEFAULT_PLAYBACK;
  }
  notify();
  return current;
}

/** Change some settings and keep them for the account. */
export function updateAudioOptions(patch: Partial<PlaybackOptions>) {
  current = cleanOptions({ ...current, ...patch });
  notify();
  if (!owner) return;
  AsyncStorage.setItem(audioOptionsKey(owner), JSON.stringify(storableOptions(current))).catch((err) =>
    logger.warn('Could not save audio options', err),
  );
}

export function getAudioOptions(): PlaybackOptions {
  return current;
}

/** The signed-in account's Audio Options, live. */
export function useAudioOptions(uid: string | null | undefined): PlaybackOptions {
  useEffect(() => {
    loadAudioOptions(uid);
  }, [uid]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
