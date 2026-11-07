// E2E builds only (EXPO_PUBLIC_E2E=1): src/dev/install loads this first, before
// Firebase starts, under a test the release bundler drops (it inlines the
// variable as undefined, so `undefined === '1'` folds away with the require).
// What it sets up, and how flows drive it: .maestro/README.md.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Linking } from 'react-native';
import { handleClockLink, installClock } from './clock';
import { flushE2ELog, installLog } from './log';
import { handleNetworkLink, installNetwork } from './network';
import { handleRevoLink } from './revoFake';

let installed = false;
let ready: Promise<void> = Promise.resolve();

function handle(url: string | null | undefined): void {
  if (!url) return;
  if (handleClockLink(url)) return;
  if (handleRevoLink(url)) return;
  handleNetworkLink(url);
}

export function installE2E(): void {
  if (installed) return;
  installed = true;
  installLog();
  installClock();
  installNetwork();
  Linking.addEventListener('url', ({ url }) => {
    // eslint-disable-next-line no-console
    console.log(`[e2e] link ${url}`);
    handle(url);
  });
  AppState.addEventListener('change', (state) => {
    // eslint-disable-next-line no-console
    console.log(`[e2e] app ${state}`);
    if (state !== 'active') flushE2ELog();
  });
  // A cold start from a link (openLink with the app closed): the app waits for
  // it (E2ERoot), so the first screen already runs at the flow's time.
  const link = Linking.getInitialURL()
    .then(handle)
    .catch(() => undefined);
  ready = Promise.all([link, pinFreshTheme()]).then(() => undefined);
  // eslint-disable-next-line no-console
  console.log('[e2e] installed: revisely-e2e-build');
}

/** ThemeContext's key. */
export const THEME_KEY = '@revisely_theme_v2';

/**
 * A fresh install starts light, the theme every flow's screenshots are approved in
 * (.maestro/README.md, "Screenshots"). ThemeContext decides once, at the first
 * launch: light, unless an earlier launch left keys behind. This launch's own early
 * writes can land first on a slow Simulator (the store check saves the app config 3 s
 * in), and a fresh install then turned dark (run 42336185779, iOS 03-revise-ahead).
 * So E2E builds make that first choice before the app starts; a choice already made
 * stays.
 */
export async function pinFreshTheme(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(THEME_KEY)) == null) await AsyncStorage.setItem(THEME_KEY, 'light');
  } catch {
    // The app decides as it would without E2E.
  }
}

/** Resolves once a launch link, if any, has been applied (and the fresh install's theme chosen). */
export function e2eReady(): Promise<void> {
  return ready;
}
