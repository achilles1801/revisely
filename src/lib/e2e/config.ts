// What an E2E build talks to (E2E builds only, .maestro/README.md): the Firebase
// emulators on this computer, as a demo project that has no real counterpart.

import { Platform } from 'react-native';

function port(set: string | undefined, fallback: number): number {
  const n = Number(set);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * The emulators' ports: firebase.json's, unless the build set others
 * (EXPO_PUBLIC_E2E_AUTH_PORT, EXPO_PUBLIC_E2E_FIRESTORE_PORT,
 * EXPO_PUBLIC_E2E_FUNCTIONS_PORT; .maestro/scripts/emulators.sh), so an E2E run
 * can share a computer with the scenario tests.
 */
export const EMULATOR_PORTS = {
  auth: port(process.env.EXPO_PUBLIC_E2E_AUTH_PORT, 9099),
  firestore: port(process.env.EXPO_PUBLIC_E2E_FIRESTORE_PORT, 8080),
  functions: port(process.env.EXPO_PUBLIC_E2E_FUNCTIONS_PORT, 5001),
} as const;

/** A demo- project id: the emulators accept it, and it can't reach a real project. */
export const E2E_PROJECT_ID = 'demo-revisely';

/**
 * Where the emulators are: EXPO_PUBLIC_E2E_HOST, inlined at build time
 * (localhost on the iOS Simulator; the Android emulator sees this computer as
 * 10.0.2.2).
 */
export function e2eHost(): string {
  const set = process.env.EXPO_PUBLIC_E2E_HOST;
  if (set && set.trim()) return set.trim();
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

/** The web SDK's config for the demo project. Nothing here is a real key. */
export const E2E_FIREBASE_CONFIG = {
  apiKey: 'demo-e2e-not-a-key',
  authDomain: `${E2E_PROJECT_ID}.firebaseapp.com`,
  projectId: E2E_PROJECT_ID,
  storageBucket: `${E2E_PROJECT_ID}.appspot.com`,
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:0000000000000000000000',
};
