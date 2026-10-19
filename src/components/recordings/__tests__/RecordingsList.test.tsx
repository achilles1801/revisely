import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { RecordingsList } from '../RecordingsList';
import { ThemeProvider } from '../../../context/ThemeContext';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-glass-effect', () => ({ GlassView: require('react-native').View, isLiquidGlassAvailable: () => false }));
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});

const mockPlayers: any[] = [];
const mockSetActive = jest.fn((_a: boolean) => Promise.resolve());
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: (a: boolean) => mockSetActive(a),
  createAudioPlayer: (_src: any, opts: any) => {
    const listeners: Array<(s: any) => void> = [];
    const p: any = {
      opts,
      replace: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      seekTo: jest.fn(() => Promise.resolve()),
      addListener: (_e: string, l: (s: any) => void) => listeners.push(l),
      emit: (s: any) =>
        listeners.forEach((l) => l({ currentTime: 0, didJustFinish: false, isLoaded: true, ...s })),
    };
    mockPlayers.push(p);
    return p;
  },
}));

const mockRecording = {
  id: 'r1',
  kind: 'revision',
  day: '2026-10-19',
  createdAt: new Date(2026, 9, 19, 21, 30).getTime(),
  durationMs: 14_000,
  uri: 'file:///doc/r1-0.m4a',
  segments: [
    { uri: 'file:///doc/r1-0.m4a', durationMs: 10_000 },
    { uri: 'file:///doc/r1-1.m4a', durationMs: 4_000 },
  ],
  pageMarks: [
    { atMs: 0, page: 5 },
    { atMs: 11_000, page: 6 },
  ],
  sizeBytes: 1000,
};
jest.mock('../../../lib/recordings', () => {
  const actual = jest.requireActual('../../../lib/recordings');
  return {
    ...actual,
    listRecordings: jest.fn(() => Promise.resolve([mockRecording])),
    deleteRecording: jest.fn(() => Promise.resolve(1)),
    isRecordingActive: () => false,
  };
});

const renderList = async () => {
  render(
    <ThemeProvider>
      <RecordingsList day="2026-10-19" />
    </ThemeProvider>,
  );
  return screen.findByLabelText('Play recording');
};

beforeEach(() => {
  mockPlayers.length = 0;
  mockSetActive.mockClear();
});

describe('<RecordingsList /> playback', () => {
  it('plays the segments back to back, keeping the audio session active', async () => {
    fireEvent.press(await renderList());
    const p = mockPlayers[0];
    // Without this, iOS deactivated the session under the loading file (no sound).
    expect(p.opts).toMatchObject({ keepAudioSessionActive: true });
    expect(p.replace).toHaveBeenLastCalledWith({ uri: 'file:///doc/r1-0.m4a' });
    expect(p.play).toHaveBeenCalledTimes(1);

    act(() => p.emit({ playing: true, duration: 10, currentTime: 5 }));
    act(() => p.emit({ didJustFinish: true, currentTime: 10, duration: 10 }));
    expect(p.replace).toHaveBeenLastCalledWith({ uri: 'file:///doc/r1-1.m4a' });
    expect(p.play).toHaveBeenCalledTimes(2);

    act(() => p.emit({ didJustFinish: true, currentTime: 4 }));
    // Never deactivated: deactivating made the next recording fail to start.
    expect(mockSetActive).not.toHaveBeenCalledWith(false);
  });

  it('a page chip plays from that moment, seeking once the file has loaded', async () => {
    await renderList();
    fireEvent.press(screen.getByLabelText('Play from page 6'));
    const p = mockPlayers[0];
    expect(p.replace).toHaveBeenLastCalledWith({ uri: 'file:///doc/r1-1.m4a' });
    expect(p.seekTo).not.toHaveBeenCalled(); // not before it has loaded
    // A status still describing another file (queued before the switch) is ignored.
    act(() => p.emit({ isLoaded: true, duration: 10 }));
    expect(p.seekTo).not.toHaveBeenCalled();
    act(() => p.emit({ isLoaded: true, duration: 4 }));
    expect(p.seekTo).toHaveBeenCalledWith(1); // 11 s on the timeline = 1 s into segment 2
  });

  it('a recitation starting stops playback, leaving the session active', async () => {
    fireEvent.press(await renderList());
    const { claimAudio } = require('../../../lib/audioFocus');
    act(() => claimAudio('recitation', 'reader'));
    expect(mockPlayers[0].pause).toHaveBeenCalled();
    expect(mockSetActive).not.toHaveBeenCalled();
  });

  it('highlights the recording opened from "Recording saved · View"', async () => {
    render(
      <ThemeProvider>
        <RecordingsList day="2026-10-19" highlightId="r1" />
      </ThemeProvider>,
    );
    expect(await screen.findByTestId('highlighted-recording')).toBeTruthy();
  });

  it('shows paused when playback is paused from outside (a call, headphones unplugged)', async () => {
    fireEvent.press(await renderList());
    const p = mockPlayers[0];
    act(() => p.emit({ isLoaded: true, duration: 10, playing: false })); // still starting
    expect(screen.getByLabelText('Pause recording')).toBeTruthy();
    act(() => p.emit({ isLoaded: true, duration: 10, playing: true }));
    act(() => p.emit({ isLoaded: true, duration: 10, playing: false }));
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
  });
});
