import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ListenBackScreen from '../ListenBackScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});

let mockParams: { recordingId: string; fromMs?: number } = { recordingId: 'r1' };
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => mockNavigation,
    useRoute: () => ({ key: 'ListenBack-1', name: 'ListenBack', params: mockParams }),
    useIsFocused: () => true,
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

// The pager: the test reads its pages, swipes it and sees where it was turned.
const mockPager: {
  pages?: number[];
  initialPage?: number;
  onPageChange?: (p: number) => void;
  onUserSwipe?: () => void;
  scrolled: number[];
} = { scrolled: [] };
jest.mock('../../../components/MushafPager', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    MushafPager: React.forwardRef(
      (
        props: { pages: number[]; initialPage?: number; onPageChange?: (p: number) => void; onUserSwipe?: () => void },
        ref: React.Ref<unknown>,
      ) => {
        mockPager.pages = props.pages;
        mockPager.initialPage = props.initialPage;
        mockPager.onPageChange = props.onPageChange;
        mockPager.onUserSwipe = props.onUserSwipe;
        React.useImperativeHandle(ref, () => ({
          scrollToPage: (p: number) => {
            mockPager.scrolled.push(p);
            props.onPageChange?.(p);
            return true;
          },
        }));
        return <View testID="mushaf" />;
      },
    ),
  };
});

const mockPlayers: any[] = [];
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: (_src: any, opts: any) => {
    const listeners: Array<(s: any) => void> = [];
    const p: any = {
      opts,
      isLoaded: true,
      replace: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      seekTo: jest.fn(() => Promise.resolve()),
      addListener: (_e: string, l: (s: any) => void) => listeners.push(l),
      emit: (s: any) => listeners.forEach((l) => l({ currentTime: 0, didJustFinish: false, isLoaded: true, ...s })),
    };
    mockPlayers.push(p);
    return p;
  },
}));

// One 90 s segment: p. 12 for 30 s, p. 13 for 30 s, then p. 12 again.
const mockRecording: any = {
  id: 'r1',
  kind: 'revision',
  day: '2026-11-03',
  createdAt: new Date(2026, 10, 3, 6, 15).getTime(),
  durationMs: 90_000,
  uri: 'file:///doc/r1-0.m4a',
  segments: [{ uri: 'file:///doc/r1-0.m4a', durationMs: 90_000, fileName: 'r1-0.m4a', local: true }],
  pageMarks: [
    { atMs: 0, page: 12 },
    { atMs: 30_000, page: 13 },
    { atMs: 60_000, page: 12 },
  ],
  sizeBytes: 1000,
  backedUp: false,
};
let mockListed: any[] = [mockRecording];
jest.mock('../../../lib/recordings', () => {
  const actual = jest.requireActual('../../../lib/recordings');
  return {
    ...actual,
    listRecordings: jest.fn(() => Promise.resolve(mockListed)),
    isRecordingActive: () => false,
  };
});
jest.mock('../../../lib/recordingBackup', () => ({ downloadMissingSegments: jest.fn() }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'u1' } }) }));

async function open(params: { recordingId: string; fromMs?: number } = { recordingId: 'r1' }) {
  mockParams = params;
  render(<ListenBackScreen />);
  await act(async () => {});
  return mockPlayers[0];
}
// The player reports its time (seconds into the one segment).
const at = (p: any, seconds: number) => act(() => p.emit({ playing: true, duration: 90, currentTime: seconds }));
const swipeTo = (page: number) =>
  act(() => {
    mockPager.onUserSwipe?.();
    mockPager.onPageChange?.(page);
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayers.length = 0;
  mockPager.scrolled = [];
  mockListed = [mockRecording];
});

describe('ListenBackScreen', () => {
  it('the recording’s pages, once each in mushaf order; plays from the start', async () => {
    const p = await open();
    expect(mockPager.pages).toEqual([12, 13]);
    expect(mockPager.initialPage).toBe(12);
    expect(p.replace).toHaveBeenCalledWith({ uri: 'file:///doc/r1-0.m4a' });
    expect(p.play).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Listen back')).toBeTruthy();
    expect(screen.getByTestId('listen-back-page')).toHaveTextContent(/^Revision · .* · p\. 12$/);
    expect(screen.getByLabelText('Pause recording')).toBeTruthy();
  });

  it('opened from a page chip: at that page, playing from that moment', async () => {
    const p = await open({ recordingId: 'r1', fromMs: 30_000 });
    expect(mockPager.initialPage).toBe(13);
    // Seeks once the file has loaded.
    act(() => p.emit({ isLoaded: true, duration: 90 }));
    expect(p.seekTo).toHaveBeenCalledWith(30);
  });

  it('the page turns with the recording', async () => {
    const p = await open();
    await at(p, 10);
    expect(mockPager.scrolled).toEqual([]);
    await at(p, 31);
    expect(mockPager.scrolled).toEqual([13]);
    expect(screen.getByTestId('listen-back-page')).toHaveTextContent(/p\. 13$/);
    await at(p, 61);
    expect(mockPager.scrolled).toEqual([13, 12]);
  });

  it('a swipe to a page plays from where it was recited, and the page stays (no jump back)', async () => {
    const p = await open();
    await at(p, 5);
    await swipeTo(13);
    expect(p.seekTo).toHaveBeenLastCalledWith(30);
    // A report from before the seek took effect turns nothing back.
    await at(p, 5.25);
    expect(mockPager.scrolled).toEqual([]);
    await at(p, 30.25);
    expect(mockPager.scrolled).toEqual([]);
    expect(screen.getByText('0:30 / 1:30')).toBeTruthy();
  });

  it('paused, a swipe moves the time there without playing; Play starts there', async () => {
    const p = await open();
    await at(p, 40);
    fireEvent.press(screen.getByLabelText('Pause recording'));
    expect(p.pause).toHaveBeenCalled();
    const plays = p.play.mock.calls.length;
    // On p. 13 (0:40), back to p. 12: its last stretch before, from 0:00.
    await swipeTo(12);
    expect(p.play).toHaveBeenCalledTimes(plays);
    expect(screen.getByText('0:00 / 1:30')).toBeTruthy();
    // The paused player reporting its own time doesn't undo the move.
    act(() => p.emit({ playing: false, duration: 90, currentTime: 40 }));
    expect(screen.getByText('0:00 / 1:30')).toBeTruthy();
    // Forward to p. 13 again: its next stretch is past 0:00, 0:30.
    await swipeTo(13);
    expect(screen.getByText('0:30 / 1:30')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Play recording'));
    expect(p.play).toHaveBeenCalledTimes(plays + 1);
    expect(p.seekTo).toHaveBeenLastCalledWith(30);
  });

  it('paused, the page doesn’t follow the time', async () => {
    const p = await open();
    fireEvent.press(screen.getByLabelText('Pause recording'));
    act(() => p.emit({ playing: false, duration: 90, currentTime: 35 }));
    expect(mockPager.scrolled).toEqual([]);
  });

  it('the bar: a tick where each page turned, the time, and the speed', async () => {
    const { paletteLight } = require('../../../theme/v2');
    await open();
    const { StyleSheet } = require('react-native');
    expect(StyleSheet.flatten(screen.getByTestId('listen-back-bar').props.style).backgroundColor).toBe(paletteLight.bubble);
    fireEvent(screen.getByTestId('listen-back-waveform'), 'layout', {
      nativeEvent: { layout: { width: 201, height: 26, x: 0, y: 0 } },
    });
    // Page turns at 0:30 and 1:00 of 1:30 (none at the start).
    const ticks = screen.getAllByTestId('listen-back-waveform-tick').map((t) => StyleSheet.flatten(t.props.style).left);
    expect(ticks).toHaveLength(2);
    expect(ticks[0]).toBeCloseTo(201 / 3 - 0.5, 0);
    expect(screen.getByTestId('listen-back-time')).toHaveTextContent('0:00 / 1:30');
    expect(screen.getByLabelText('Speed 1×. Change speed')).toBeTruthy();
  });

  it('the speed chip: a menu of speeds, applied to the player without changing the pitch', async () => {
    const p = await open();
    fireEvent.press(screen.getByLabelText('Speed 1×. Change speed'));
    // measureInWindow isn't run in tests; the menu opens from its callback.
    expect(screen.getByLabelText('Speed 1×. Change speed')).toBeTruthy();
    p.setPlaybackRate = jest.fn();
    const { SpeedMenu } = require('../../../components/reader/SpeedMenu');
    const menu = screen.UNSAFE_getByType(SpeedMenu);
    act(() => menu.props.onChange(1.5));
    expect(p.setPlaybackRate).toHaveBeenCalledWith(1.5, 'high');
    expect(p.shouldCorrectPitch).toBe(true);
    expect(screen.getByLabelText('Speed 1.5×. Change speed')).toBeTruthy();
  });

  it('Back leaves', async () => {
    await open();
    fireEvent.press(screen.getByLabelText('Back'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('a recording no longer on the phone says so, and plays nothing', async () => {
    mockListed = [];
    await open({ recordingId: 'gone' });
    expect(screen.getByTestId('listen-back-missing')).toBeTruthy();
    expect(mockPlayers).toHaveLength(0);
    expect(screen.queryByTestId('mushaf')).toBeNull();
  });
});
