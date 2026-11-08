// The Activity revision items of the last 400 days, for the streak (C5): the Dashboard, the
// widget and the reminders read it through here. Until it loads, callers use the session logs.

import { useEffect, useState, useSyncExternalStore } from 'react';
import * as firestoreService from '../services/firestoreService';
import type { RevisionLog } from '../types';
import { catchUpPagesOf } from './aheadCredit';
import { revisionItemId } from './revisionItems';
import { dateToLocalISODay } from './schedulePlans';
import type { HistoryItem } from './streakFromItems';
import type { OutboxEntry } from './offline/ops';

export const HISTORY_DAYS = 400;

/** The history from HISTORY_DAYS before `day` up to `day`, as the streak reads it. */
export async function loadActivityHistory(day: string): Promise<HistoryItem[]> {
  const [y, m, d] = day.split('-').map(Number);
  const from = dateToLocalISODay(new Date(y, m - 1, d - HISTORY_DAYS));
  const r = await firestoreService.getActivityItemsBetween(from, day);
  return historyOf(r.revisions);
}

/** The server's Revised items as the streak reads them. */
export function historyOf(
  revisions: { id: string; day: string; countsFor: string; pages: number[]; assigned: number[]; occurredAt: number | null }[],
): HistoryItem[] {
  return revisions.map((x) => ({ id: x.id, day: x.day, countsFor: x.countsFor, pages: x.pages, assigned: x.assigned, occurredAt: x.occurredAt }));
}

/** A session's own item, if it revised a page of its day, and one item per later day it credited (lib/revisionItems). */
function itemsOfSession(log: RevisionLog, occurredAt: number): HistoryItem[] {
  const ahead = Object.entries(log.ahead ?? {}).filter(([, pages]) => pages.length > 0);
  const aheadPages = new Set(ahead.flatMap(([, pages]) => pages));
  const own: HistoryItem = {
    id: revisionItemId(log.date),
    day: log.date,
    countsFor: log.date,
    pages: log.pagesRevised.filter((p) => !aheadPages.has(p)),
    assigned: log.assignedPages ?? [],
    occurredAt,
  };
  const credited = ahead.map(([countsFor, pages]) => ({
    id: revisionItemId(log.date, countsFor),
    day: log.date,
    countsFor,
    pages: [...pages],
    assigned: [],
    occurredAt,
  }));
  // A day Keep daily amount filled with carried pages has none of its own to revise: its item is
  // still kept here, for its assignment (the carried pages, SESS-7), so the streak can tell when
  // that day was done after the carry has moved on. The server writes no such item (Activity
  // shows the day's credits), so older days than the phone's sessions go by the plan.
  const assigned = new Set(own.assigned);
  const fillsDay = catchUpPagesOf(log).some((p) => assigned.has(p));
  return own.pages.length > 0 || fillsDay ? [own, ...credited] : credited;
}

const isSessionItem = (x: HistoryItem) => x.id != null && (x.id === x.day || x.id.startsWith(`${x.day}-ahead-`));

/**
 * The history with the phone's own sessions laid over it (SESS-2, SESS-6). A session shows on
 * the phone as soon as it is saved, and its items reach the server a moment later; the history is
 * read only when the day or the number of sessions changes, so a day finished, or yesterday's
 * pages caught up, left the streak as it was until the next read (Nov 2026: Home said Done with
 * no streak). Each session the phone holds stands for its items, worked out as the server writes
 * them (revisionItemsFor). A day keeps the time its items already have on the server; a day new
 * to it is `now`. From the oldest day the phone holds a session for, a session's item with no
 * session on the phone is gone (deleted). Manual adds and older days stay as the server has them.
 */
export function withPhoneSessions(history: readonly HistoryItem[], logs: readonly RevisionLog[], now: number): HistoryItem[] {
  if (logs.length === 0) return [...history];
  const oldest = logs.reduce((min, l) => (l.date < min ? l.date : min), logs[0].date);
  const at = new Map<string, number>();
  // A session's items share its time; a session that revised only catch-up pages has no item of
  // its own on the server, so its credit items give it.
  for (const x of history) if (x.id === x.day && x.occurredAt != null) at.set(x.day, x.occurredAt);
  for (const x of history) if (isSessionItem(x) && x.occurredAt != null && !at.has(x.day)) at.set(x.day, x.occurredAt);
  const kept = history.filter((x) => !(isSessionItem(x) && x.day >= oldest));
  return [...kept, ...logs.flatMap((l) => itemsOfSession(l, at.get(l.date) ?? now))];
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

// The copy Home read last, shared: Revo builds its context from the same items Home's streak
// reads (lib/todaySnapshot), without a second read of 400 days. Per account and day.
let shared: { uid: string; day: string; items: HistoryItem[] } | null = null;
const listeners = new Set<() => void>();

export function shareActivityHistory(uid: string, day: string, items: HistoryItem[]): void {
  shared = { uid, day, items };
  for (const l of listeners) l();
}

/** The history Home read last for this account and day, or null (callers use the logs, as Home does). */
export function useSharedActivityHistory(uid: string | null | undefined, day: string): HistoryItem[] | null {
  const current = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
    () => shared,
  );
  return current && uid && current.uid === uid && current.day === day ? current.items : null;
}

/** Whether a history item is pages logged by hand (Activity's + → Revised elsewhere). */
export const isHandLogged = (x: HistoryItem): boolean => x.id?.startsWith('manual-') === true;

/**
 * Pages logged by hand, one log per day they count for, for what reads session logs: Home's today
 * (N of total, Done) and its catch-up offer (ACT-15). A page counts once a day, whatever logged it.
 * No assignment: a day keeps its session's or the plan's.
 */
export function handLogsOf(history: readonly HistoryItem[] | null | undefined): RevisionLog[] {
  const byDay = new Map<string, Set<number>>();
  for (const x of history ?? []) {
    if (!isHandLogged(x)) continue;
    const set = byDay.get(x.countsFor) ?? new Set<number>();
    for (const p of x.pages) set.add(p);
    byDay.set(x.countsFor, set);
  }
  return [...byDay].map(([day, pages]) => ({
    id: `hand-${day}`,
    date: day,
    pagesRevised: [...pages].sort((a, b) => a - b),
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: null,
  }));
}

/** The history with pages logged by hand that are still waiting on the phone (or deleted there) laid over it. */
export function withPendingHandLogs(history: readonly HistoryItem[] | null, entries: readonly OutboxEntry[]): HistoryItem[] | null {
  if (!history) return null;
  let out = [...history];
  for (const e of entries) {
    const op = e.op;
    if (op.kind === 'revision.add') {
      const { id, day, countsFor, pages, assigned, occurredAt } = op.item;
      if (!out.some((x) => x.id === id)) out = [...out, { id, day, countsFor, pages, assigned, occurredAt }];
    } else if (op.kind === 'revision.delete') {
      out = out.filter((x) => x.id !== op.id);
    }
  }
  return out;
}
