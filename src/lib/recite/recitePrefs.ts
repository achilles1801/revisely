// Recitation checking settings, kept on this device.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../logger';

export interface RecitePrefs {
  /** Cover the words until they are recited (testing memorisation). */
  hideWords: boolean;
  /** Vibrate when a mistake is caught. */
  vibrate: boolean;
  /** Mark words that were mistakes in earlier checks. */
  showPastMistakes: boolean;
}

export const DEFAULT_RECITE_PREFS: RecitePrefs = {
  hideWords: false,
  vibrate: true,
  showPastMistakes: true,
};

const KEY = '@revisely_recite_prefs';
let current: RecitePrefs | null = null;
const listeners = new Set<(p: RecitePrefs) => void>();

export async function loadRecitePrefs(): Promise<RecitePrefs> {
  if (current) return current;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    current = { ...DEFAULT_RECITE_PREFS, ...(raw ? (JSON.parse(raw) as Partial<RecitePrefs>) : {}) };
  } catch (err) {
    logger.warn('Recite settings unreadable', err);
    current = { ...DEFAULT_RECITE_PREFS };
  }
  return current;
}

export async function setRecitePrefs(change: Partial<RecitePrefs>): Promise<RecitePrefs> {
  const next = { ...(await loadRecitePrefs()), ...change };
  current = next;
  listeners.forEach((l) => l(next));
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch((err) => logger.warn('Could not save recite settings', err));
  return next;
}

export function onRecitePrefs(listener: (p: RecitePrefs) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The settings, kept current. */
export function useRecitePrefs(): RecitePrefs {
  const [prefs, setPrefs] = useState<RecitePrefs>(current ?? DEFAULT_RECITE_PREFS);
  useEffect(() => {
    loadRecitePrefs().then(setPrefs);
    return onRecitePrefs(setPrefs);
  }, []);
  return prefs;
}
