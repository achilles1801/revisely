import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { AuthSessionResult } from 'expo-auth-session';
import Constants from 'expo-constants';

// Required for web browser redirect
WebBrowser.maybeCompleteAuthSession();

// Client IDs from environment variables
const extra = Constants.expoConfig?.extra;

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: extra?.googleIosClientId,
    webClientId: extra?.googleWebClientId,
  });

  return {
    request,
    response,
    promptAsync,
  };
}

export function getIdTokenFromResponse(response: AuthSessionResult | null): string | null {
  if (response?.type === 'success') {
    const { id_token } = response.params;
    return id_token || null;
  }
  return null;
}
