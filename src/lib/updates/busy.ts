// What a restart for an update must never interrupt: a recording (recording or
// paused), a recitation (playing or paused), a timer, or any screen but a tab's
// main one (a revision session, the reader, an editor, onboarding, sign-in).

import { useEffect, useState } from 'react';
import { navigationRef } from '../../navigation/navigationRef';
import { getRecitation } from '../recitation';
import { isActive } from '../nowPlaying';
import { hasRecordingSession, onRecordingSessionChange } from '../recordings';

/** The tabs' own screens: Home, Read's index, Insights. */
export const MAIN_SCREENS: ReadonlySet<string> = new Set(['Dashboard', 'ReadIndex', 'Insights']);

export type BusyReason = 'recording' | 'recitation' | 'timer' | 'screen';

const flags = new Set<BusyReason>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** For state kept elsewhere that can't be read from here (the timer). */
export function setBusy(reason: 'timer', on: boolean): void {
  if (on === flags.has(reason)) return;
  if (on) flags.add(reason);
  else flags.delete(reason);
  notify();
}

function currentScreen(): string | undefined {
  try {
    return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
  } catch {
    return undefined;
  }
}

/** Why a restart would interrupt something now; empty when it wouldn't. */
export function busyReasons(): BusyReason[] {
  const reasons: BusyReason[] = [];
  if (hasRecordingSession()) reasons.push('recording');
  if (isActive(getRecitation().getState())) reasons.push('recitation');
  flags.forEach((f) => reasons.push(f));
  const screen = currentScreen();
  if (!screen || !MAIN_SCREENS.has(screen)) reasons.push('screen');
  return reasons;
}

export function isBusy(): boolean {
  return busyReasons().length > 0;
}

// Registered once, before the navigation container mounts: the ref keeps a
// listener added then and attaches it to every container it gets.
let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  navigationRef.addListener('state', notify);
  getRecitation().subscribe(notify);
  onRecordingSessionChange(notify);
}
wire();

export function subscribeBusy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Why a restart would interrupt something, kept current. */
export function useBusyReasons(): BusyReason[] {
  const [reasons, setReasons] = useState<BusyReason[]>(busyReasons);
  useEffect(() => {
    const update = () =>
      setReasons((prev) => {
        const next = busyReasons();
        return prev.length === next.length && prev.every((r, i) => r === next[i]) ? prev : next;
      });
    update();
    return subscribeBusy(update);
  }, []);
  return reasons;
}

/** For tests. */
export function resetBusyForTests(): void {
  flags.clear();
}
