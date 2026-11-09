// The outbox: an account's changes that the server hasn't confirmed yet, kept
// on the phone (AsyncStorage, one key per account) so they survive the app
// closing, a restart, or a sign-in that lapsed offline. Changes are applied in
// order by sync.ts and crossed off one by one once the server has them.
//
// Each account's queue is loaded once; every change to it is written back
// through a per-account chain so writes never overlap. Listeners hear about
// every change (the app overlays pending changes on what it shows).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode, encode } from './codec';
import type { OutboxEntry, OutboxOp } from './ops';
import { logger } from '../logger';

const KEY_PREFIX = '@revisely_outbox:v1:';
const keyFor = (uid: string) => `${KEY_PREFIX}${uid}`;

const queues = new Map<string, OutboxEntry[]>();
// Accounts whose stored queue has been read (only those are written back).
const loaded = new Set<string>();
const loads = new Map<string, Promise<OutboxEntry[]>>();
const writes = new Map<string, Promise<void>>();
const listeners = new Set<(uid: string) => void>();
let counter = 0;

function notify(uid: string) {
  listeners.forEach((l) => {
    try {
      l(uid);
    } catch (err) {
      logger.warn('Outbox listener failed', err);
    }
  });
}

function persist(uid: string): Promise<void> {
  if (!loaded.has(uid)) return Promise.resolve();
  const prev = writes.get(uid) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const entries = queues.get(uid) ?? [];
      if (entries.length === 0) await AsyncStorage.removeItem(keyFor(uid));
      else await AsyncStorage.setItem(keyFor(uid), encode(entries));
    });
  writes.set(uid, next);
  return next.catch((err) => {
    // Kept in memory; the next change writes the whole queue again.
    logger.warn('Could not save the outbox', err);
  });
}

/** The account's queue, read from the phone the first time. */
export function loadOutbox(uid: string): Promise<OutboxEntry[]> {
  if (loaded.has(uid)) return Promise.resolve(queues.get(uid) ?? []);
  let load = loads.get(uid);
  if (!load) {
    // A read that fails leaves the queue unloaded (and unwritten: persisting
    // would put an empty queue over the stored one); the next call reads again.
    load = AsyncStorage.getItem(keyFor(uid)).then(
      async (raw) => {
        let stored = decode<OutboxEntry[]>(raw);
        if (raw && !Array.isArray(stored)) {
          // Damaged: kept aside (never overwritten), and reported without its contents.
          logger.error('The outbox could not be read; kept aside', undefined, { bytes: raw.length });
          await AsyncStorage.setItem(`@revisely_outbox_damaged:v1:${uid}:${Date.now()}`, raw).catch(() => undefined);
          stored = [];
        }
        const valid = (stored ?? []).filter((e) => e && e.id && e.op);
        // Changes made while it loaded are already in the map: keep both.
        const during = queues.get(uid) ?? [];
        const merged = [...valid, ...during.filter((e) => !valid.some((s) => s.id === e.id))];
        queues.set(uid, merged);
        loaded.add(uid);
        loads.delete(uid);
        notify(uid);
        return merged;
      },
      (err) => {
        loads.delete(uid);
        throw err;
      },
    );
    loads.set(uid, load);
  }
  return load;
}

/** What is waiting (empty until loaded). */
export function pendingEntries(uid: string | null | undefined): OutboxEntry[] {
  return uid ? (queues.get(uid) ?? []) : [];
}

export function isOutboxLoaded(uid: string): boolean {
  return loaded.has(uid);
}

function newId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Adds a change; resolves once it is saved on the phone. */
export async function enqueue(uid: string, op: OutboxOp, at = Date.now()): Promise<OutboxEntry> {
  await loadOutbox(uid);
  const entry: OutboxEntry = { id: newId(), op, at };
  queues.set(uid, [...(queues.get(uid) ?? []), entry]);
  notify(uid);
  await persist(uid);
  return entry;
}

/** Crosses off a change the server has (or one it refused for good). */
export async function removeEntry(uid: string, entryId: string): Promise<void> {
  const entries = queues.get(uid);
  if (!entries || !entries.some((e) => e.id === entryId)) return;
  queues.set(
    uid,
    entries.filter((e) => e.id !== entryId),
  );
  notify(uid);
  await persist(uid);
}

/** Drops several changes at once (the account was reset on the server, lib/offline/reset). */
export async function removeEntries(uid: string, entryIds: string[]): Promise<void> {
  const drop = new Set(entryIds);
  const entries = queues.get(uid);
  if (!entries || !entries.some((e) => drop.has(e.id))) return;
  queues.set(
    uid,
    entries.filter((e) => !drop.has(e.id)),
  );
  notify(uid);
  await persist(uid);
}

export async function markFailed(uid: string, entryId: string): Promise<number> {
  const entries = queues.get(uid) ?? [];
  let failures = 0;
  queues.set(
    uid,
    entries.map((e) => {
      if (e.id !== entryId) return e;
      failures = (e.failures ?? 0) + 1;
      return { ...e, failures };
    }),
  );
  await persist(uid);
  return failures;
}

/** Forgets the account's queue (its deletion). */
export async function clearOutbox(uid: string): Promise<void> {
  await loadOutbox(uid).catch(() => undefined);
  queues.set(uid, []);
  notify(uid);
  await persist(uid);
}

export function subscribeOutbox(listener: (uid: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests: forget everything held in memory. */
export function resetOutboxForTests(): void {
  queues.clear();
  loaded.clear();
  loads.clear();
  writes.clear();
  listeners.clear();
}
