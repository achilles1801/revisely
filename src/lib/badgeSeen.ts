// A new badge is shown once (ACCOUNT-6): on the session's end card or on Account, whichever comes first, then never
// again on this phone. Kept per account on the phone: the highest milestone shown.
//
// The first time an account is read here, its badges so far count as seen: a heavy account's months-old badges don't
// all arrive as "new" the day this ships. A new account starts at none, so its first badge is new.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Milestone } from './badges';

const KEY = (uid: string) => `@revisely_badge_seen:v1:${uid}`;

const cache = new Map<string, number>();
const listeners = new Set<() => void>();

async function read(uid: string): Promise<number | null> {
  if (cache.has(uid)) return cache.get(uid)!;
  try {
    const raw = await AsyncStorage.getItem(KEY(uid));
    if (raw == null) return null;
    const n = Number(raw);
    if (Number.isFinite(n)) cache.set(uid, n);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function markBadgeSeen(uid: string, milestone: number): Promise<void> {
  if ((cache.get(uid) ?? -1) >= milestone) return;
  cache.set(uid, milestone);
  listeners.forEach((l) => l());
  await AsyncStorage.setItem(KEY(uid), String(milestone)).catch(() => undefined);
}

/**
 * The badge to show as new, or null: `latest` when it is above the highest shown on this phone. `latest` undefined: not
 * known yet (nothing is decided). An account read here the first time takes `latest` as seen.
 */
export function useNewBadge(uid: string | null | undefined, latest: Milestone | null | undefined): Milestone | null {
  const [seen, setSeen] = useState<number | null | undefined>(uid ? cache.get(uid) : undefined);
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const load = () =>
      read(uid).then((n) => {
        if (!cancelled) setSeen(n);
      });
    load();
    listeners.add(load);
    return () => {
      cancelled = true;
      listeners.delete(load);
    };
  }, [uid]);
  useEffect(() => {
    // First read of this account here: what it has so far is seen.
    if (uid && seen === null && latest !== undefined) void markBadgeSeen(uid, latest ?? 0);
  }, [uid, seen, latest]);
  if (!uid || latest == null || seen == null) return null;
  return latest > seen ? latest : null;
}

/**
 * The badge moment for a screen (Account, the end card): the new badge, kept for as long as the screen is up, and
 * marked seen once `visible` (the end card is drawn before the session reaches it). Null when there is none.
 */
export function useBadgeMoment(
  uid: string | null | undefined,
  latest: Milestone | null | undefined,
  visible = true,
): Milestone | null {
  const fresh = useNewBadge(uid, latest);
  const [kept, setKept] = useState<Milestone | null>(null);
  useEffect(() => {
    if (fresh != null && kept == null) setKept(fresh);
  }, [fresh, kept]);
  const moment = kept ?? fresh;
  useEffect(() => {
    if (uid && moment != null && visible) void markBadgeSeen(uid, moment);
  }, [uid, moment, visible]);
  return moment;
}

/** Tests only. */
export function resetBadgeSeenForTests(): void {
  cache.clear();
  listeners.clear();
}
