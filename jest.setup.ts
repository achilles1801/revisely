/**
 * Global test setup. jest-expo handles most React Native + Expo native module
 * mocks; this file only adds project-specific mocks for Firebase and a few
 * Expo modules that jest-expo does not stub out by default.
 */

// Gesture Handler's native module: every sheet (v2/Sheet) has a drag gesture.
require('react-native-gesture-handler/jestSetup');

// React Native's jest Modal, reporting a dismissal as iOS does: onDismiss a moment after a modal that
// was showing is hidden. React Native's own mock never calls it, and v2/Sheet passes its turn to the
// next sheet (and runs a menu's chosen action) from it (v2/modalTurn); without it, every sheet after
// another would wait for the fallback.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const RNModal = jest.requireActual('react-native/jest/mocks/Modal').default;
  class Modal extends RNModal {
    componentDidUpdate(prev: { visible?: boolean }) {
      const props = (this as unknown as { props: { visible?: boolean; onDismiss?: () => void } }).props;
      if (prev.visible !== false && props.visible === false) setTimeout(() => props.onDismiss?.(), 0);
    }
  }
  return { __esModule: true, default: Modal };
});

// Silence the noisy "useNativeDriver is not supported" warnings from RN Animated.
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({}), {
  virtual: true,
});

// AsyncStorage — Expo's preset includes a basic mock, but we use the official one
// to be safe for code paths that read/write keys.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Firebase JS SDK — mock at module level so importing src/lib/firebase.ts
// doesn't try to initialize a real Firebase app or open IndexedDB.
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  initializeAuth: jest.fn(() => ({ currentUser: null })),
  getReactNativePersistence: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  updateProfile: jest.fn(),
  GoogleAuthProvider: { credential: jest.fn() },
  signInWithCredential: jest.fn(),
}));

jest.mock('firebase/firestore', () => {
  // Enough of Timestamp for code that converts times (lib/offline/codec).
  class Timestamp {
    seconds: number;
    nanoseconds: number;
    constructor(s: number, ns: number) {
      this.seconds = s;
      this.nanoseconds = ns;
    }
    static fromMillis(ms: number) {
      return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
    }
    static now() {
      return Timestamp.fromMillis(Date.now());
    }
    toMillis() {
      return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
    }
    toDate() {
      return new Date(this.toMillis());
    }
  }
  return {
    Timestamp,
    disableNetwork: jest.fn(() => Promise.resolve()),
    enableNetwork: jest.fn(() => Promise.resolve()),
    getFirestore: jest.fn(() => ({})),
    doc: jest.fn(),
    setDoc: jest.fn(),
    getDoc: jest.fn(),
    collection: jest.fn(),
    query: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    getDocs: jest.fn(),
    addDoc: jest.fn(),
    serverTimestamp: jest.fn(),
    enableIndexedDbPersistence: jest.fn(() => Promise.resolve()),
  };
});

jest.mock('@react-native-firebase/app', () => ({}), { virtual: true });
jest.mock('@react-native-firebase/app-check', () => ({}), { virtual: true });

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
}));

// expo-audio is a native module; tests that exercise playback mock it themselves.
jest.mock('expo-audio', () => ({
  AudioQuality: { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
  useAudioRecorder: jest.fn(() => ({
    uri: null,
    prepareToRecordAsync: jest.fn(() => Promise.resolve()),
    record: jest.fn(),
    stop: jest.fn(() => Promise.resolve()),
  })),
  getRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
  requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => ({
    replace: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
}));

// expo-keep-awake is a native module.
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
