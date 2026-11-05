// Points the app's Firebase at the emulators (E2E builds only; src/lib/firebase
// calls this right after creating Auth and Firestore, before either is used).

import { Auth, connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, setLogLevel } from 'firebase/firestore';
import { e2eHost, EMULATOR_PORTS } from './config';

export { E2E_FIREBASE_CONFIG } from './config';

export function connectEmulators(auth: Auth, db: Firestore): void {
  const host = e2eHost();
  connectAuthEmulator(auth, `http://${host}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, EMULATOR_PORTS.firestore);
  // A run looking into a flow (e2e.yml's `debug`): Firestore says what its
  // streams do, into the app's log (log.ts).
  if (process.env.EXPO_PUBLIC_E2E_FIRESTORE_DEBUG === '1') setLogLevel('debug');
  // eslint-disable-next-line no-console
  console.log(`[e2e] Firebase → emulators at ${host} (auth ${EMULATOR_PORTS.auth}, firestore ${EMULATOR_PORTS.firestore})`);
}
