// When the user's Firestore document seems to be missing, whether to recreate it.
//
// "Missing" from the local cache (a fresh install, or offline) only means the
// server hasn't answered yet, and sign-up creates the document too. Recreating in
// either case overwrote an existing document, which the rules refuse (Sentry
// REACT-NATIVE-6, "Failed to recreate missing user doc"). So: wait for the
// server, check it really is missing, and treat losing a race to sign-up as fine.

export type RecreateOutcome =
  /** Not decided yet (the cache answered); wait for the server's answer. */
  | 'wait'
  /** It exists after all (sign-up made it); the subscription brings it. */
  | 'exists'
  | 'created'
  | 'failed';

export async function recreateUserDocIfMissing(opts: {
  fromCache: boolean;
  existsOnServer: () => Promise<boolean>;
  create: () => Promise<unknown>;
  onLostRace?: (err: unknown) => void;
  onError?: (err: unknown) => void;
}): Promise<RecreateOutcome> {
  if (opts.fromCache) return 'wait';
  try {
    if (await opts.existsOnServer()) return 'exists';
    await opts.create();
    return 'created';
  } catch (err) {
    const exists = await opts.existsOnServer().catch(() => false);
    if (exists) {
      opts.onLostRace?.(err);
      return 'exists';
    }
    opts.onError?.(err);
    return 'failed';
  }
}
