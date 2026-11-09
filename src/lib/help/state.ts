// Whether the help buttons are hidden (HELP-2): one switch for every screen, kept on the phone per
// account (`@revisely_help:v1:<uid>`), so it needs no account field and no rules deploy. "Hide help
// buttons" in a help sheet turns them off, with a toast and Undo on the screen it was hidden from
// (components/help/HelpToast); Settings → Support → Help buttons turns them back on.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { logger } from '../logger';
import type { HelpScreen } from './topics';

const key = (uid: string) => `@revisely_help:v1:${uid}`;

/** Per account: hidden or not, once read from the phone. */
const hidden = new Map<string, boolean>();
const loading = new Map<string, Promise<void>>();
/** The last hide, for the toast on the screen it came from. */
let toast: { screen: HelpScreen; id: number } | null = null;
let nextToast = 1;

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const emit = () => listeners.forEach((l) => l());

function load(uid: string): Promise<void> {
  if (hidden.has(uid)) return Promise.resolve();
  let p = loading.get(uid);
  if (!p) {
    p = AsyncStorage.getItem(key(uid))
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as { hidden?: unknown }) : null;
        if (!hidden.has(uid)) hidden.set(uid, saved?.hidden === true);
      })
      .catch((err) => {
        logger.warn('Could not read the help setting', err);
        if (!hidden.has(uid)) hidden.set(uid, false);
      })
      .finally(() => {
        loading.delete(uid);
        emit();
      });
    loading.set(uid, p);
  }
  return p;
}

/** Hidden (true), shown (false), or not read yet (undefined). */
export function useHelpHidden(uid: string | null | undefined): boolean | undefined {
  const value = useSyncExternalStore(subscribe, () => (uid ? hidden.get(uid) : undefined), () => undefined);
  useEffect(() => {
    if (uid) void load(uid);
  }, [uid]);
  return value;
}

/** Hide or show every help button for this account on this phone. */
export function setHelpHidden(uid: string, next: boolean): void {
  hidden.set(uid, next);
  emit();
  AsyncStorage.setItem(key(uid), JSON.stringify({ hidden: next })).catch((err) =>
    logger.warn('Could not save the help setting', err),
  );
}

/** "Hide help buttons" from a screen's sheet: hidden, and that screen says so with Undo. */
export function hideHelpFrom(uid: string, screen: HelpScreen): void {
  toast = { screen, id: nextToast++ };
  setHelpHidden(uid, true);
}

/** The toast to show on `screen`, if its last hide came from there. */
export function useHelpToast(screen: HelpScreen): { id: number } | null {
  const t = useSyncExternalStore(subscribe, () => toast, () => null);
  return t && t.screen === screen ? t : null;
}

export function clearHelpToast(): void {
  if (!toast) return;
  toast = null;
  emit();
}
