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
//   its contents. The rules refuse with "permission denied", which is also
//   what a missing App Check token or a sign-in that's out of date look like:
//   such a change is dropped only once a server read has worked (`probe`), and
//   after a few tries; until then it waits.
// - An error that isn't Firestore's (no code: a bug, e.g. data the merge can't
//   handle) gets a few tries, then is reported and dropped, so it can't hold
//   up the changes behind it for good.

import type { OutboxEntry } from './ops';
import { pendingEntries, removeEntry, markFailed, loadOutbox } from './outbox';
import { logger } from '../logger';

export interface SyncApi {
  currentUid: () => string | null;
  isDeleting: (uid: string) => boolean;
  apply: (uid: string, entry: OutboxEntry) => Promise<void>;
  /** Whether a server read works now (Auth and App Check are fine). */
  probe?: (uid: string) => Promise<boolean>;
  /**
   * Runs before a run sends anything (the account's reset check, lib/offline/reset;
   * it may drop changes). Throwing means "not now": the run is tried again later.
   */
  beforeSend?: (uid: string) => Promise<void>;
}

const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
/** Refusals (with the server otherwise working) before a change is dropped. */
const PERMISSION_TRIES = 3;
/** Failures that aren't Firestore's before a change is dropped. */
const BUG_TRIES = 5;

let api: SyncApi | null = null;
const running = new Map<string, Promise<void>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const transientStreak = new Map<string, number>();
const appliedListeners = new Set<(uid: string, entry: OutboxEntry) => void | Promise<void>>();
const stateListeners = new Set<() => void>();

export function configureSync(next: SyncApi | null): void {
  api = next;
}

/** Hears each change the server has taken; it leaves the outbox once every listener is done. */
export function onApplied(listener: (uid: string, entry: OutboxEntry) => void | Promise<void>): () => void {
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

export type Failure = 'later' | 'permission' | 'refused' | 'bug';

/**
 * What a failed write means: try again later, a permission error, refused
 * for good, or not Firestore's at all (a bug).
 */
export function classifyError(err: unknown): Failure {
  const raw = (err as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw.replace(/^firestore\//, '') : '';
  if (!code) {
    const message = String((err as { message?: unknown } | null)?.message ?? err);
    return /network|offline|timed? ?out|unavailable/i.test(message) ? 'later' : 'bug';
  }
  if (TRANSIENT.has(code)) return 'later';
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
  if (pendingEntries(uid).length === 0) return;
  if (api?.beforeSend) {
    try {
      await api.beforeSend(uid);
    } catch (err) {
      // Offline, or the server can't be read yet: nothing is sent until it can.
      logger.log('[sync] not sending yet: the server can’t be read', err);
      scheduleRetry(uid);
      return;
    }
  }
  for (;;) {
    if (!api || api.currentUid() !== uid || api.isDeleting(uid) || held.has(uid)) return;
    const head = pendingEntries(uid)[0];
    if (!head) return;
    try {
      await api.apply(uid, head);
    } catch (err) {
      const kind = classifyError(err);
      if (kind === 'later') {
        logger.log(`[sync] ${head.op.kind} waits: ${(err as { code?: string } | null)?.code ?? 'no code'}`);
        scheduleRetry(uid);
        return;
      }
      if (kind === 'permission') {
        // Refused, or Auth / App Check not working yet? Only a refusal counts.
        const serverWorks = api.probe ? await api.probe(uid).catch(() => false) : true;
        if (!serverWorks) {
          scheduleRetry(uid);
          return;
        }
      }
      const failures = await markFailed(uid, head.id);
      const tries = kind === 'permission' ? PERMISSION_TRIES : kind === 'bug' ? BUG_TRIES : 1;
      if (failures < tries) {
        scheduleRetry(uid);
        return;
      }
      logger.error('A change was refused by the server and dropped', err, {
        kind: head.op.kind,
        failure: kind,
        failures,
      });
      await removeEntry(uid, head.id);
      continue;
    }
    transientStreak.delete(uid);
    logger.log(`[sync] ${head.op.kind} sent`);
    await Promise.all(
      [...appliedListeners].map((l) =>
        Promise.resolve()
          .then(() => l(uid, head))
          .catch((e) => logger.warn('Applied listener failed', e)),
      ),
    );
    await removeEntry(uid, head.id);
  }
}

// Testers (Load test scenario → Offline queue, lib/testScenarios): the account's
// changes wait on this phone until released, or until the app is next started
// (this lives only in memory), so syncing a queue can be tried by hand.
const held = new Set<string>();

/** Holds the account's changes on this phone (testers). */
export function holdSync(uid: string): void {
  held.add(uid);
  stateListeners.forEach((l) => l());
}

/** Lets held changes go, now. */
export function releaseSync(uid: string): void {
  if (!held.delete(uid)) return;
  stateListeners.forEach((l) => l());
  requestFlush(uid);
}

export function isSyncHeld(uid: string | null | undefined): boolean {
  return !!uid && held.has(uid);
}

/** Starts a run for the account unless one is going (it picks up new changes itself). */
export function requestFlush(uid: string | null | undefined): void {
  if (!uid || running.has(uid) || held.has(uid)) return;
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
  held.clear();
  transientStreak.clear();
  appliedListeners.clear();
  stateListeners.clear();
  api = null;
}
