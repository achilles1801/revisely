// When the user's Firestore data (the user document, the 604 page documents)
// seems to be missing, whether to create it.
//
// A listener's "missing" can come from the local cache: offline, Firestore
// fires the cached state (nothing) before the server has said anything. Creating
// then wrote defaults over a real account when the device came back online:
// "Failed to recreate missing user doc" (Sentry REACT-NATIVE-6) for the user
// document, and lost progress for the pages. Sign-up creates the document too,
// and account deletion empties it while the listeners still run. So: never act
// on the cache, ask the server, create only when it confirms nothing is there,
// and never while the account is being deleted.

export type EnsureOutcome =
  /** Not decided: only the cache answered, or the server couldn't be reached. Ask again later. */
  | 'wait'
  /** It is on the server after all (sign-up made it); the listener brings it. */
  | 'exists'
  | 'created'
  /** The account is being deleted: nothing is created. */
  | 'skipped'
  | 'failed';

export async function ensureOnServer(opts: {
  fromCache: boolean;
  existsOnServer: () => Promise<boolean>;
  create: () => Promise<unknown>;
  skip?: () => boolean;
  onLostRace?: (err: unknown) => void;
  onError?: (err: unknown) => void;
}): Promise<EnsureOutcome> {
  if (opts.skip?.()) return 'skipped';
  if (opts.fromCache) return 'wait';
  let exists: boolean;
  try {
    exists = await opts.existsOnServer();
  } catch (err) {
    // Offline or the server didn't answer: can't tell yet. Anything else
    // (permissions, App Check) is a real failure.
    if (isOffline(err)) return 'wait';
    opts.onError?.(err);
    return 'failed';
  }
  if (exists) return 'exists';
  if (opts.skip?.()) return 'skipped';
  try {
    await opts.create();
    return 'created';
  } catch (err) {
    const after = await opts.existsOnServer().catch(() => false);
    if (after) {
      opts.onLostRace?.(err);
      return 'exists';
    }
    opts.onError?.(err);
    return 'failed';
  }
}

/** Firestore's "couldn't reach the server" (code `unavailable`, or the offline message). */
export function isOffline(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return e?.code === 'unavailable' || /offline|unavailable|network/i.test(String(e?.message ?? ''));
}

/** Delay before asking the server again after a 'wait' (5 s, 15 s, 30 s, then every minute). */
export function retryDelayMs(attempt: number): number {
  return [5_000, 15_000, 30_000][attempt] ?? 60_000;
}
