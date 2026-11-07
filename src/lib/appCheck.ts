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
  : process.env.EXPO_PUBLIC_TESTLAB === '1'
    ? debugTokenFor(true, process.env.EXPO_PUBLIC_TESTLAB_APPCHECK_TOKEN)
    : undefined;

// The Test Lab build (EXPO_PUBLIC_TESTLAB=1, testlab.yml, TESTING.md "Real devices"): a release
// build installed on Test Lab's phones outside Play, so Play Integrity can't vouch for it; it uses
// the debug provider with a token registered for it. Every other build has no such variable (EAS
// has none), so this is false and the bundler drops it.
const TESTLAB = process.env.EXPO_PUBLIC_TESTLAB === '1';

export async function setupAppCheck(): Promise<void> {
  if (initialized) return;
  // E2E builds (EXPO_PUBLIC_E2E=1) talk only to the emulators: no native App
  // Check (getAppCheckToken hands out the emulator's token instead); every other
  // build drops this line (the variable is inlined).
  if (process.env.EXPO_PUBLIC_E2E === '1') return;

  const appCheck = (firebase as any).appCheck();
  const provider = appCheck.newReactNativeFirebaseAppCheckProvider();
  provider.configure({
    apple: {
      // 'debug' in development (a token registered in the Console; without
      // one, the SDK logs a new token to register). App Attest is only
      // available on physical iOS 14+ devices.
      provider: __DEV__ || TESTLAB ? 'debug' : 'appAttestWithDeviceCheckFallback',
      debugToken: DEBUG_TOKEN,
    },
    android: {
      provider: __DEV__ || TESTLAB ? 'debug' : 'playIntegrity',
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
  // E2E builds: a token only the functions emulator accepts (lib/e2e/functions); a simulator
  // can't attest the app. Every other build drops this line (the variable is inlined).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (process.env.EXPO_PUBLIC_E2E === '1') return (require('./e2e/functions') as typeof import('./e2e/functions')).E2E_APP_CHECK_TOKEN;
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
