// An account reset on the server (functions/scripts/reset-account.js) sets
// `dataResetAt` on the user document. What a phone holds for the account from
// before then belongs to data that no longer exists: its outbox would put old
// progress back, and changes built on its copy would be measured against old
// values (only fields that differ from what's shown are sent). So once the
// server's mark is known, the phone drops both (AppProvider), and the outbox
// sends nothing until it is known (sync's `beforeSend`).

import type { OutboxEntry } from './ops';
import { millisOf } from './codec';

// The mark each account's data on this phone is now built on, once AppProvider
// has checked it against the server's (and dropped what was from before).
const adopted = new Map<string, number | null>();
const adoptWaiters = new Set<() => void>();

/** AppProvider: the phone's data for `uid` is now built on the server's mark `mark`. */
export function noteResetAdopted(uid: string, mark: number | null): void {
  adopted.set(uid, mark);
  adoptWaiters.forEach((w) => w());
}

/**
 * Resolves once the phone has taken in a reset with mark `mark` (or a later one):
 * a change queued after that is built on the new data, so it isn't dropped as
 * stale. Rejects after `timeoutMs`.
 */
export function whenResetAdopted(uid: string, mark: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const now = adopted.get(uid);
      if (now != null && now >= mark) {
        done();
        resolve();
      }
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('This phone didn’t get the new account in time. Close the app, open it, and load the scenario again.'));
    }, timeoutMs);
    const done = () => {
      clearTimeout(timer);
      adoptWaiters.delete(check);
    };
    adoptWaiters.add(check);
    check();
  });
}

/** Tests. */
export function resetAdoptedForTests(): void {
  adopted.clear();
  adoptWaiters.clear();
}

/** The account's reset mark (ms), or null if it was never reset. */
export function resetMark(user: { dataResetAt?: unknown } | null | undefined): number | null {
  return millisOf(user?.dataResetAt);
}

/**
 * Whether the server's account was reset since what the phone's data is built
 * on: `basis` is the mark of the copy (or of the last server snapshot this run),
 * undefined when the phone had neither.
 */
export function wasReset(basis: number | null | undefined, server: number | null): boolean {
  return server !== null && basis !== server;
}

/**
 * The changes to drop: every one built on a copy from before the reset; with
 * no copy (signed out since), the ones made before it.
 */
export function staleEntries(
  entries: OutboxEntry[],
  basis: number | null | undefined,
  server: number | null,
): OutboxEntry[] {
  if (!wasReset(basis, server)) return [];
  if (basis === undefined) return entries.filter((e) => e.at < (server as number));
  return entries;
}
