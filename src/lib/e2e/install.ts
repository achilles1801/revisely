// E2E builds only (EXPO_PUBLIC_E2E=1): src/dev/install loads this first, before
// Firebase starts, under a test the release bundler drops (it inlines the
// variable as undefined, so `undefined === '1'` folds away with the require).
// What it sets up, and how flows drive it: .maestro/README.md.

import { AppState, Linking } from 'react-native';
import { handleClockLink, installClock } from './clock';
import { flushE2ELog, installLog } from './log';
import { handleNetworkLink, installNetwork } from './network';
import { handleRevoLink } from './revoFake';
import { handleRecordingsLink, installDemoRecordings } from './demoRecordings';

let installed = false;
let ready: Promise<void> = Promise.resolve();

function handle(url: string | null | undefined): void {
  if (!url) return;
  if (handleClockLink(url)) return;
  if (handleRevoLink(url)) return;
  if (handleRecordingsLink(url)) return;
  handleNetworkLink(url);
}

export function installE2E(): void {
  if (installed) return;
  installed = true;
  installLog();
  installClock();
  installNetwork();
  installDemoRecordings();
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
  ready = Linking.getInitialURL()
    .then(handle)
    .catch(() => undefined);
  // eslint-disable-next-line no-console
  console.log('[e2e] installed: revisely-e2e-build');
}

/** Resolves once a launch link, if any, has been applied. */
export function e2eReady(): Promise<void> {
  return ready;
}
