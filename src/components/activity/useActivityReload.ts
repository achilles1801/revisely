import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useReadingTimer } from '../../context/ReadingTimerContext';
import { pendingEntries, subscribeOutbox } from '../../lib/offline/outbox';
import { currentAccount } from '../../lib/offline/queue';
import { dayChangesKey } from '../../lib/offline/dayItems';

/**
 * Run `load` whenever the screen gains focus (back from an editor) and when
 * the floating timer stops: its controls open over the screen, so a session
 * saved from them never refocuses it.
 *
 * With a `day` (an Activity day), also when a change to that day joins or leaves the outbox
 * (ACT-13): an add from the day's + is a sheet over the screen, which never refocuses it, and the
 * day showed nothing until it was opened again (Nov 2026). Joining shows the add at once (the
 * screen lays the waiting changes over what it read); leaving means the server has it.
 */
export function useActivityReload(load: () => void, day?: string) {
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const { timer } = useReadingTimer();
  const active = timer != null;
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) load();
    wasActive.current = active;
  }, [active, load]);

  useEffect(() => {
    if (!day) return;
    let key = dayChangesKey(pendingEntries(currentAccount()), day);
    return subscribeOutbox((uid) => {
      if (uid !== currentAccount()) return;
      const next = dayChangesKey(pendingEntries(uid), day);
      if (next === key) return;
      key = next;
      load();
    });
  }, [day, load]);
}
