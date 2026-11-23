// ATHAN-4: a tap on a prayer's athan notification plays the whole athan, with Stop.
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));

type Response = { notification: { date: number; request: { identifier: string; content: { data: unknown } } } };
let mockLast: Response | null = null;
let mockTap: ((r: Response) => void) | null = null;
jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: jest.fn(async () => mockLast),
  addNotificationResponseReceivedListener: jest.fn((l: (r: Response) => void) => {
    mockTap = l;
    return { remove: jest.fn() };
  }),
}));

let mockStatus: ((s: { didJustFinish?: boolean }) => void) | null = null;
const mockPlayer = {
  replace: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  remove: jest.fn(),
  addListener: jest.fn((_e: string, l: (s: { didJustFinish?: boolean }) => void) => {
    mockStatus = l;
  }),
};
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn(async () => undefined),
  setIsAudioActiveAsync: jest.fn(async () => undefined),
}));

const mockAthan = { enabled: true, voices: [] as unknown[] };
const mockRefresh = jest.fn(async () => undefined);
jest.mock('../../../lib/athan', () => ({
  athanEnabled: () => mockAthan.enabled,
  getAthanCatalog: () => mockAthan.voices,
  refreshAthanCatalog: () => mockRefresh(),
}));

import { AthanOnTap, resetAthanOnTapForTests } from '../AthanOnTap';
import { claimAudio } from '../../../lib/audioFocus';

const FULL = 'https://storage.googleapis.com/revisely-dev.firebasestorage.app/athan/full/makkah.m4a';
const MAKKAH = { id: 'makkah', name: 'Makkah – Sheikh Ali Mulla', full: { url: FULL, seconds: 218, bytes: 1 } };
const NOW = new Date('2026-11-22T12:30:00Z').getTime();
const tap = (over: { athan?: unknown; agoMin?: number; id?: string } = {}): Response => ({
  notification: {
    // iOS: seconds.
    date: (NOW - (over.agoMin ?? 1) * 60000) / 1000,
    request: { identifier: over.id ?? 'prayer-2026-11-22-dhuhr', content: { data: { kind: 'prayer', prayer: 'dhuhr', athan: 'athan' in over ? over.athan : 'makkah' } } },
  },
});
const settle = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});

let appState: ((s: string) => void) | null = null;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, l: (s: string) => void) => {
    appState = l;
    return { remove: jest.fn() };
  }) as never);
  resetAthanOnTapForTests();
  mockLast = null;
  mockTap = null;
  mockStatus = null;
  mockAthan.enabled = true;
  mockAthan.voices = [MAKKAH];
});
afterEach(() => jest.restoreAllMocks());

describe('<AthanOnTap />', () => {
  it('[ATHAN-4] a tap on the athan’s notification plays the voice’s whole athan from its start, under a sheet with Stop', async () => {
    render(<AthanOnTap />);
    await settle();
    expect(screen.queryByTestId('athan-full-stop')).toBeNull();
    act(() => mockTap!(tap()));
    await settle();
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: FULL });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Makkah – Sheikh Ali Mulla')).toBeTruthy();
    fireEvent.press(screen.getByTestId('athan-full-stop'));
    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  it('[ATHAN-4] the tap that opened the app plays it too, once', async () => {
    mockLast = tap();
    const view = render(<AthanOnTap />);
    await settle();
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    // The same notification again (a remount, the listener repeating it): not played twice.
    view.unmount();
    render(<AthanOnTap />);
    await settle();
    act(() => mockTap!(tap()));
    await settle();
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('[ATHAN-4] it ends by itself, and stops when other audio starts or the app goes to the background', async () => {
    render(<AthanOnTap />);
    await settle();
    act(() => mockTap!(tap({ id: 'a' })));
    await settle();
    act(() => mockStatus!({ didJustFinish: true }));
    expect(mockPlayer.pause).not.toHaveBeenCalled();

    act(() => mockTap!(tap({ id: 'b' })));
    await settle();
    act(() => claimAudio('recitation', 'reader'));
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);

    act(() => mockTap!(tap({ id: 'c' })));
    await settle();
    // Control Centre or a banner (inactive) doesn't stop it; leaving the app does.
    act(() => appState!('inactive'));
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    act(() => appState!('background'));
    expect(mockPlayer.pause).toHaveBeenCalledTimes(2);
  });

  it('[ATHAN-4] nothing plays long after the prayer, for the standard tone, for a withdrawn voice, or where the athan isn’t offered', async () => {
    render(<AthanOnTap />);
    await settle();
    act(() => mockTap!(tap({ id: 'late', agoMin: 16 })));
    act(() => mockTap!(tap({ id: 'tone', athan: null })));
    mockAthan.voices = [];
    act(() => mockTap!(tap({ id: 'withdrawn' })));
    await settle();
    mockAthan.voices = [MAKKAH];
    mockAthan.enabled = false;
    act(() => mockTap!(tap({ id: 'store-app' })));
    await settle();
    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(screen.queryByTestId('athan-full-stop')).toBeNull();
  });
});
