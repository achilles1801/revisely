// The "What's new" kill switch: Firestore config/app's `whatsNewOff` (true stops the required
// walkthrough for everyone without an update, in case a card turns out wrong). Set it with
//   functions/scripts/set-app-config.js --whats-new off   (and --whats-new on to undo)
// Read at launch and again when the app comes back after KILL_SWITCH_EVERY_MS; the last value is kept
// on the phone, so a launch offline does what the last one did. Unlike the store checks, TestFlight
// and development builds read it too. Settings' replay and a tester's run at launch ignore it.

import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logger } from '../logger';

export const KILL_SWITCH_EVERY_MS = 10 * 60_000;
export const KILL_SWITCH_KEY = '@revisely_whats_new_off';
const READ_TIMEOUT_MS = 10_000;

/** Off only for exactly `true`: anything else (unset, a typo) leaves the walkthrough on. */
export const whatsNewOffOf = (value: unknown): boolean => value === true;

/** undefined until the phone's copy (or a read) has answered. */
let off: boolean | undefined;
let readAt: number | null = null;
let started = false;
let reading: Promise<void> | null = null;
let onReturn: { remove(): void } | null = null;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (next === off) return;
  off = next;
  listeners.forEach((l) => l());
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out')), READ_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Reads config/app's `whatsNewOff` when due, or now with `force`. */
export function refreshWhatsNewOff(force = false, now = Date.now()): Promise<void> {
  if (reading) return reading;
  if (!force && readAt != null && now - readAt < KILL_SWITCH_EVERY_MS) return Promise.resolve();
  reading = (async () => {
    try {
      const snap = await withTimeout(getDoc(doc(db, 'config', 'app')));
      const next = whatsNewOffOf(snap.exists() ? snap.get('whatsNewOff') : undefined);
      readAt = now;
      set(next);
      await AsyncStorage.setItem(KILL_SWITCH_KEY, next ? '1' : '0').catch(() => undefined);
    } catch (err) {
      // Offline or refused: the phone's copy stands (on, with none), and the next return tries again.
      logger.warn("Could not read What's new's switch", err);
      if (off === undefined) set(false);
    }
  })().finally(() => {
    reading = null;
  });
  return reading;
}

/** Once: the phone's copy, a read, and a read on each return when due. */
export function startWhatsNewOff(): void {
  if (started) return;
  started = true;
  void AsyncStorage.getItem(KILL_SWITCH_KEY)
    .then((saved) => {
      // A read that has already answered wins over the copy.
      if (readAt == null && off === undefined) set(saved === '1');
    })
    .catch(() => {
      if (off === undefined) set(false);
    });
  void refreshWhatsNewOff(true);
  onReturn = AppState.addEventListener('change', (s) => {
    if (s === 'active') void refreshWhatsNewOff();
  });
}

function subscribe(listener: () => void): () => void {
  startWhatsNewOff();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const current = (): boolean | undefined => off;

const idle = () => () => undefined;

/**
 * Whether the walkthrough is switched off (undefined until the phone's copy has been read). Reads
 * nothing until `active` (an account it would show to).
 */
export function useWhatsNewOff(active = true): boolean | undefined {
  return useSyncExternalStore(active ? subscribe : idle, current, current);
}

/** For tests: a phone that has read nothing. */
export function resetWhatsNewOffForTests(): void {
  off = undefined;
  readAt = null;
  started = false;
  reading = null;
  onReturn?.remove();
  onReturn = null;
  listeners.clear();
}
