// Favorite translations (testers; TRANS-8): starred in the picker, listed under Selected in the
// order starred, reordered or removed in Edit. Kept on the phone for each account
// (@revisely_translation_favorites:v1:<uid>), not on the account: a synced field would need the user
// document's allowlist and a rules deploy first.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

const KEY = (uid: string) => `@revisely_translation_favorites:v1:${uid}`;

const cache = new Map<string, string[]>();
const loading = new Map<string, Promise<string[]>>();
const listeners = new Set<(uid: string) => void>();

/** The account's favorites, in the order starred (read once, then kept). */
export function loadFavorites(uid: string): Promise<string[]> {
  const known = cache.get(uid);
  if (known) return Promise.resolve(known);
  const pending = loading.get(uid);
  if (pending) return pending;
  const load = AsyncStorage.getItem(KEY(uid))
    .then((raw) => {
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      const ids = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
      // A change made while it was loading wins.
      if (!cache.has(uid)) cache.set(uid, ids);
      return cache.get(uid)!;
    })
    .catch((err) => {
      logger.warn('Could not read the favorite translations', err);
      if (!cache.has(uid)) cache.set(uid, []);
      return cache.get(uid)!;
    })
    .finally(() => loading.delete(uid));
  loading.set(uid, load);
  return load;
}

function save(uid: string, ids: string[]): void {
  cache.set(uid, ids);
  listeners.forEach((l) => l(uid));
  AsyncStorage.setItem(KEY(uid), JSON.stringify(ids)).catch((err) => logger.warn('Could not keep the favorite translations', err));
}

/** Stars a translation (it goes last), or takes its star away. After the stored list is read, never over it. */
export function toggleFavorite(uid: string, id: string): Promise<void> {
  return loadFavorites(uid).then((ids) => save(uid, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
}

/** Moves a favorite up (-1) or down (+1). */
export function moveFavorite(uid: string, id: string, by: -1 | 1): Promise<void> {
  return loadFavorites(uid).then((loaded) => {
    const ids = [...loaded];
    const at = ids.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    save(uid, ids);
  });
}

/** The account's favorites, kept up to date; [] until read, and with no account. */
export function useFavorites(uid: string | undefined): string[] {
  const [ids, setIds] = useState<string[]>(() => (uid ? (cache.get(uid) ?? []) : []));
  useEffect(() => {
    if (!uid) {
      setIds([]);
      return;
    }
    let live = true;
    loadFavorites(uid).then((loaded) => live && setIds(loaded));
    const listener = (changed: string) => {
      if (changed === uid) setIds(cache.get(uid) ?? []);
    };
    listeners.add(listener);
    return () => {
      live = false;
      listeners.delete(listener);
    };
  }, [uid]);
  return ids;
}

/** Test hook: what this launch read (the phone keeps its storage). */
export function __resetFavoritesForTests(): void {
  cache.clear();
  loading.clear();
  listeners.clear();
}
