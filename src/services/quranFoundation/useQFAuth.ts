import { useCallback, useEffect, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  QF_USER_AUTHORIZE_ENDPOINT,
  QF_USER_CONFIG,
  QF_REDIRECT_URI,
} from './config';
import { exchangeCodeForToken, isQFConnected, disconnectQF } from './oauth';

// Required to close the in-app browser when the OAuth redirect comes back.
WebBrowser.maybeCompleteAuthSession();

const SCOPES = ['openid', 'offline_access', 'streak', 'goal', 'reading_session'];
const SCOPE_STRING = SCOPES.join(' ');

const discovery = {
  authorizationEndpoint: QF_USER_AUTHORIZE_ENDPOINT,
  // tokenEndpoint omitted — code exchange is done in `oauth.ts` so the client
  // secret (required by QF's basic-auth on /token) stays out of the hook.
};

/**
 * Hook that drives the PKCE login flow to Quran Foundation. Returns:
 *  - connected: whether a session is stored locally
 *  - inFlight: true while waiting for the user to complete the browser flow
 *  - signIn(): launches the in-app browser
 *  - signOut(): clears the local session
 *  - error: last failure (cleared on a fresh attempt)
 */
export function useQFAuth() {
  const [connected, setConnected] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read initial connection state on mount and after sign-in / sign-out.
  const refreshConnected = useCallback(async () => {
    setConnected(await isQFConnected());
  }, []);

  useEffect(() => {
    refreshConnected();
  }, [refreshConnected]);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: QF_USER_CONFIG.clientId,
      scopes: SCOPES,
      redirectUri: QF_REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    discovery,
  );

  useEffect(() => {
    if (!response) return;

    (async () => {
      if (response.type === 'success' && request?.codeVerifier) {
        try {
          await exchangeCodeForToken({
            code: response.params.code,
            codeVerifier: request.codeVerifier,
            scope: SCOPE_STRING,
          });
          await refreshConnected();
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Sign-in failed');
        } finally {
          setInFlight(false);
        }
      } else if (response.type === 'error') {
        setError(response.error?.message ?? 'Sign-in cancelled');
        setInFlight(false);
      } else if (response.type === 'cancel' || response.type === 'dismiss') {
        setInFlight(false);
      }
    })();
  }, [response, request, refreshConnected]);

  const signIn = useCallback(async () => {
    if (!request) return;
    setError(null);
    setInFlight(true);
    try {
      await promptAsync();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed to launch');
      setInFlight(false);
    }
  }, [request, promptAsync]);

  const signOut = useCallback(async () => {
    await disconnectQF();
    await refreshConnected();
  }, [refreshConnected]);

  return { connected, inFlight, error, signIn, signOut };
}
