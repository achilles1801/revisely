// Sign-in, direction B (Majd's pick, Nov 27 2026; board ~/Documents/revisely-auth-mocks/v2/png/B1–B6): a welcome with
// the app's line and Continue with Apple, Google or email, then the email page and a Forgot password sheet (AUTH-3–5).
// Built in Revisely Dev only; the store app keeps screens/auth/AuthScreen.
//
// One switch, so it can reach App Store users on its own: turning it on is this one line (SIGN_IN_B_RELEASED = true),
// with AUTH-3–5 losing "(Revisely Dev)" and the E2E sign-up flow moving to B's screens.

import { isDevVariant } from '../variant';

export const SIGN_IN_B_RELEASED = false;

let forTests: boolean | undefined;

/** For tests: run as if the switch were on (or off); undefined: as the switch and the app say. */
export function setSignInBForTests(on: boolean | undefined): void {
  forTests = on;
}

/** Everyone's once released, Revisely Dev's until then. */
export function signInBEnabled(): boolean {
  if (forTests !== undefined) return forTests;
  // Under Jest only where a test turns it on, so the tests of today's sign-in screen keep testing it.
  if (process.env.NODE_ENV === 'test') return SIGN_IN_B_RELEASED;
  // E2E builds keep today's screen (the sign-up flow types into it), until B has its own flow and baselines.
  if (process.env.EXPO_PUBLIC_E2E === '1') return false;
  return SIGN_IN_B_RELEASED || isDevVariant();
}
