// What the owner does to an account from a laptop, against the emulators.
import path from 'path';
import { forget, served } from './functions';
import { setServerDoc } from './serverDocs';

function emulatorEnv() {
  return {
    ...process.env,
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099',
    GCLOUD_PROJECT: 'demo-revisely',
  };
}

/** The owner marks the account a tester (functions/scripts/set-preview-tester.js). */
export async function markPreviewTester(uid: string): Promise<void> {
  await setServerDoc(`users/${uid}`, { previewTester: true });
}

/**
 * A callable, watched as the app calls it: the real function in the emulator answers
 * (harness/functions). `calls` and `results` count from now; `restore` stops counting.
 */
export function watchFunction(name: string): {
  readonly calls: number;
  readonly sent: unknown[];
  readonly results: Record<string, unknown>[];
  restore: () => void;
} {
  forget(name);
  return {
    get calls() {
      return served(name).calls;
    },
    get sent() {
      return served(name).sent;
    },
    get results() {
      return served(name).answers;
    },
    restore: () => forget(name),
  };
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
    FIREBASE_STORAGE_EMULATOR_HOST: process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199',
    GCLOUD_PROJECT: 'demo-revisely',
  };
  const out = execFileSync(process.execPath, [path.join(__dirname, 'adminReset.js'), email], { env, encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop()!);
}
