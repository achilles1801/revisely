// AUTH-1: keeps the phone's saved sign-in when Google can't check it at launch.
//
// - What Firebase does: at every start, Firebase Auth checks the saved sign-in with Google
//   (`reloadAndSetCurrentUserOrClear` in @firebase/auth: a token refresh if the ID token is old, then
//   `accounts:lookup`). On any error but a network one it deletes the saved sign-in. So a passing outage
//   or rate limit at Google, at the moment the app starts, signs the person out for good, with no reason
//   given.
// - What this changes: while that first check runs, an answer that says Google couldn't answer (5xx, 429,
//   or a quota or internal-error code) reaches Auth as a network failure. Auth already treats a network
//   failure as "can't check now": it keeps the sign-in and checks again at the next start.
// - What stays as before: every other answer, a revoked, disabled or deleted account above all, and
//   every request after the first check.
// - Why not a patch: it goes in through Auth's own fetch (FetchProvider, from @firebase/auth/internal,
//   the same module instance as firebase/auth's in React Native). A patch-package patch would count
//   toward the store app's fingerprint (patches/ is one of its sources), and this is JavaScript only.
import { logger } from './logger';

type Fetch = typeof fetch;

/** Error codes in Google's answer that say it couldn't answer, rather than anything about the sign-in. */
const COULD_NOT_ANSWER = new Set([
  'INTERNAL_ERROR',
  'TOO_MANY_ATTEMPTS_TRY_LATER',
  'QUOTA_EXCEEDED',
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
]);

/** The requests of Auth's launch check: the token refresh and the account lookup (Google's or the emulator's). */
export function isLaunchCheckRequest(url: string): boolean {
  return /securetoken\.googleapis\.com\/v1\/token|\/v1\/accounts:lookup/.test(url);
}

/** Google's error code in an Auth error answer ("TOKEN_EXPIRED", "INTERNAL_ERROR : …"), or null. */
async function errorCodeOf(response: Response): Promise<string | null> {
  try {
    const json = (await response.clone().json()) as { error?: { message?: unknown } } | null;
    const message = json?.error?.message;
    return typeof message === 'string' ? message.split(' : ')[0] : null;
  } catch {
    return null;
  }
}

/** Whether an error answer means Google couldn't check the sign-in just now. */
export async function couldNotAnswer(response: Response): Promise<boolean> {
  if (response.status >= 500 || response.status === 429) return true;
  const code = await errorCodeOf(response);
  return code != null && COULD_NOT_ANSWER.has(code);
}

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as { url?: string }).url ?? String(input);
}

/**
 * Auth's fetch: `base()` (the global fetch, read at each call), except that during the launch check an
 * answer from Google that it couldn't answer becomes a network failure.
 */
export function launchCheckFetch(base: () => Fetch, launching: () => boolean): Fetch {
  return (async (input: Parameters<Fetch>[0], init?: Parameters<Fetch>[1]) => {
    const response = await base()(input, init);
    if (response.ok || !launching() || !isLaunchCheckRequest(urlOf(input))) return response;
    if (!(await couldNotAnswer(response))) return response;
    const code = await errorCodeOf(response);
    logger.warn('Kept the saved sign-in: Google could not check it at launch', response.status, code ?? '');
    throw new TypeError(`Google could not check the saved sign-in (${response.status}${code ? ` ${code}` : ''})`);
  }) as Fetch;
}

let launching = true;

/**
 * Puts the launch check's fetch in place. Call it before initializeAuth: the check starts as soon as Auth
 * has read the saved sign-in, and the window closes once Auth has settled on the user (authStateReady).
 */
export function keepSignInWhenUnchecked(authStateReady: () => Promise<void>): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FetchProvider } = require('@firebase/auth/internal') as {
    FetchProvider: { initialize(fetchImpl: Fetch): void };
  };
  launching = true;
  FetchProvider.initialize(launchCheckFetch(() => globalThis.fetch, () => launching));
  const done = () => {
    launching = false;
  };
  // Microtask: Auth's instance exists only once initializeAuth has returned.
  Promise.resolve()
    .then(authStateReady)
    .then(done, done);
}
