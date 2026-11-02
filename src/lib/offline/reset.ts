// An account reset on the server (functions/scripts/reset-account.js) sets
// `dataResetAt` on the user document. What a phone holds for the account from
// before then belongs to data that no longer exists: its outbox would put old
// progress back, and changes built on its copy would be measured against old
// values (only fields that differ from what's shown are sent). So once the
// server's mark is known, the phone drops both (AppProvider), and the outbox
// sends nothing until it is known (sync's `beforeSend`).

import type { OutboxEntry } from './ops';
import { millisOf } from './codec';

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
