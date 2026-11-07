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

/** The HTTP status firebase-functions answers a callable error with. */
const CALLABLE_HTTP: Record<string, number> = {
  INVALID_ARGUMENT: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  RESOURCE_EXHAUSTED: 429,
  INTERNAL: 500,
  UNAVAILABLE: 503,
  DEADLINE_EXCEEDED: 504,
};

export interface RevoServed {
  /** The callables asked, in order, with what the app sent. */
  calls: { name: string; data: Record<string, unknown> }[];
  /** What the model answers next (its raw text); a JSON reply by default. */
  reply: (name: string, data: Record<string, unknown>) => string | undefined;
  /** No connection: every call fails as fetch does offline. */
  offline: boolean;
  restore: () => void;
}

/**
 * Revo's callables (revoAsk, revoDayInReview, revoSetOptions, revoClear), as the app calls them
 * (`fetch` to their URLs): the ID token's uid is the caller, the functions' own code runs against
 * the emulators (harness/revoServer.js) with the scenario's clock as the server's, and the answer
 * comes back as the callable protocol gives it (`{ result }`, or an error with its HTTP status).
 * Only the model is a stand-in. Restore with the returned function.
 */
export function serveRevo(): RevoServed {
  const { execFileSync } = jest.requireActual<typeof import('child_process')>('child_process');
  const real = global.fetch;
  const served: RevoServed = { calls: [], reply: () => undefined, offline: false, restore: () => void (global.fetch = real) };
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const name = /\/(revoAsk|revoDayInReview|revoSetOptions|revoClear)$/.exec(url)?.[1];
    if (!name) return real(input as RequestInfo, init);
    if (served.offline) throw new TypeError('Network request failed');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const token = (headers.Authorization ?? '').replace(/^Bearer /, '');
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8') || '{}');
    const uid = claims.user_id ?? claims.sub;
    const data = JSON.parse(String(init?.body ?? '{}')).data ?? {};
    served.calls.push({ name, data });
    let answer: { result?: unknown; error?: { status: string; message: string } };
    if (!uid) {
      answer = { error: { status: 'UNAUTHENTICATED', message: 'Unauthenticated' } };
    } else {
      const reply = served.reply(name, data);
      const args = [path.join(__dirname, 'revoServer.js'), name, uid, JSON.stringify(data), '--now', String(Date.now()), ...(reply != null ? ['--reply', reply] : [])];
      const out = execFileSync(process.execPath, args, { env: emulatorEnv(), encoding: 'utf8' });
      answer = JSON.parse(out.trim().split('\n').pop()!);
    }
    const status = answer.error ? (CALLABLE_HTTP[answer.error.status] ?? 500) : 200;
    const body = JSON.stringify(answer);
    return { ok: status === 200, status, text: async () => body, json: async () => answer } as unknown as Response;
  }) as typeof fetch;
  return served;
}

/**
 * A new account as the server holds it part way through sign-up: the user
 * document and pages 1–`lastPage` (harness/newAccountServer.js). `addPages`
 * lands the rest; `memorizedOnServer` reads back what was saved.
 */
function newAccountServer(args: string[]): Record<string, unknown> {
  const { execFileSync } = jest.requireActual<typeof import('child_process')>('child_process');
  const out = execFileSync(process.execPath, [path.join(__dirname, 'newAccountServer.js'), ...args], {
    env: emulatorEnv(),
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop()!);
}
export function createAccountPartWay(email: string, password: string, lastPage: number): string {
  return newAccountServer(['create', email, password, String(lastPage)]).uid as string;
}
export function addPages(email: string, from: number, to: number): void {
  newAccountServer(['add-pages', email, String(from), String(to)]);
}
export function memorizedOnServer(email: string): number[] {
  return newAccountServer(['memorized', email]).pages as number[];
}
export function markOnServer(email: string, page: number): void {
  newAccountServer(['mark', email, String(page)]);
}
export function pageCountOnServer(email: string): number {
  return newAccountServer(['count', email]).pages as number;
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
