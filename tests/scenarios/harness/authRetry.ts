/**
 * The Auth emulator, under a busy CI runner, sometimes drops a request: the
 * client then fails with auth/network-request-failed though nothing is wrong
 * with the account or the app (seen in RESET-3, Nov 2026). Sign-up, sign-in and
 * the calls that fetch a fresh ID token first (callFunction's getIdToken(true):
 * Reset my data, Load test scenario) are tried again, a few times, after a
 * short wait; a token that failed to come means nothing reached the server. A sign-up whose answer was
 * lost may have made the account: trying it again then fails with
 * auth/email-already-in-use, and the account is signed in to instead.
 */
const TRIES = 4;

function code(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

export async function withAuthRetry<T>(
  attempt: () => Promise<T>,
  opts: { ifCreated?: () => Promise<T> } = {},
): Promise<T> {
  let lostOne = false;
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (lostOne && code(err) === 'auth/email-already-in-use' && opts.ifCreated) return opts.ifCreated();
      if (code(err) !== 'auth/network-request-failed' || i >= TRIES) throw err;
      lostOne = true;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}
