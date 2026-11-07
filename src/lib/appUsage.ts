import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as firestoreService from '../services/firestoreService';
import { logger } from './logger';
import { currentAccount, pendingUsageSeconds, queueChange } from './offline/queue';

/**
 * Tracks time spent with the app in the foreground. Seconds are banked when
 * the app backgrounds (and every few minutes while open) into the account's
 * outbox (lib/offline), which adds them to the running total in Firestore
 * when it can; seconds banked while signed out wait in AsyncStorage.
 */

const PENDING_KEY = '@revisely_usage_pending_seconds';
// The server's total when last read, per account, for when it can't be reached.
const SERVER_KEY = (uid: string) => `@revisely_usage_server_seconds:${uid}`;
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
    const whole = Math.round(pending);
    if (whole < 1) return;
    try {
      // Saved on the phone at once (offline too); sent when it can be.
      await queueChange({ kind: 'usage', seconds: whole });
      await AsyncStorage.removeItem(PENDING_KEY);
    } catch (err) {
      logger.log('App usage not queued (signed out?); kept for later', err);
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
  const uid = currentAccount();
  const [server, pending] = await Promise.all([
    serverSeconds(uid),
    readPending(),
  ]);
  const current = foregroundSince != null ? (Date.now() - foregroundSince) / 1000 : 0;
  return server + pendingUsageSeconds(uid) + pending + current;
}

/** The server's total (the last one read when it can't be reached). */
async function serverSeconds(uid: string | null): Promise<number> {
  if (!uid) return 0;
  try {
    const seconds = await firestoreService.getAppUsageSeconds(uid);
    AsyncStorage.setItem(SERVER_KEY(uid), String(seconds)).catch(() => {});
    return seconds;
  } catch {
    const raw = await AsyncStorage.getItem(SERVER_KEY(uid)).catch(() => null);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
}
