// Sends the outbox to the server, oldest change first, one at a time, and
// crosses each off once the server has it. One run per account at a time
// (module-wide), only while that account is the one signed in.
//
// - Offline, a plain write waits inside Firestore's SDK until it can be sent; a
//   session (a transaction: it merges with what the server has) fails at once
//   and is tried again later. Either way nothing is lost: the change stays in
//   the outbox until the server confirms it, and a change sent twice (the app
//   closed between the server's answer and crossing it off) gives the same
//   result.
// - "Try again later" (offline, timeouts, the server busy) waits 2 s, 5 s,
//   15 s, 30 s, then a minute; the connection coming back or the app coming to
//   the front starts a run at once (connectivity.ts).
// - A change the server refuses (its rules) is dropped and reported, without
//   its contents; permission errors get a few tries first (App Check can refuse
//   the first requests after a launch).

import type { OutboxEntry } from './ops';
import { pendingEntries, removeEntry, markFailed, loadOutbox } from './outbox';
import { logger } from '../logger';

export interface SyncApi {
  currentUid: () => string | null;
  isDeleting: (uid: string) => boolean;
  apply: (uid: string, entry: OutboxEntry) => Promise<void>;
}

const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
const PERMISSION_TRIES = 5;

let api: SyncApi | null = null;
const running = new Map<string, Promise<void>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const transientStreak = new Map<string, number>();
const appliedListeners = new Set<(uid: string, entry: OutboxEntry) => void>();
const stateListeners = new Set<() => void>();

export function configureSync(next: SyncApi | null): void {
  api = next;
}

/** Hears each change the server has taken, before it leaves the outbox. */
export function onApplied(listener: (uid: string, entry: OutboxEntry) => void): () => void {
  appliedListeners.add(listener);
  return () => {
    appliedListeners.delete(listener);
  };
}

/** Hears a run starting or ending (for "syncing"). */
export function onSyncState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

export function isSyncing(uid: string | null | undefined): boolean {
  return !!uid && running.has(uid);
}

const TRANSIENT = new Set([
  'unavailable',
  'deadline-exceeded',
  'cancelled',
  'unknown',
  'internal',
  'resource-exhausted',
  'aborted',
  'unauthenticated',
]);

export type Failure = 'later' | 'permission' | 'refused';

/** What a failed write means: try again later, a permission error, or refused for good. */
export function classifyError(err: unknown): Failure {
  const raw = (err as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw.replace(/^firestore\//, '') : '';
  if (!code || TRANSIENT.has(code)) return 'later';
  if (code === 'permission-denied') return 'permission';
  return 'refused';
}

function scheduleRetry(uid: string) {
  if (retryTimers.has(uid)) return;
  const streak = transientStreak.get(uid) ?? 0;
  transientStreak.set(uid, streak + 1);
  const delay = BACKOFF_MS[Math.min(streak, BACKOFF_MS.length - 1)];
  retryTimers.set(
    uid,
    setTimeout(() => {
      retryTimers.delete(uid);
      requestFlush(uid);
    }, delay),
  );
}

async function run(uid: string): Promise<void> {
  await loadOutbox(uid);
  for (;;) {
    if (!api || api.currentUid() !== uid || api.isDeleting(uid)) return;
    const head = pendingEntries(uid)[0];
    if (!head) return;
    try {
      await api.apply(uid, head);
    } catch (err) {
      const kind = classifyError(err);
      if (kind === 'later') {
        scheduleRetry(uid);
        return;
      }
      const failures = await markFailed(uid, head.id);
      if (kind === 'permission' && failures < PERMISSION_TRIES) {
        scheduleRetry(uid);
        return;
      }
      logger.error('A change was refused by the server and dropped', err, {
        kind: head.op.kind,
        failures,
      });
      await removeEntry(uid, head.id);
      continue;
    }
    transientStreak.delete(uid);
    appliedListeners.forEach((l) => {
      try {
        l(uid, head);
      } catch (e) {
        logger.warn('Applied listener failed', e);
      }
    });
    await removeEntry(uid, head.id);
  }
}

/** Starts a run for the account unless one is going (it picks up new changes itself). */
export function requestFlush(uid: string | null | undefined): void {
  if (!uid || running.has(uid)) return;
  const timer = retryTimers.get(uid);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(uid);
  }
  const p = run(uid)
    .catch((err) => logger.warn('Sync run failed', err))
    .finally(() => {
      running.delete(uid);
      stateListeners.forEach((l) => l());
      // A change added after the last check, while finishing.
      const left = pendingEntries(uid);
      if (left.length > 0 && api?.currentUid() === uid && !retryTimers.has(uid) && !api.isDeleting(uid)) {
        requestFlush(uid);
      }
    });
  running.set(uid, p);
  stateListeners.forEach((l) => l());
}

/** Tests: wait for the account's run to end. */
export async function settleSync(uid: string): Promise<void> {
  while (running.has(uid)) await running.get(uid);
}

/** Tests: forget runs and timers. */
export function resetSyncForTests(): void {
  retryTimers.forEach(clearTimeout);
  retryTimers.clear();
  running.clear();
  transientStreak.clear();
  appliedListeners.clear();
  stateListeners.clear();
  api = null;
}
