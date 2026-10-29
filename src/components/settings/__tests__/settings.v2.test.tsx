import React from 'react';
import { Alert, StyleSheet } from 'react-native';
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
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-updates', () => ({
  isEnabled: true,
  useUpdates: () => ({ lastCheckForUpdateTimeSinceRestart: new Date('2026-10-25T05:00:00Z') }),
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));
jest.mock('../../../lib/sentry', () => ({ sendTestError: jest.fn(), triggerTestNativeCrash: jest.fn() }));

const mockApp: any = { user: null, saveUser: jest.fn(async () => undefined) };
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));

import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { AppInfo } from '../AppInfo';
import { AccentPicker, AccentSetting } from '../AccentPicker';
import { FajrBoundaryCard } from '../../FajrBoundaryCard';
import { KahfPost } from '../../home/feed/KahfPost';
import { describeRelease } from '../../../lib/releaseInfo';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';

const palette = paletteV2(false, DEFAULT_ACCENT);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flat = (style: unknown): Record<string, any> => StyleSheet.flatten(style as never) ?? {};
const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);
const renderV2 = async (ui: React.ReactElement) => {
  render(v2(ui));
  await act(async () => {});
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

describe('App info in the new design', () => {
  const release = describeRelease({
    version: '1.0.2',
    build: '19',
    runtimeVersion: 'b576e0107b9d56bb0645b8baed5c257bf037cb15',
    channel: 'preview',
    updateId: '01a1574f-56c7-72e5-ae37-91f7dd0d6a2a',
    updateGroup: '84b0091f-17b0-402b-985a-a5270bc27a51',
    isEmbeddedLaunch: false,
    isEmergencyLaunch: false,
    emergencyLaunchReason: null,
    updateCreatedAt: null,
    isDev: false,
    isDevice: true,
  });

  // Test actions show only where builds report (not development).
  beforeAll(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });
  afterAll(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  });

  it('is a Settings row (an ink glyph, no tinted tile); its details open with outline pills', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderV2(<AppInfo release={release} />);
    expect(screen.getByTestId('app-info-v2')).toBeTruthy();
    expect(screen.getByTestId('icon-information-circle-outline').props.children).toBe(palette.text);
    expect(flat(screen.getByText('App info').props.style).color).toBe(palette.text);
    expect(screen.queryByTestId('app-info-details')).toBeNull();
    fireEvent.press(screen.getByLabelText(/App info/));
    expect(screen.getByTestId('app-info-details')).toBeTruthy();
    expect(flat(screen.getByText('Version 1.0.2 (19)').props.style).color).toBe(palette.secondary);
    // The actions are outline pills: no fill.
    const share = screen.getByLabelText('Share');
    expect(flat(share.props.style).backgroundColor).toBeUndefined();
    expect(screen.getByText('Send test error')).toBeTruthy();
  });
});

describe('the accent picker', () => {
  it('outlines the unchosen chips in the outline token, the chosen one in ink', async () => {
    await renderV2(<AccentPicker value="indigo" onChange={jest.fn()} />);
    expect(flat(screen.getByTestId('accent-indigo').props.style).borderColor).toBe(palette.text);
    expect(flat(screen.getByTestId('accent-jade').props.style).borderColor).toBe(palette.outline);
  });
});

describe('the Accent row', () => {
  const layout = (testID: string, width: number) =>
    fireEvent(screen.getByTestId(testID, { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { width, height: 30, x: 0, y: 0 } },
    });

  it('names the chips only when they fit beside the label, as measured (not from the screen width)', async () => {
    await renderV2(<AccentSetting value="indigo" onChange={jest.fn()} />);
    // Not measured yet: the swatches, which always fit.
    expect(screen.queryByText('Indigo')).toBeNull();
    layout('accent-measure-label', 52);
    layout('accent-measure-chips', 268);
    // 52 + 12 + 268 = 332: a point short (an iPhone 17 Pro's row was about this).
    layout('accent-setting', 331);
    expect(screen.queryByText('Indigo')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    layout('accent-setting', 340);
    expect(screen.getByText('Indigo')).toBeTruthy();
    expect(screen.getByText('Jade')).toBeTruthy();
  });

  it('the label never breaks inside the word, and the unseen measuring copy isn’t read out', async () => {
    await renderV2(<AccentSetting value="indigo" onChange={jest.fn()} />);
    expect(screen.getByText('Accent').props.numberOfLines).toBe(1);
    expect(screen.getAllByText('Accent')).toHaveLength(1);
    expect(screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual(['Indigo', 'Crimson', 'Jade']);
  });
});

describe('Start day at fajr in the new design', () => {
  it('rows like the rest of Settings: ink glyphs, the reset time under the label, the method in a menu', async () => {
    mockApp.user = { fajrBoundaryEnabled: true, locationCoords: { latitude: 51.5, longitude: -0.1 }, fajrCalculationMethod: 'MWL' };
    await renderV2(<FajrBoundaryCard />);
    expect(screen.getByTestId('fajr-boundary-v2')).toBeTruthy();
    expect(screen.getByTestId('icon-moon-outline').props.children).toBe(palette.text);
    expect(flat(screen.getByTestId('fajr-resets-at').props.style).color).toBe(palette.secondary);
    fireEvent.press(screen.getByTestId('fajr-method'));
    await act(async () => {});
    expect(screen.getByTestId('fajr-method-sheet')).toBeTruthy();
    expect(screen.getByTestId('sheet-action-location')).toBeTruthy();
  });
});

describe('the Friday Al-Kahf card in the new design', () => {
  it('is the feed post: no card, Read solid, Mark as read an outline pill', async () => {
    const onRead = jest.fn();
    await renderV2(<KahfPost state="prompt" onRead={onRead} onMarkRead={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('kahf-post')).toBeTruthy();
    expect(flat(screen.getByTestId('kahf-read').props.style).backgroundColor).toBe(palette.primary);
    expect(flat(screen.getByTestId('kahf-mark').props.style)).toMatchObject({ borderWidth: 1 });
    expect(flat(screen.getByTestId('kahf-mark').props.style).backgroundColor).toBeUndefined();
    fireEvent.press(screen.getByTestId('kahf-read'));
    expect(onRead).toHaveBeenCalled();
  });
});
