// What the account has done, for the Account page, Home's picture and the end card (ACCOUNT-4, ACCOUNT-5): pages revised
// and the longest streak, from the same Activity history Home's streak reads (lib/activityHistory), with the phone's own
// sessions laid over it (a session counts the moment it is saved) and the items older than that history.
//
// Pages revised counts every revision: each page of each revision item, so a page revised on three days is three, from a
// session or the daily log (Majd's pick, Nov 26 2026). A page revised twice on one day is one, as Activity shows it.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { useRevisionDay } from '../hooks/useRevisionDay';
import type { RevisionLog, UserPage } from '../types';
import { getRevisionItemsBefore } from '../services/firestoreService';
import { HISTORY_DAYS, historyOf, useActivityHistory, useSharedActivityHistory, withPhoneSessions } from './activityHistory';
import { MILESTONES, type Milestone } from './badges';
import { logger } from './logger';
import { dateToLocalISODay } from './schedulePlans';
import { nextIsoDay } from './streak';
import { streakDetailFromItems, type HistoryItem } from './streakFromItems';

const NO_PAGES: UserPage[] = [];
const NO_LOGS: RevisionLog[] = [];

/** Every page of every item: pages revised all along. */
export function pagesRevisedOf(items: readonly HistoryItem[]): number {
  return items.reduce((n, x) => n + x.pages.length, 0);
}

/** The day each milestone was reached, walking the items in the order they happened. */
export function milestoneDaysOf(items: readonly HistoryItem[]): Map<Milestone, string> {
  const sorted = [...items].sort((a, b) => (a.day === b.day ? (a.occurredAt ?? 0) - (b.occurredAt ?? 0) : a.day < b.day ? -1 : 1));
  const out = new Map<Milestone, string>();
  let total = 0;
  let i = 0;
  for (const x of sorted) {
    total += x.pages.length;
    while (i < MILESTONES.length && total >= MILESTONES[i]) out.set(MILESTONES[i++], x.day);
  }
  return out;
}

/** The longest run of days, each the day after the one before. */
export function longestRunOf(days: Iterable<string>): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev != null && nextIsoDay(prev) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/** The first day of the history Home reads for `day`; items before it are "older". */
export function historyStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dateToLocalISODay(new Date(y, m - 1, d - HISTORY_DAYS));
}

// The older items, per account and start: they don't change, so they are read once a run of the app.
const older = new Map<string, HistoryItem[]>();

function useOlderItems(uid: string | null | undefined, before: string): HistoryItem[] | null {
  const key = uid ? `${uid}:${before}` : null;
  const [items, setItems] = useState<HistoryItem[] | null>(() => (key ? older.get(key) ?? null : null));
  useEffect(() => {
    if (!key || !uid) return;
    const kept = older.get(key);
    if (kept) {
      setItems(kept);
      return;
    }
    let cancelled = false;
    getRevisionItemsBefore(before, uid)
      .then((list) => {
        const got = historyOf(list);
        older.set(key, got);
        if (!cancelled) setItems(got);
      })
      .catch((err) => {
        logger.warn('Account: older revision items could not be read', err);
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [key, uid, before]);
  return key ? items : null;
}

// Pages revised as last worked out, per account, kept on the phone (HOME-8): Home's picture wears its latest badge from
// the first frame, before the history has been read from the server. Read as the app starts, as homePrefs does.
export const PAGES_REVISED_KEY = '@revisely_pages_revised:v1';
let revisedKept: Record<string, number> = {};
let revisedLoaded = false;
const revisedListeners = new Set<() => void>();
AsyncStorage.getItem(PAGES_REVISED_KEY)
  .then((raw) => {
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, number> = {};
    for (const [uid, n] of Object.entries(v ?? {})) if (typeof n === 'number' && Number.isFinite(n)) out[uid] = n;
    revisedKept = { ...out, ...revisedKept };
  })
  .catch(() => undefined)
  .finally(() => {
    revisedLoaded = true;
    revisedListeners.forEach((l) => l());
  });

function keepPagesRevised(uid: string, n: number): void {
  if (revisedKept[uid] === n) return;
  revisedKept = { ...revisedKept, [uid]: n };
  revisedListeners.forEach((l) => l());
  AsyncStorage.setItem(PAGES_REVISED_KEY, JSON.stringify(revisedKept)).catch(() => undefined);
}

/** Pages revised as this phone last worked them out for the account; null when it never has. */
export function usePagesRevisedOnPhone(uid: string | null | undefined): number | null {
  const kept = useSyncExternalStore(
    (l) => {
      revisedListeners.add(l);
      return () => void revisedListeners.delete(l);
    },
    () => (revisedLoaded ? revisedKept : null),
  );
  return uid && kept && typeof kept[uid] === 'number' ? kept[uid] : null;
}

export interface AccountJourney {
  pagesRevised: number;
  /** In days; null when not asked for. */
  longestStreak: number | null;
  /** The day each milestone reached was reached on. */
  reachedOn: Map<Milestone, string>;
}

/**
 * Pages revised (and, with `streak`, the longest streak), live; null until the history has loaded. `load` false: wait
 * for the history Home shares rather than read it here (Home reads it itself).
 */
export function useAccountJourney({
  enabled = true,
  streak = false,
  load = true,
}: { enabled?: boolean; streak?: boolean; load?: boolean } = {}): AccountJourney | null {
  const app = useApp();
  const user = enabled ? app.user ?? null : null;
  const pages = app.pages ?? NO_PAGES;
  const logs = app.logs ?? NO_LOGS;
  const { day } = useRevisionDay(user);
  const uid = user?.id ?? null;
  const shared = useSharedActivityHistory(uid, day);
  const own = useActivityHistory(day, load && !shared && uid != null, logs.length);
  const history = shared ?? own;
  const olderItems = useOlderItems(uid, historyStart(day));
  const journey = useMemo(() => {
    if (!user || !history || !olderItems) return null;
    const items = withPhoneSessions([...olderItems, ...history], logs, Date.now());
    let longestStreak: number | null = null;
    if (streak) {
      const detail = streakDetailFromItems({ user, pages, items, today: day });
      longestStreak = Math.max(longestRunOf(detail.done), detail.reading.streak);
    }
    return { pagesRevised: pagesRevisedOf(items), longestStreak, reachedOn: milestoneDaysOf(items) };
  }, [user, pages, logs, history, olderItems, streak, day]);
  useEffect(() => {
    if (uid && journey) keepPagesRevised(uid, journey.pagesRevised);
  }, [uid, journey]);
  return journey;
}

/** Tests only. */
export function resetAccountJourneyForTests(): void {
  older.clear();
}
