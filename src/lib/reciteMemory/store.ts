// Recite's memory on this phone: the account's records, shown at once and kept for offline (AsyncStorage, one key
// per account), with the account's copy on the server (remote.ts) read when a screen showing it opens, and every
// change sent through the outbox. Two copies of one record meet by `rev` (record.ts), so the order things arrive in
// doesn't matter. An account reset (`dataResetAt`, lib/offline/reset) drops what this phone held.
//
// AsyncStorage holds about 1 KB a take; a few thousand takes would want a file of their own (expo-file-system).

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../logger';
import { enqueue } from '../offline/outbox';
import { requestFlush } from '../offline/sync';
import { adoptedResetMark, onResetAdopted } from '../offline/reset';
import { MemoryRecord, newer } from './record';
import { pullMemoryRecords } from './remote';

const KEY_PREFIX = '@revisely_recite_memory:v1:';
const keyFor = (uid: string) => `${KEY_PREFIX}${uid}`;
/** A pull at most this often (each screen that shows the memory reads the account when it opens). */
const PULL_EVERY_MS = 10 * 60_000;

interface Held {
  records: Record<string, MemoryRecord>;
  /** The server's time of the newest record read from it (ms). */
  pulledAt: number;
  /** The account's reset mark the records are from (null: never reset). */
  resetMark: number | null;
}

const held = new Map<string, Held>();
const loads = new Map<string, Promise<Held>>();
const writes = new Map<string, Promise<void>>();
const pulls = new Map<string, Promise<void>>();
const lastPull = new Map<string, number>();
const listeners = new Set<(uid: string) => void>();
/** Each account's records as an array, rebuilt only when they change (the hook hands out the same array). */
const arrays = new Map<string, MemoryRecord[]>();

const EMPTY: Held = { records: {}, pulledAt: 0, resetMark: null };

function notify(uid: string) {
  arrays.delete(uid);
  listeners.forEach((l) => {
    try {
      l(uid);
    } catch (err) {
      logger.warn('Recite memory listener failed', err);
    }
  });
}

function parse(raw: string | null): Held {
  if (!raw) return { ...EMPTY, records: {} };
  try {
    const p = JSON.parse(raw) as Partial<Held>;
    return {
      records: p.records && typeof p.records === 'object' ? p.records : {},
      pulledAt: typeof p.pulledAt === 'number' ? p.pulledAt : 0,
      resetMark: typeof p.resetMark === 'number' ? p.resetMark : null,
    };
  } catch {
    return { ...EMPTY, records: {} };
  }
}

/** The account's records, read from the phone the first time. */
export function loadMemory(uid: string): Promise<Held> {
  const h = held.get(uid);
  if (h) return Promise.resolve(h);
  let load = loads.get(uid);
  if (!load) {
    load = AsyncStorage.getItem(keyFor(uid))
      .then(parse)
      .catch((err) => {
        logger.warn('Could not read Recite memory', err);
        return { ...EMPTY, records: {} };
      })
      .then((read) => {
        // Something remembered while it was reading wins over what was stored.
        const now = held.get(uid);
        const merged = now ? { ...read, records: mergeInto(read.records, Object.values(now.records)) } : read;
        held.set(uid, merged);
        loads.delete(uid);
        notify(uid);
        return merged;
      });
    loads.set(uid, load);
  }
  return load;
}

function mergeInto(into: Record<string, MemoryRecord>, records: MemoryRecord[]): Record<string, MemoryRecord> {
  const out = { ...into };
  for (const r of records) out[r.id] = newer(out[r.id], r);
  return out;
}

function persist(uid: string): Promise<void> {
  const prev = writes.get(uid) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const h = held.get(uid);
      if (h) await AsyncStorage.setItem(keyFor(uid), JSON.stringify(h));
    });
  writes.set(uid, next);
  return next.catch((err) => logger.warn('Could not save Recite memory', err));
}

/** The account's records now (forgotten ones included: they're tombstones); the same array until they change. */
export function memoryRecords(uid: string): MemoryRecord[] {
  let a = arrays.get(uid);
  if (!a) {
    a = Object.values(held.get(uid)?.records ?? {});
    arrays.set(uid, a);
  }
  return a;
}

/** Hears every change to an account's records. */
export function onMemoryChange(listener: (uid: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Keeps a record (new, or a newer version of one) on this phone and sends it to the account. */
export async function remember(uid: string, record: MemoryRecord): Promise<void> {
  await loadMemory(uid);
  const h = held.get(uid) ?? { ...EMPTY, records: {} };
  held.set(uid, { ...h, records: mergeInto(h.records, [record]) });
  notify(uid);
  await persist(uid);
  await enqueue(uid, { kind: 'reciteMemory.put', record });
  requestFlush(uid);
}

/**
 * The account was reset on the server since what this phone holds (`mark`, the user document's `dataResetAt`): what
 * it held goes, and the next pull reads everything again.
 */
export async function adoptResetMark(uid: string, mark: number | null): Promise<void> {
  const h = await loadMemory(uid);
  if (mark == null || h.resetMark === mark) return;
  held.set(uid, { records: {}, pulledAt: 0, resetMark: mark });
  lastPull.delete(uid);
  notify(uid);
  await persist(uid);
}

/** Reads what the account's copy has that this phone hasn't seen (at most every 10 minutes, unless `force`). */
export function pullMemory(uid: string, force = false): Promise<void> {
  const going = pulls.get(uid);
  if (going) return going;
  const last = lastPull.get(uid);
  if (!force && last != null && Date.now() - last < PULL_EVERY_MS) return Promise.resolve();
  const p = (async () => {
    const h = await loadMemory(uid);
    const { records, newest } = await pullMemoryRecords(uid, h.pulledAt);
    lastPull.set(uid, Date.now());
    const now = held.get(uid) ?? h;
    // A reset since the read began: what it read is from before.
    if (now.resetMark !== h.resetMark) return;
    held.set(uid, { ...now, records: mergeInto(now.records, records), pulledAt: Math.max(now.pulledAt, newest) });
    if (records.length > 0) notify(uid);
    await persist(uid);
  })()
    .catch((err) => logger.warn('Could not read Recite memory from the account', err))
    .finally(() => pulls.delete(uid));
  pulls.set(uid, p);
  return p;
}

/**
 * The account's records, kept current: read from the phone, then from the account when a screen showing them opens
 * (at most every 10 minutes). Off (`enabled` false, or no account): none.
 */
export function useMemoryRecords(uid: string | null | undefined, enabled: boolean): MemoryRecord[] {
  const on = enabled && !!uid;
  const [records, setRecords] = useState<MemoryRecord[]>(() => (on && uid ? memoryRecords(uid) : NONE));
  useEffect(() => {
    if (!on || !uid) {
      setRecords(NONE);
      return;
    }
    let alive = true;
    const update = () => {
      if (alive) setRecords(memoryRecords(uid));
    };
    const off = onMemoryChange((changed) => {
      if (changed === uid) update();
    });
    // Once AppProvider knows the account's reset mark: what was held from before a reset goes, then the account is read.
    const adopt = () => {
      const mark = adoptedResetMark(uid);
      if (mark === undefined) return false;
      void adoptResetMark(uid, mark).then(() => pullMemory(uid));
      return true;
    };
    const offReset = onResetAdopted(adopt);
    if (!adopt()) void loadMemory(uid);
    update();
    return () => {
      alive = false;
      off();
      offReset();
    };
  }, [on, uid]);
  return records;
}

const NONE: MemoryRecord[] = [];

/** Tests: forget everything held in memory. */
export function resetMemoryForTests(): void {
  held.clear();
  loads.clear();
  writes.clear();
  pulls.clear();
  lastPull.clear();
  listeners.clear();
  arrays.clear();
}
