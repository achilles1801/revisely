import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name, color }: { name: string; color: string }) => <Text testID={`icon-${name}`}>{color}</Text> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// A gradient backdrop, which the preview must not draw.
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: ({ testID }: { testID?: string }) => <View testID={testID ?? 'linear-gradient'} /> };
});
jest.mock('../../../components/MushafPager', () => {
  const { View } = require('react-native');
  return { MushafPager: () => <View testID="mushaf" /> };
});

const mockApp: any = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));

import { SmartTrackingPreviewScreen } from '../SmartTrackingPreviewScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import type { User, UserPage } from '../../../types';

const palette = paletteV2(false, DEFAULT_ACCENT);
const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

const page: UserPage = {
  pageNumber: 1,
  status: 'memorized',
  dateMemorized: null,
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  mockApp.user = { id: 'u1', smartTrackingEnabled: false, hasSeenSmartTrackingPreview: false } as unknown as User;
  mockApp.pages = [page];
  mockApp.saveUser = jest.fn(async () => undefined);
});

const dismissSheets = () => {
  // A menu's action runs once it has gone (iOS: onDismiss).
  const { Modal } = jest.requireActual('react-native');
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });
};

async function renderPreview(onClose = jest.fn()) {
  render(v2(<SmartTrackingPreviewScreen visible onClose={onClose} />));
  await act(async () => {});
  return onClose;
}

describe('the Smart Tracking preview in the new design', () => {
  it('a flat ground, a top bar with Close, no gradient, no glass, no uppercase eyebrow', async () => {
    await renderPreview();
    expect(flat(screen.getByTestId('smart-preview').props.style).backgroundColor).toBe(palette.bg);
    expect(screen.getByText('Smart Tracking')).toBeTruthy();
    expect(screen.getByText('Meet Smart Tracking')).toBeTruthy();
    expect(screen.queryByText('SMART TRACKING PREVIEW')).toBeNull();
    expect(screen.queryByTestId('linear-gradient')).toBeNull();
    expect(flat(screen.getByTestId('preview-show-me').props.style).backgroundColor).toBe(palette.primary);
  });

  it('the whole flow: rate in a demo session, see Insights, enable', async () => {
    const onClose = await renderPreview();
    fireEvent.press(screen.getByTestId('preview-show-me'));

    // The demo session: the session's header, a line saying what to do.
    expect(screen.getByTestId('preview-step-rate')).toBeTruthy();
    expect(screen.getByText('Tap ⋯, then Rate page strength')).toBeTruthy();
    expect(screen.getByTestId('preview-continue').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByLabelText('Mark current page as revised'));
    expect(screen.getByTestId('round-button-active')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Session menu'));
    fireEvent.press(screen.getByTestId('sheet-action-rate'));
    dismissSheets();
    expect(screen.getByTestId('sandbox-rating-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sandbox-rating-2'));
    expect(screen.getByText('Rated weak. Nothing is saved.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('preview-continue'));
    // The real Insights rows, the rated page in red.
    expect(screen.getByTestId('preview-step-insights')).toBeTruthy();
    expect(screen.getByText('1 weak')).toBeTruthy();
    expect(screen.getByTestId('mimic-focus')).toBeTruthy();
    expect(flat(screen.getAllByTestId('strength-dot')[0].props.style).backgroundColor).toBe(palette.red);
    fireEvent.press(screen.getByTestId('mimic-focus'));
    expect(screen.getByTestId('page-preview')).toBeTruthy();

    fireEvent.press(screen.getByTestId('preview-next'));
    expect(screen.getByText('Enable Smart Tracking?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('preview-enable'));
    });
    expect(mockApp.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({ smartTrackingEnabled: true, hasSeenSmartTrackingPreview: true }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('"Not now" points to Settings, its Smart Tracking row lit in the accent tint', async () => {
    await renderPreview();
    fireEvent.press(screen.getByTestId('preview-show-me'));
    fireEvent.press(screen.getByLabelText('Session menu'));
    fireEvent.press(screen.getByTestId('sheet-action-rate'));
    dismissSheets();
    fireEvent.press(screen.getByTestId('sandbox-rating-4'));
    fireEvent.press(screen.getByTestId('preview-continue'));
    fireEvent.press(screen.getByTestId('preview-next'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('preview-not-now'));
    });
    expect(mockApp.saveUser).toHaveBeenCalledWith(expect.objectContaining({ hasSeenSmartTrackingPreview: true }));
    expect(screen.getByText('No problem')).toBeTruthy();
    // No close button on this last step.
    expect(screen.queryByTestId('preview-close')).toBeNull();
    const row = screen.getByTestId('mimic-settings-row');
    expect(row).toBeTruthy();
    const glow = screen.UNSAFE_getAllByProps({ pointerEvents: 'none' }).find(
      (n: { props: { style?: unknown } }) => flat(n.props.style).backgroundColor === palette.accentSubtle,
    );
    expect(glow).toBeTruthy();
    expect(screen.getByTestId('preview-got-it')).toBeTruthy();
  });
});
