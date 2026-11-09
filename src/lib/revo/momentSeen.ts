// Whether an account has seen Revo's moment on this phone (REVO-39): played or skipped, in What's new,
// on Revo's first open or from Settings. Revo's first open plays it only while this is false. Kept on
// the phone per account (no user field, so no rules deploy); another phone shows it once there too.

import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (uid: string) => `@revisely_revo_moment_seen:v1:${uid}`;
const seen = new Map<string, boolean>();

/** Read it from the phone (once per account a run). */
export async function loadRevoMomentSeen(uid: string): Promise<boolean> {
  const known = seen.get(uid);
  if (known !== undefined) return known;
  let value = false;
  try {
    value = (await AsyncStorage.getItem(key(uid))) === '1';
  } catch {
    // Unreadable: treat as seen, so a broken store never plays it on every open.
    value = true;
  }
  // A mark written while this read was out wins.
  if (!seen.has(uid)) seen.set(uid, value);
  return seen.get(uid) as boolean;
}

/** As last read or marked: undefined until loaded. */
export function revoMomentSeen(uid: string): boolean | undefined {
  return seen.get(uid);
}

export function markRevoMomentSeen(uid: string): void {
  if (seen.get(uid) === true) return;
  seen.set(uid, true);
  AsyncStorage.setItem(key(uid), '1').catch(() => undefined);
}

export function resetRevoMomentSeenForTests(): void {
  seen.clear();
}
