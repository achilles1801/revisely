// E2E builds only (EXPO_PUBLIC_E2E=1): an account the app makes and onboards by itself at launch,
// for every flow but 01-onboarding (.maestro/subflows/new-account.yaml), which goes through the
// screens. Signing up and onboarding through the UI took 1.5–2.5 minutes of every flow (Nov 7
// 2026); this takes seconds. It runs the same calls the screens make, in the same order
// (E2EAccount): AuthContext.signUp (AuthScreen), then JuzSelectionScreen's marks and updatePages,
// then ScheduleScreen's createDefaultUser, saveUser and completeOnboarding. So the account holds
// what onboarding saves, through the app's own code.
//
// Asked for at launch, with the clock (lib/e2e/clock):
//   iOS:     Maestro launchApp `arguments: {e2eAccount: "email=…&boundary=midnight"}`, which iOS
//            puts in the app's defaults for that launch (React Native's Settings reads them)
//   Android: revisely://e2e/account?email=…&boundary=midnight (no launch arguments reach JS)
//
// The account: name E2E, password e2e-password (signup.yaml's), "still memorizing": page 1 (marked
// for you) and the juz asked for (`juz`, 30 unless given: pages 582–604), the schedule screen's
// defaults (10 pages a day, notifications on), the day resetting at `boundary` (midnight | fajr;
// fajr reads the phone's location, as the schedule screen does).

import { Platform, Settings } from 'react-native';

export const E2E_PASSWORD = 'e2e-password';
export const E2E_NAME = 'E2E';

export interface AccountRequest {
  email: string;
  boundary: 'midnight' | 'fajr';
  juz: number[];
}

let pending: AccountRequest | null = null;
const listeners = new Set<() => void>();

/** `email=…&boundary=…&juz=30,29` as a request; null if it names no email or a bad value. */
export function parseAccount(query: string): AccountRequest | null {
  const params = new Map(
    query
      .replace(/^\?/, '')
      .split('&')
      .filter(Boolean)
      .map((kv) => {
        const i = kv.indexOf('=');
        const k = i < 0 ? kv : kv.slice(0, i);
        const v = i < 0 ? '' : kv.slice(i + 1);
        return [decodeURIComponent(k), decodeURIComponent(v)] as const;
      }),
  );
  const email = params.get('email') ?? '';
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
  const boundary = params.get('boundary') || 'midnight';
  if (boundary !== 'midnight' && boundary !== 'fajr') return null;
  const juz = (params.get('juz') || '30').split(',').map(Number);
  if (juz.some((n) => !Number.isInteger(n) || n < 1 || n > 30)) return null;
  return { email, boundary, juz };
}

function ask(request: AccountRequest | null, from: string): void {
  if (!request) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e] account: a bad request (${from})`);
    return;
  }
  pending = request;
  // eslint-disable-next-line no-console
  console.log(`[e2e] account: asked for ${request.email} (${from})`);
  listeners.forEach((l) => l());
}

/** Handles revisely://e2e/account?…; true if the URL was one. */
export function handleAccountLink(url: string): boolean {
  const m = /^revisely:\/\/e2e\/account\?(.*)$/i.exec(url);
  if (!m) return false;
  ask(parseAccount(m[1]), 'link');
  return true;
}

/** iOS: the account the app was launched with, if any (see the top). */
export function readLaunchAccount(): void {
  if (Platform.OS !== 'ios') return;
  let raw: unknown;
  try {
    raw = Settings.get('e2eAccount');
  } catch {
    return;
  }
  if (typeof raw === 'string' && raw.length > 0) ask(parseAccount(raw), 'launch');
}

/** The account asked for and not yet made, if any. */
export function pendingAccount(): AccountRequest | null {
  return pending;
}

/** Called once the account is made (or making it failed). */
export function accountDone(): void {
  pending = null;
  listeners.forEach((l) => l());
}

export function onAccountRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
