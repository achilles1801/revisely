// The E2E build in Arabic (src/lib/e2e/language.ts): flow 21 asks for it once (a launch argument on iOS, a link on
// Android), and the app shows it from then on, laid out right to left from the next launch. Every other flow, asking
// for nothing, stays in English.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n } from '../../../i18n/instance';
import { applyE2ELanguage, handleLanguageLink, LANGUAGE_KEY, languageStatus } from '../language';

// The launch's arguments as iOS hands them to the app's defaults (Settings), and the direction for the next launch.
const mockLaunch: { args: Record<string, unknown>; forceRTL: jest.Mock } = { args: {}, forceRTL: jest.fn() };
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Settings: { get: (key: string) => mockLaunch.args[key] },
  I18nManager: { isRTL: false, allowRTL: () => undefined, forceRTL: (rtl: boolean) => mockLaunch.forceRTL(rtl) },
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const forceRTL = mockLaunch.forceRTL;

beforeEach(async () => {
  await AsyncStorage.clear();
  await i18n.changeLanguage('en');
  mockLaunch.args = {};
  forceRTL.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await i18n.changeLanguage('en');
});

it('leaves every other flow in English, left to right', async () => {
  await applyE2ELanguage();
  expect(i18n.language).toBe('en');
  expect(forceRTL).not.toHaveBeenCalled();
});

it('takes Arabic from the link, keeps it, and lays out right to left from the next launch', async () => {
  expect(handleLanguageLink('revisely://e2e/language?lang=ar')).toBe(true);
  await flush();
  expect(i18n.language).toBe('ar');
  expect(await AsyncStorage.getItem(LANGUAGE_KEY)).toBe('ar');
  expect(forceRTL).toHaveBeenLastCalledWith(true);
});

it('leaves other links to their own handlers, and a language it has no strings for alone', async () => {
  expect(handleLanguageLink('revisely://e2e/clock?at=2026-11-03T20:00')).toBe(false);
  expect(handleLanguageLink('revisely://e2e/language?lang=fr')).toBe(true);
  await flush();
  expect(i18n.language).toBe('en');
  expect(await AsyncStorage.getItem(LANGUAGE_KEY)).toBeNull();
});

it('starts in the language kept from an earlier launch', async () => {
  await AsyncStorage.setItem(LANGUAGE_KEY, 'ar');
  await applyE2ELanguage();
  expect(i18n.language).toBe('ar');
  expect(forceRTL).toHaveBeenLastCalledWith(true);
});

it('takes the language named at launch (iOS) and keeps it for the launches after', async () => {
  mockLaunch.args = { e2eLanguage: 'ar' };
  await applyE2ELanguage();
  expect(i18n.language).toBe('ar');
  expect(await AsyncStorage.getItem(LANGUAGE_KEY)).toBe('ar');
});

it('says the language and the direction on the status line, nothing in English left to right', () => {
  expect(languageStatus('en', false)).toBe('');
  expect(languageStatus('ar', false)).toBe(' ar');
  expect(languageStatus('ar', true)).toBe(' ar rtl');
});
