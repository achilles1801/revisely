import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra;

let configured = false;

// Call once at app startup. Idempotent — safe to call again if the user signs
// out and back in. Uses the Firebase Web client ID as `webClientId` (required
// to get an ID token back that Firebase can verify); iOS client ID is read
// from GoogleService-Info.plist via the config plugin, but we still pass it
// explicitly as a belt-and-suspenders measure.
export function configureGoogleSignIn() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: extra?.googleWebClientId,
    iosClientId: extra?.googleIosClientId,
    offlineAccess: false,
  });
  configured = true;
}

export const isGoogleAuthAvailable = true;

export type GoogleSignInResult = {
  idToken: string;
};

/**
 * Triggers the native Google Sign-In sheet and returns an ID token suitable
 * for `GoogleAuthProvider.credential(idToken)`. Throws on any error other
 * than user cancellation (which throws with `code === 'SIGN_IN_CANCELLED'`,
 * callers should let that bubble or handle quietly).
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  configureGoogleSignIn();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  // SDK v16+ returns { type: 'success' | 'cancelled', data: {...} }.
  // Older shape returned the user directly. Handle both defensively.
  const idToken =
    (result as { data?: { idToken?: string } })?.data?.idToken ??
    (result as { idToken?: string })?.idToken;
  if (!idToken) {
    throw new Error('Google sign-in returned no ID token');
  }
  return { idToken };
}

export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Already signed out — ignore.
  }
}

export { statusCodes, isErrorWithCode };
