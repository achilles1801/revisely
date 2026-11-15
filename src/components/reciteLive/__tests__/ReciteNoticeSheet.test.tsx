// The model's AI notice before the first take: "I understand" stays on screen, outside the scrolling notice. At the
// largest text on an SE the notice runs several screens long, and the button sat at its end (Nov 15 2026, simulator).
import React from 'react';
import { ScrollView } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ReciteNoticeSheet } from '../ReciteNoticeSheet';

const mockPalette = require('../../../theme/v2').paletteV2(false, 'indigo');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } };

it('“I understand” is pinned under the notice, never at the end of its scroll', () => {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ReciteNoticeSheet visible onAgree={() => undefined} onClose={() => undefined} />
    </SafeAreaProvider>,
  );
  expect(screen.getByTestId('recite-notice-agree')).toBeTruthy();
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(within(scroll).queryByTestId('recite-notice-agree')).toBeNull();
});
