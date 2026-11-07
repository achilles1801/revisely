// Our Cloud Functions in an E2E build (E2E builds only, .maestro/README.md): the real functions in
// the functions emulator on this computer (scripts/emulators.sh … functions), called as a phone
// calls them in production (services/firestoreService callFunction), with two edges stood in:
// - App Check: a simulator can't attest the app (App Attest, Play Integrity), so the build hands
//   the emulator an unsigned token in App Check's shape, which it accepts (it decodes tokens instead
//   of verifying them); our callables still refuse a call without one.
// - The clock: the request carries the E2E clock (X-Revisely-Test-Now), which the emulator's
//   functions follow (functions/src/emulator.ts), as a phone's and the server's clocks agree.
// Only Anthropic answers from a recording, inside the functions.

import { E2E_PROJECT_ID, e2eHost, EMULATOR_PORTS } from './config';

const b64url = (s: string) => {
  const b = globalThis.btoa(s);
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** An unsigned token in App Check's shape (`sub` is the app); only the emulator accepts it. */
export const E2E_APP_CHECK_TOKEN = `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64url(
  JSON.stringify({ sub: '1:123456789012:ios:e2e', aud: [`projects/${E2E_PROJECT_ID}`] }),
)}.`;

/** Where a callable is, and the headers the emulator needs besides the app's own. */
export function e2eFunction(name: string): { url: string; headers: Record<string, string> } {
  return {
    url: `http://${e2eHost()}:${EMULATOR_PORTS.functions}/${E2E_PROJECT_ID}/us-central1/${name}`,
    headers: { 'X-Revisely-Test-Now': String(Date.now()) },
  };
}
