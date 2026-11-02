// Whether the phone has a connection (NetInfo), and getting Firestore back on
// it quickly. Firestore's JavaScript SDK hears nothing about the network in
// React Native: after a failure it waits up to a minute before trying again,
// so when the connection comes back (or the app comes to the front) the
// listeners are restarted at once.

import { AppState } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../firebase';
import { logger } from '../logger';

/** NetInfo says there's no connection (unknown counts as connected). */
export function netOffline(s: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return s.isConnected === false || s.isInternetReachable === false;
}

let restarting: Promise<void> | null = null;

/** Restarts Firestore's connection now (pending writes and listeners carry on). */
export function restartFirestore(): Promise<void> {
  if (!restarting) {
    restarting = (async () => {
      try {
        await disableNetwork(db);
        await enableNetwork(db);
      } catch (err) {
        logger.warn('Could not restart the Firestore connection', err);
      } finally {
        restarting = null;
      }
    })();
  }
  return restarting;
}

/**
 * Calls `onChange(offline)` with NetInfo's answer as it changes, and
 * `onBack()` when the connection returns or the app comes to the front.
 */
export function watchConnectivity(onChange: (offline: boolean) => void, onBack: () => void): () => void {
  let offline: boolean | null = null;
  const unsubNet = NetInfo.addEventListener((s) => {
    const next = netOffline(s);
    const cameBack = offline === true && !next;
    offline = next;
    onChange(next);
    if (cameBack) onBack();
  });
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') onBack();
  });
  return () => {
    unsubNet();
    appState.remove();
  };
}
