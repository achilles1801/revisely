// Runs after the root jest.setup.ts. That file mocks the Firebase JS SDK for
// unit tests; scenarios use the real SDK against the emulators. Everything else
// mocked here is an edge of the phone (network state, native views), not app logic.
jest.unmock('firebase/app');
jest.unmock('firebase/auth');
jest.unmock('firebase/firestore');

jest.mock('@react-native-community/netinfo', () => require('./netinfo'));
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }: { name: string }) => require('react').createElement(Text, null, `[${name}]`);
  return { Ionicons: Icon, MaterialCommunityIcons: Icon, Feather: Icon };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native/Libraries/AppState/AppState', () => require('./appState'));

// Native SDKs with no JavaScript fallback: stand-ins that do nothing.
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: () => undefined,
    hasPlayServices: async () => true,
    signIn: async () => ({ type: 'cancelled' }),
    signOut: async () => undefined,
    revokeAccess: async () => undefined,
  },
  statusCodes: {},
  isErrorWithCode: () => false,
  isSuccessResponse: () => false,
}));
jest.mock('@sentry/react-native', () => {
  const noop = () => undefined;
  return new Proxy(
    { __esModule: true, wrap: (c: unknown) => c, withScope: (fn: (s: unknown) => void) => fn({ setTag: noop, setExtra: noop, setLevel: noop, setContext: noop }) },
    { get: (target: Record<string, unknown>, key: string) => (key in target ? target[key] : noop) },
  );
});

// The app runs on real timers (listeners, the outbox, the emulators), so its
// state changes land outside act() all the time, as they do on a phone.
const consoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('not wrapped in act(')) return;
  consoleError(...args);
};

// The Qur'an pages are images: the pager stands in for them (harness/pager).
jest.mock('../../../src/components/MushafPager', () => require('./pager'));
jest.mock('../../../src/lib/pageCache', () => ({
  ...jest.requireActual('../../../src/lib/pageCache'),
  prefetchPages: () => undefined,
}));

// The phone's disk (harness/fileSystem): a folder per Phone.
jest.mock('expo-file-system', () => require('./fileSystem'));
// Notifications: nothing is shown or scheduled; permission is not given.
jest.mock('expo-notifications', () => {
  const base: Record<string, unknown> = {
    __esModule: true,
    SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date', WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval' },
    AndroidImportance: { DEFAULT: 3, HIGH: 4, MAX: 5 },
    getPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
    requestPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
    getAllScheduledNotificationsAsync: async () => [],
    getPresentedNotificationsAsync: async () => [],
    getExpoPushTokenAsync: async () => ({ data: 'scenario' }),
  };
  return new Proxy(base, {
    get: (t, k: string) =>
      k in t ? t[k] : k.startsWith('add') && k.endsWith('Listener') ? () => ({ remove: () => undefined }) : async () => undefined,
  });
});

// Modal with iOS's onShow and onDismiss (harness/modal).
jest.mock('react-native/Libraries/Modal/Modal', () => require('./modal'));
