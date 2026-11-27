// What Activity and Insights read from the server, kept on the phone per account (ACT-36; Majd, Nov 26 2026: "ideally
// someone just hops on the app swipes to insights and everything's already loaded"). On a cold start the tab mounts
// beside Home and reads the readings, the daily log, the items for its range and a year of memorization; the reads can
// come back before Auth has the account and fail, so the tab showed a spinner, then its outlines, and filled in only
// once it was swiped to and read again. Now the last answers are read as the app starts (as homePrefs is), the tab
// draws from them at once, and each fresh answer replaces them quietly and is kept for the next start.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { JournalEntry, ReadingSession } from '../types';
import type { getActivityItemsBetween } from '../services/firestoreService';

export type ActivityItemsData = Awaited<ReturnType<typeof getActivityItemsBetween>>;

export interface ActivityKept {
  readings?: ReadingSession[];
  journal?: JournalEntry[];
  /** The items for the days from `from` to `to`. */
  items?: { from: string; to: string; data: ActivityItemsData };
  /** Insights' year of memorization. */
  year?: { from: string; list: { day: string; pages: number[] }[] };
}
type Part = keyof ActivityKept;
const PARTS: Part[] = ['readings', 'journal', 'items', 'year'];

const LAST = '@revisely_activity_kept:v1:last';
const key = (uid: string, part: Part) => `@revisely_activity_kept:v1:${uid}:${part}`;

let kept: { uid: string; parts: ActivityKept } | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Read as the app starts, for the account last on this phone: the tab mounts right after Home's first frame.
AsyncStorage.getItem(LAST)
  .then(async (uid) => {
    if (!uid) return;
    const rows = await AsyncStorage.multiGet(PARTS.map((p) => key(uid, p)));
    const parts: ActivityKept = {};
    rows.forEach(([, raw], i) => {
      if (!raw) return;
      try {
        (parts as Record<string, unknown>)[PARTS[i]] = JSON.parse(raw);
      } catch {
        // A broken part is left out; the next read writes it again.
      }
    });
    if (!kept || kept.uid !== uid) kept = { uid, parts: { ...parts, ...(kept?.uid === uid ? kept.parts : {}) } };
  })
  .catch(() => undefined)
  .finally(() => {
    loaded = true;
    emit();
  });

/** What is kept for this account now (null before the phone's copy is read, or for another account). */
export function activityKept(uid: string | null | undefined): ActivityKept | null {
  return uid && kept && kept.uid === uid ? kept.parts : null;
}

/** activityKept, and a render when the phone's copy has been read. */
export function useActivityKept(uid: string | null | undefined): ActivityKept | null {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => (loaded ? kept : null),
  );
  return activityKept(uid);
}

/** Keeps a fresh answer for this account (and makes it the account read at the next start). */
export function keepActivity<P extends Part>(uid: string, part: P, value: NonNullable<ActivityKept[P]>): void {
  const parts = kept && kept.uid === uid ? kept.parts : {};
  kept = { uid, parts: { ...parts, [part]: value } };
  AsyncStorage.multiSet([
    [LAST, uid],
    [key(uid, part), JSON.stringify(value)],
  ]).catch(() => undefined);
}

/** The kept items for a range starting at `from`: those on or after it, if the copy reaches back that far. */
export function keptItemsFrom(k: ActivityKept | null, from: string): ActivityItemsData | null {
  const items = k?.items;
  if (!items || items.from > from) return null;
  const on = <T extends { day: string }>(list: T[]) => list.filter((x) => x.day >= from);
  return { revisions: on(items.data.revisions), memorized: on(items.data.memorized), reads: on(items.data.reads) };
}

/** Tests only. */
export function resetActivityKeptForTests(next: { uid: string; parts: ActivityKept } | null = null): void {
  kept = next;
  loaded = true;
  listeners.clear();
}
