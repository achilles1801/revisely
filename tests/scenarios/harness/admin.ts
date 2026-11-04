// What the owner does to an account from a laptop, against the emulators.
import path from 'path';

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
