// The E2E build's start (src/lib/e2e/install.ts): a fresh install's theme is chosen
// before the app starts, so the flows' screenshots are always taken in light.

jest.mock('../clock', () => ({ handleClockLink: jest.fn(), installClock: jest.fn() }));
jest.mock('../log', () => ({ flushE2ELog: jest.fn(), installLog: jest.fn() }));
jest.mock('../network', () => ({ handleNetworkLink: jest.fn(), installNetwork: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME_KEY as APP_THEME_KEY, resolveThemeMode } from '../../../context/ThemeContext';
import { THEME_KEY, pinFreshTheme } from '../install';

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('uses the key ThemeContext reads', () => {
  expect(THEME_KEY).toBe(APP_THEME_KEY);
});

it('chooses light for a fresh install, even when this launch has already written keys', async () => {
  // The store check's app config, written before the theme looked: an "existing install".
  await AsyncStorage.setItem('@revisely_app_config', '{}');
  await pinFreshTheme();
  const saved = await AsyncStorage.getItem(THEME_KEY);
  expect(saved).toBe('light');
  expect(resolveThemeMode(saved, null, false, true)).toBe('light');
});

it('keeps a choice already made', async () => {
  await AsyncStorage.setItem(THEME_KEY, 'dark');
  await pinFreshTheme();
  expect(await AsyncStorage.getItem(THEME_KEY)).toBe('dark');
});
