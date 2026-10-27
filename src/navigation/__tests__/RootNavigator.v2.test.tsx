import React from 'react';
import { ActivityIndicator } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../MainNavigator', () => {
  const { Text } = require('react-native');
  return { MainNavigator: () => <Text>main</Text> };
});
jest.mock('../OnboardingNavigator', () => {
  const { Text } = require('react-native');
  return { OnboardingNavigator: () => <Text>onboarding</Text> };
});
jest.mock('../../screens/auth/AuthScreen', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>auth</Text> };
});

const mockApp = { loading: false, onboardingComplete: false };
const mockAuth = { isAuthenticated: false, isLoading: false };
jest.mock('../../context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

import { RootNavigator } from '../RootNavigator';
import { DesignProvider } from '../../design/DesignContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../theme/v2';

const light = paletteV2(false, DEFAULT_ACCENT);
const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));

async function show() {
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockApp.loading = false;
  mockAuth.isLoading = false;
  mockAuth.isAuthenticated = false;
});

describe('<RootNavigator /> in the new design', () => {
  it('loading: a grey spinner on the ground, no accent', async () => {
    mockAuth.isLoading = true;
    await show();
    expect(flat(screen.getByTestId('root-loading').props.style).backgroundColor).toBe(light.bg);
    expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe(light.secondary);
  });

  it('signed out: sign-in on the flat ground, no gradient', async () => {
    await show();
    expect(screen.getByText('auth')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(LinearGradient)).toHaveLength(0);
  });
});
