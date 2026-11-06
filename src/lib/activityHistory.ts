// The Activity revision items of the last 400 days, for the streak (C5): the Dashboard, the
// widget and the reminders read it through here. Until it loads, callers use the session logs.

import { useEffect, useState } from 'react';
import * as firestoreService from '../services/firestoreService';
import { dateToLocalISODay } from './schedulePlans';
import type { HistoryItem } from './streakFromItems';

export const HISTORY_DAYS = 400;

/** The history from HISTORY_DAYS before `day` up to `day`, as the streak reads it. */
export async function loadActivityHistory(day: string): Promise<HistoryItem[]> {
  const [y, m, d] = day.split('-').map(Number);
  const from = dateToLocalISODay(new Date(y, m - 1, d - HISTORY_DAYS));
  const r = await firestoreService.getActivityItemsBetween(from, day);
  return r.revisions.map((x) => ({ day: x.day, countsFor: x.countsFor, pages: x.pages, assigned: x.assigned, occurredAt: x.occurredAt }));
}

/** The history for `day`, reloaded when `key` changes; null until it has loaded (or when not `enabled`). */
export function useActivityHistory(day: string | null, enabled: boolean, key: unknown): HistoryItem[] | null {
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  useEffect(() => {
    if (!enabled || !day) return;
    let cancelled = false;
    loadActivityHistory(day)
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `key` says when the history may have changed (a session saved, the day moved on).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, day, key]);
  return history;
}
