// What the owner does to an account from a laptop, against the emulators.
import path from 'path';

function emulatorEnv() {
  return {
    ...process.env,
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099',
    GCLOUD_PROJECT: 'demo-revisely',
  };
}

function testerReset(args: string[]): Record<string, unknown> {
  const { execFileSync } = jest.requireActual<typeof import('child_process')>('child_process');
  const out = execFileSync(process.execPath, [path.join(__dirname, 'testerReset.js'), ...args], {
    env: emulatorEnv(),
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop()!);
}

/** The owner marks the account a tester (functions/scripts/set-preview-tester.js). */
export function markPreviewTester(uid: string): void {
  testerReset(['mark-tester', uid]);
}

/**
 * The resetMyData callable, as the app calls it (`fetch` to its URL): the ID
 * token's uid is the caller, the function's own code runs (harness/testerReset.js),
 * and its answer comes back as the callable protocol gives it. Restore with the
 * returned function.
 */
export function serveResetMyData(opts: { appCheck?: boolean } = {}): { calls: number; restore: () => void } {
  const real = global.fetch;
  const served = { calls: 0, restore: () => void (global.fetch = real) };
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.endsWith('/resetMyData')) return real(input as RequestInfo, init);
    served.calls += 1;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const token = (headers.Authorization ?? '').replace(/^Bearer /, '');
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8') || '{}');
    const uid = claims.user_id ?? claims.sub;
    const data = JSON.parse(String(init?.body ?? '{}')).data ?? {};
    const answer = uid
      ? testerReset(['reset', uid, JSON.stringify(data), ...(opts.appCheck === false ? ['--no-app-check'] : [])])
      : { error: { status: 'unauthenticated', message: 'Must be signed in.' } };
    const status = answer.error ? 400 : 200;
    const body = JSON.stringify(answer);
    return { ok: !answer.error, status, text: async () => body, json: async () => answer } as unknown as Response;
  }) as typeof fetch;
  return served;
}

/**
 * The loadTestScenario callable, as the app calls it: the ID token's uid is the
 * caller, the function's own code runs (harness/testerReset.js scenario), with
 * the scenario's clock as the server's (Storage is an in-memory bucket). Restore
 * with the returned function.
 */
export function serveLoadTestScenario(): { calls: number; results: Record<string, unknown>[]; restore: () => void } {
  const real = global.fetch;
  const served = { calls: 0, results: [] as Record<string, unknown>[], restore: () => void (global.fetch = real) };
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.endsWith('/loadTestScenario')) return real(input as RequestInfo, init);
    served.calls += 1;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const token = (headers.Authorization ?? '').replace(/^Bearer /, '');
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8') || '{}');
    const uid = claims.user_id ?? claims.sub;
    const data = JSON.parse(String(init?.body ?? '{}')).data ?? {};
    const answer = uid
      ? testerReset(['scenario', uid, JSON.stringify(data), '--now', String(Date.now())])
      : { error: { status: 'unauthenticated', message: 'Must be signed in.' } };
    served.results.push(answer);
    const status = answer.error ? 400 : 200;
    const body = JSON.stringify(answer);
    return { ok: !answer.error, status, text: async () => body, json: async () => answer } as unknown as Response;
  }) as typeof fetch;
  return served;
}

/** functions/scripts/reset-account.js for this account (harness/adminReset.js). */
export function resetAccount(email: string): Record<string, unknown> {
  const { execFileSync } = jest.requireActual<typeof import('child_process')>('child_process');
  const env = {
    ...process.env,
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099',
    GCLOUD_PROJECT: 'demo-revisely',
  };
  const out = execFileSync(process.execPath, [path.join(__dirname, 'adminReset.js'), email], { env, encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop()!);
}
