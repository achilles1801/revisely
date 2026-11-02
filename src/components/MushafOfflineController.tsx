import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../context/AuthContext';
import { prepareMushafOffline, setMushafActive, startMushafOffline } from '../lib/mushafOffline';
import { setNetworkState } from '../lib/networkState';

/** After the first screens have loaded: what is on the phone, and moving old cached pages. */
const PREPARE_DELAY_MS = 2_000;
/** After launch, so the account and the first pages load first. */
const START_DELAY_MS = 20_000;

/**
 * Keeps the offline mushaf downloading (lib/mushafOffline): the network, the
 * app coming and going, and a start a little after someone is signed in.
 * Renders nothing.
 */
export function MushafOfflineController() {
  const { firebaseUser, provisionalUid } = useAuth();
  const signedIn = !!firebaseUser || !!provisionalUid;

  useEffect(() => {
    const prepare = setTimeout(() => {
      prepareMushafOffline().catch(() => undefined);
    }, PREPARE_DELAY_MS);
    const unsubNet = NetInfo.addEventListener((s) =>
      setNetworkState({
        connected: s.isConnected === true && s.isInternetReachable !== false,
        type: s.type,
        expensive: (s.details as { isConnectionExpensive?: boolean } | null)?.isConnectionExpensive === true,
      }),
    );
    const appState = AppState.addEventListener('change', (s) => setMushafActive(s === 'active'));
    return () => {
      clearTimeout(prepare);
      unsubNet();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const start = setTimeout(startMushafOffline, START_DELAY_MS);
    return () => clearTimeout(start);
  }, [signedIn]);

  return null;
}
