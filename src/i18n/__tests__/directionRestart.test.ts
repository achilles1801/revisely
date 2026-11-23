// LANG-1 at launch (src/i18n/choice.ts, loadLanguageChoice): a launch laid out the other way from the app's language
// restarts once, in the splash, so the first screen reads the right way; a restart that didn't take isn't tried again.
// Jest pins the app to English (pinnedToEnglish), which skips all of this, so here the pin is lifted.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockNative = { isRTL: false, forced: [] as boolean[], reloads: 0 };
jest.mock('react-native', () => ({
  I18nManager: {
    get isRTL() {
      return mockNative.isRTL;
    },
    allowRTL: () => undefined,
    forceRTL: (rtl: boolean) => void mockNative.forced.push(rtl),
  },
  // Jest runs as a development build: restartForLanguage reloads Metro's bundle.
  DevSettings: { reload: () => void (mockNative.reloads += 1) },
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
}));
jest.mock('expo-updates', () => ({ reloadAsync: () => Promise.resolve() }));
jest.mock('../../lib/variant', () => ({ isDevVariant: () => false }));
jest.mock('../language', () => ({ ...jest.requireActual('../language'), pinnedToEnglish: () => false }));

// eslint-disable-next-line import/first
import { loadLanguageChoice } from '../choice';

const KEY = '@revisely_direction_restart:v1';

beforeEach(async () => {
  await AsyncStorage.clear();
  mockNative.isRTL = false;
  mockNative.forced = [];
  mockNative.reloads = 0;
});

it('restarts once when the English app started mirrored (an Android phone set to Arabic), keeping the splash up', async () => {
  mockNative.isRTL = true;
  const { language, restarting } = await loadLanguageChoice();
  expect(language).toBe('en');
  expect(restarting).toBe(true);
  expect(mockNative.forced).toEqual([false]);
  expect(mockNative.reloads).toBe(1);
  expect(await AsyncStorage.getItem(KEY)).toBe('ltr');
});

it("doesn't restart again when the restart didn't take: the app shows as it is, and never loops", async () => {
  mockNative.isRTL = true;
  await AsyncStorage.setItem(KEY, 'ltr');
  const { restarting } = await loadLanguageChoice();
  expect(restarting).toBe(false);
  expect(mockNative.reloads).toBe(0);
});

it('a launch the right way round forgets the last restart, so a later change of the phone restarts once again', async () => {
  await AsyncStorage.setItem(KEY, 'ltr');
  const { restarting } = await loadLanguageChoice();
  expect(restarting).toBe(false);
  expect(mockNative.reloads).toBe(0);
  expect(await AsyncStorage.getItem(KEY)).toBeNull();
});

it('a launch the right way round does nothing else', async () => {
  const { restarting } = await loadLanguageChoice();
  expect(restarting).toBe(false);
  expect(mockNative.reloads).toBe(0);
  expect(mockNative.forced).toEqual([false]);
});
