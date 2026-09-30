import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as firestoreService from '../services/firestoreService';
import { logger } from './logger';

/**
 * Tracks time spent with the app in the foreground. Seconds are banked when
 * the app backgrounds (and every few minutes while open) and added to the
 * user's running total in Firestore; anything that fails to upload waits in
 * AsyncStorage and is retried on the next bank.
 */

const PENDING_KEY = '@revisely_usage_pending_seconds';
const BANK_INTERVAL_MS = 5 * 60 * 1000;
// Guard against clock jumps producing absurd totals from one stretch.
const MAX_STRETCH_SECONDS = 6 * 60 * 60;

let foregroundSince: number | null = null;
let banking: Promise<void> = Promise.resolve();

async function readPending(): Promise<number> {
  const raw = await AsyncStorage.getItem(PENDING_KEY).catch(() => null);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function bank(stillActive: boolean): Promise<void> {
  banking = banking.then(async () => {
    const now = Date.now();
    const stretch =
      foregroundSince != null
        ? Math.min(Math.max(0, (now - foregroundSince) / 1000), MAX_STRETCH_SECONDS)
        : 0;
    foregroundSince = stillActive ? now : null;

    const pending = (await readPending()) + stretch;
    if (pending < 1) return;
    try {
      await firestoreService.addAppUsageSeconds(pending);
      await AsyncStorage.removeItem(PENDING_KEY);
    } catch (err) {
      logger.log('App usage upload failed; will retry', err);
      await AsyncStorage.setItem(PENDING_KEY, String(pending)).catch(() => {});
    }
  });
  return banking;
}

/** Mount once for signed-in users. */
export function useAppUsageTracking() {
  useEffect(() => {
    if (AppState.currentState === 'active') foregroundSince = Date.now();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        if (foregroundSince == null) foregroundSince = Date.now();
      } else if (foregroundSince != null) {
        bank(false);
      }
    });
    const interval = setInterval(() => {
      if (foregroundSince != null) bank(true);
    }, BANK_INTERVAL_MS);

    return () => {
      sub.remove();
      clearInterval(interval);
      if (foregroundSince != null) bank(false);
    };
  }, []);
}

/** Total seconds in the app, including the current unsaved stretch. */
export async function getTotalAppUsageSeconds(): Promise<number> {
  await banking;
  const [server, pending] = await Promise.all([
    firestoreService.getAppUsageSeconds().catch(() => 0),
    readPending(),
  ]);
  const current = foregroundSince != null ? (Date.now() - foregroundSince) / 1000 : 0;
  return server + pending + current;
}
