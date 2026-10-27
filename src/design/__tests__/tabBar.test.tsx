import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name, color }: { name: string; color: string }) => <Text testID={`icon-${name}`}>{color}</Text> };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DesignProvider } from '../DesignContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { LiquidGlassTabBar } from '../../components/LiquidGlassTabBar';
import { DEFAULT_ACCENT, paletteLight, paletteV2 } from '../../theme/v2';

const routes = [
  { key: 'home-1', name: 'Home' },
  { key: 'read-1', name: 'Read' },
  { key: 'insights-1', name: 'Insights' },
];

async function setup(focusedIndex: number) {
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  const navigation = { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() };
  const props = {
    state: { index: focusedIndex, routes, key: 'tabs', routeNames: routes.map((r) => r.name) },
    descriptors: Object.fromEntries(routes.map((r) => [r.key, { options: {} }])),
    navigation,
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    showInsightsTab: true,
  } as any;
  render(
    <DesignProvider initial={{ allowed: true, chosen: 'new' }}>
      <ThemeProvider>
        <LiquidGlassTabBar {...props} />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
  return navigation;
}

describe('the tab bar in the new design', () => {
  it('is a flat, icon-only bar: the selected tab filled in ink, the rest outlined', async () => {
    await setup(0);
    expect(screen.getByTestId('tab-bar-v2')).toBeTruthy();
    expect(screen.getByTestId('icon-home').props.children).toBe(paletteV2(false, DEFAULT_ACCENT).accentText);
    expect(screen.getByTestId('icon-book-outline').props.children).toBe(paletteLight.secondary);
    // Insights is a chart, not sparkles.
    expect(screen.getByTestId('icon-stats-chart-outline')).toBeTruthy();
  });

  it('changes tab without a buzz', async () => {
    const navigation = await setup(0);
    fireEvent.press(screen.getByTestId('tab-Read'));
    expect(navigation.navigate).toHaveBeenCalledWith('Read');
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });
});
