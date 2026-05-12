import firebase from '@react-native-firebase/app';
import '@react-native-firebase/app-check';

let initialized = false;

// Set this in app launch to a token registered in Firebase Console under
// App Check → Apps → Manage debug tokens. Required when running on the
// iOS simulator (real App Attest only works on physical devices).
const DEBUG_TOKEN: string | undefined = 'D542F937-3048-47D7-A71E-A96F3AD19A6A';

export async function setupAppCheck(): Promise<void> {
  if (initialized) return;

  const appCheck = (firebase as any).appCheck();
  const provider = appCheck.newReactNativeFirebaseAppCheckProvider();
  provider.configure({
    apple: {
      // 'debug' for simulator (needs DEBUG_TOKEN registered in Console).
      // App Attest is only available on physical iOS 14+ devices.
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
