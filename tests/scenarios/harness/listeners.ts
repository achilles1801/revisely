// The Firestore listeners the app has open, by path. Wrapped around the SDK's
// onSnapshot when a launch begins (`phone.open(trackingListeners(...))`), before the
// providers subscribe, so every listener the app opens on that launch is seen.
import type { ReactElement } from 'react';
import type { Booted } from './phone';

export interface ListenerTracker {
  /** The open listeners' paths, sorted: documents and collections, a query by its collection. */
  open(): string[];
  /** Those on the account `uid`: its user document and anything under it. */
  onAccount(uid: string): string[];
}

function pathOf(target: unknown): string {
  const t = target as { path?: unknown; _query?: { path?: { canonicalString?: () => string } } };
  if (typeof t.path === 'string') return t.path;
  const p = t._query?.path;
  if (p?.canonicalString) return p.canonicalString();
  throw new Error('a listener on something with no path');
}

export function trackListeners(mods: Booted): ListenerTracker {
  const fs = mods.require<Record<string, (...args: unknown[]) => () => void>>('firebase/firestore');
  const real = fs.onSnapshot;
  const live: { path: string }[] = [];
  jest.spyOn(fs, 'onSnapshot').mockImplementation((target: unknown, ...rest: unknown[]) => {
    const entry = { path: pathOf(target) };
    const off = real(target, ...rest);
    live.push(entry);
    return () => {
      const i = live.indexOf(entry);
      if (i >= 0) live.splice(i, 1);
      off();
    };
  });
  const open = () => live.map((e) => e.path).sort();
  return {
    open,
    onAccount: (uid) => open().filter((p) => p === `users/${uid}` || p.startsWith(`users/${uid}/`)),
  };
}

/** A `screen` for phone.open that only starts tracking: `phone.open(trackingListeners((t) => (tracker = t)))`. */
export function trackingListeners(keep: (tracker: ListenerTracker) => void): (mods: Booted) => ReactElement | null {
  return (mods) => {
    keep(trackListeners(mods));
    return null;
  };
}
