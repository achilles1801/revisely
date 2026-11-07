// App Check on the phone (@react-native-firebase/app). On a phone, App Attest (iOS) or Play
// Integrity (Android) vouches for the app, which no test can do; that attestation is the edge
// stood in for here. The phone's App Check hands out a token the functions emulator accepts (the
// emulator decodes tokens instead of verifying them), or none once a scenario says attestation
// failed (`failAppCheck()`): then our callables refuse the call, as they do in production.

const g = globalThis as unknown as { __scenarioAppCheck?: { failing: boolean } };
const state = () => (g.__scenarioAppCheck ??= { failing: false });

export function failAppCheck(failing = true): void {
  state().failing = failing;
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** An unsigned token in App Check's shape: `sub` is the app. */
const TOKEN = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '1:123456789012:ios:scenario', aud: ['projects/demo-revisely'] })}.`;

const appCheck = () => ({
  newReactNativeFirebaseAppCheckProvider: () => ({ configure: () => undefined }),
  initializeAppCheck: async () => undefined,
  getToken: async () => {
    if (state().failing) throw new Error('App Attest failed');
    return { token: TOKEN };
  },
});

const firebase = { appCheck };
module.exports = { __esModule: true, default: firebase, ...firebase, failAppCheck };
