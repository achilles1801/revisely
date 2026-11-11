// E2E builds only: whether the app still holds changes it hasn't sent, for the E2E status line's
// accessibility label (E2ERoot). Flows wait for "nothing to send" before a script writes the server
// as its admin (.maestro/subflows/app-sent.yaml): a change the app still held went out after the
// script's writes and over them (seed-activity on iOS, run 42414536111).

import { pendingEntries, subscribeOutbox } from '../offline/outbox';

// Every account whose outbox this run of the app has touched (a change made, its stored queue
// read, one sent or dropped). Subscribed when this module loads, before the app's first change.
const accounts = new Set<string>();
const listeners = new Set<() => void>();
subscribeOutbox((uid) => {
  accounts.add(uid);
  listeners.forEach((l) => l());
});

/**
 * " · 3 to send" while the app holds changes it hasn't sent (lib/offline/outbox: a change leaves
 * it once the server has it), " · nothing to send" otherwise.
 */
export function outboxText(): string {
  let count = 0;
  for (const uid of accounts) count += pendingEntries(uid).length;
  return count > 0 ? ` · ${count} to send` : ' · nothing to send';
}

/** Calls `listener` whenever an outbox changes. */
export function onOutboxChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
