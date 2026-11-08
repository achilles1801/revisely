// Who has Revo (REVO-37): Firestore config/app's `revo`, which the functions read too
// (functions/src/revo/release.ts: the same values, and the server's word is final). Set it with
// functions/scripts/set-app-config.js --revo <testers|everyone|off>.
//   'testers' (unset, or until the phone has read it): previewTester accounts only.
//   'everyone': every signed-in account. Set at the production release, with no new build.
//   'off': nobody, testers included (an emergency).
// Read when first needed, again when the app comes back after REVO_RELEASE_EVERY_MS, and at once when
// the server refuses Revo as paused or not open to the account. The last value is kept on the phone,
// so a launch offline shows what the last one did. Unlike the store checks, TestFlight reads it too.

import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logger } from '../logger';

export type RevoRelease = 'testers' | 'everyone' | 'off';

export const REVO_RELEASE_EVERY_MS = 10 * 60_000;
const READ_TIMEOUT_MS = 10_000;
export const REVO_RELEASE_KEY = '@revisely_revo_release';

/** The release a config value gives: 'everyone' and 'off' as written; anything else is 'testers'. */
export function revoReleaseOf(value: unknown): RevoRelease {
  return value === 'everyone' || value === 'off' ? value : 'testers';
}

let release: RevoRelease = 'testers';
let readAt: number | null = null;
let started = false;
let reading: Promise<void> | null = null;
let onReturn: { remove(): void } | null = null;
const listeners = new Set<() => void>();

function set(next: RevoRelease): void {
  if (next === release) return;
  release = next;
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

/** Reads config/app's `revo` when due (every REVO_RELEASE_EVERY_MS), or now with `force`. */
export function refreshRevoRelease(force = false, now = Date.now()): Promise<void> {
  if (reading) return reading;
  if (!force && readAt != null && now - readAt < REVO_RELEASE_EVERY_MS) return Promise.resolve();
  reading = (async () => {
    try {
      const snap = await withTimeout(getDoc(doc(db, 'config', 'app')));
      const next = revoReleaseOf(snap.exists() ? snap.get('revo') : undefined);
      readAt = now;
      set(next);
      await AsyncStorage.setItem(REVO_RELEASE_KEY, next).catch(() => undefined);
    } catch (err) {
      // Offline or refused: the last value stands, and the next return tries again.
      logger.warn('Could not read Revo’s release', err);
    }
  })().finally(() => {
    reading = null;
  });
  return reading;
}

/** Once: the value kept on the phone, a read, and a read on each return when due. */
export function startRevoRelease(): void {
  if (started) return;
  started = true;
  void AsyncStorage.getItem(REVO_RELEASE_KEY)
    .then((saved) => {
      // A read that has already answered wins over the kept value.
      if (saved != null && readAt == null) set(revoReleaseOf(saved));
    })
    .catch(() => undefined);
  void refreshRevoRelease(true);
  onReturn = AppState.addEventListener('change', (s) => {
    if (s === 'active') void refreshRevoRelease();
  });
}

function subscribe(listener: () => void): () => void {
  startRevoRelease();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The release as last read (testers until then). */
export const currentRevoRelease = (): RevoRelease => release;

/** The release as last read (testers until then); starts the reads on first use. */
export function useRevoRelease(): RevoRelease {
  return useSyncExternalStore(subscribe, currentRevoRelease, currentRevoRelease);
}

/** For tests: back to a phone that has read nothing. */
export function resetRevoReleaseForTests(): void {
  release = 'testers';
  readAt = null;
  started = false;
  reading = null;
  onReturn?.remove();
  onReturn = null;
  listeners.clear();
}
