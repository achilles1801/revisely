import { useEffect, useState } from 'react';
import * as firestoreService from '../../services/firestoreService';
import { logger } from '../../lib/logger';
import { dayChangesKey, joinedSince, overlayDayItems, type DayItems } from '../../lib/offline/dayItems';
import { pendingEntries, subscribeOutbox } from '../../lib/offline/outbox';
import { currentAccount } from '../../lib/offline/queue';

const withPending = (items: DayItems, day: string): DayItems => {
  const uid = currentAccount();
  return uid ? overlayDayItems(items, pendingEntries(uid), day, uid) : items;
};

/**
 * One day's Activity items while `active` (an add sheet open): what the server has, with the changes
 * still waiting laid over it, read again when a change to that day joins or leaves the outbox.
 * Null until read.
 */
export function useDayItems(day: string, active: boolean): DayItems | null {
  const [items, setItems] = useState<DayItems | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let served: DayItems | null = null;
    let waiting = new Set<string>();
    let n = 0;
    const load = () => {
      const mine = ++n;
      // At once only when a change has joined; one that left is in what's shown already.
      const since = joinedSince(waiting, pendingEntries(currentAccount()), day);
      waiting = since.ids;
      if (since.joined && served) setItems(withPending(served, day));
      firestoreService
        .getActivityItemsForDay(day)
        .then((got) => {
          if (cancelled || mine !== n) return;
          served = got;
          setItems(withPending(got, day));
        })
        .catch((err) => {
          logger.warn('Could not read the day’s Activity items', err);
          if (!cancelled && mine === n && !served) setItems(withPending({ revisions: [], memorized: [], reads: [], doneAhead: [] }, day));
        });
    };
    load();
    let key = dayChangesKey(pendingEntries(currentAccount()), day);
    const unsubscribe = subscribeOutbox((uid) => {
      if (uid !== currentAccount()) return;
      const next = dayChangesKey(pendingEntries(uid), day);
      if (next === key) return;
      key = next;
      load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [day, active]);
  return items;
}

/** The pages already revised for `day`: its own items' pages (the session's and those added by hand). */
export function revisedOnDay(items: DayItems | null, day: string): number[] {
  if (!items) return [];
  return [...new Set(items.revisions.filter((r) => r.day === day && r.countsFor === day).flatMap((r) => r.pages))];
}
