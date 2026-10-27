import firebase from '@react-native-firebase/app';
import '@react-native-firebase/app-check';

let initialized = false;

/** A debug token, only in a development build and only if one is set. */
export function debugTokenFor(dev: boolean, value: string | undefined): string | undefined {
  return dev && value && value.trim() ? value.trim() : undefined;
}

// Development builds use App Check's debug provider (simulators can't do App
// Attest), with a debug token registered in the Firebase Console. It comes from
// your local, gitignored .env as EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN (CLAUDE.md,
// "App Check debug token"), never from the repo. Release builds never carry it:
// the value sits inside the __DEV__ branch, which the release bundler removes,
// and EAS has no such variable.
const DEBUG_TOKEN: string | undefined = __DEV__
  ? debugTokenFor(true, process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN)
  : undefined;

export async function setupAppCheck(): Promise<void> {
  if (initialized) return;

  const appCheck = (firebase as any).appCheck();
  const provider = appCheck.newReactNativeFirebaseAppCheckProvider();
  provider.configure({
    apple: {
      // 'debug' in development (a token registered in the Console; without
      // one, the SDK logs a new token to register). App Attest is only
      // available on physical iOS 14+ devices.
      provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
      debugToken: DEBUG_TOKEN,
    },
    android: {
      provider: __DEV__ ? 'debug' : 'playIntegrity',
      debugToken: DEBUG_TOKEN,
    },
  });

  await appCheck.initializeAppCheck({
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  initialized = true;
}

export async function getAppCheckToken(): Promise<string | null> {
  try {
    if (!initialized) await setupAppCheck();
    const result = await (firebase as any).appCheck().getToken();
    return result.token;
  } catch (err) {
    // Fail open on the client — the server is the source of truth on enforcement.
    if (__DEV__) console.warn('[appCheck] failed to fetch token:', err);
    return null;
  }
}
