import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { RecordingsList } from '../RecordingsList';
import { ThemeProvider } from '../../../context/ThemeContext';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
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

const mockRecording: any = {
  id: 'r1',
  kind: 'revision',
  day: '2026-10-19',
  createdAt: new Date(2026, 9, 19, 21, 30).getTime(),
  durationMs: 14_000,
  uri: 'file:///doc/r1-0.m4a',
  segments: [
    { uri: 'file:///doc/r1-0.m4a', durationMs: 10_000, fileName: 'r1-0.m4a', local: true },
    { uri: 'file:///doc/r1-1.m4a', durationMs: 4_000, fileName: 'r1-1.m4a', local: true },
  ],
  pageMarks: [
    { atMs: 0, page: 5 },
    { atMs: 11_000, page: 6 },
  ],
  sizeBytes: 1000,
  backedUp: false,
};
// The recording listed (a test can swap in one restored from the backup).
let mockListed: any = mockRecording;
jest.mock('../../../lib/recordings', () => {
  const actual = jest.requireActual('../../../lib/recordings');
  return {
    ...actual,
    listRecordings: jest.fn(() => Promise.resolve([mockListed])),
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

const mockDownload = jest.fn();
jest.mock('../../../lib/recordingBackup', () => ({
  downloadMissingSegments: (...args: unknown[]) => mockDownload(...args),
}));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'u1' } }) }));

beforeEach(() => {
  mockPlayers.length = 0;
  mockSetActive.mockClear();
  mockDownload.mockReset();
  mockListed = mockRecording;
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

describe('<RecordingsList /> recordings in the backup', () => {
  // Restored on a new phone: listed, but its audio is only in the backup.
  const restored = {
    ...mockRecording,
    backedUp: true,
    segments: mockRecording.segments.map((sg: any) => ({ ...sg, local: false })),
  };

  it('downloads a restored recording before playing it', async () => {
    mockListed = restored;
    let finish: (v: unknown) => void = () => {};
    mockDownload.mockImplementation(() => new Promise((r) => (finish = r)));
    fireEvent.press(await renderList());
    expect(mockDownload).toHaveBeenCalledWith('u1', restored);
    expect(screen.getByLabelText('Downloading recording')).toBeTruthy();
    expect(mockPlayers).toHaveLength(0);
    // A second tap while it downloads does nothing.
    fireEvent.press(screen.getByLabelText('Downloading recording'));
    expect(mockDownload).toHaveBeenCalledTimes(1);

    await act(async () => finish(mockRecording));
    expect(mockPlayers[0].replace).toHaveBeenLastCalledWith({ uri: 'file:///doc/r1-0.m4a' });
    expect(mockPlayers[0].play).toHaveBeenCalledTimes(1);
  });

  it('says so when the download fails, and can be tried again', async () => {
    mockListed = restored;
    const { Alert } = require('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockDownload.mockRejectedValueOnce(new Error('offline'));
    const button = await renderList();
    await act(async () => {
      fireEvent.press(button);
    });
    expect(alert).toHaveBeenCalledWith('Couldn’t download this recording', expect.any(String));
    expect(mockPlayers).toHaveLength(0);
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    alert.mockRestore();
  });

  it('plays a recording on this phone without downloading', async () => {
    fireEvent.press(await renderList());
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockPlayers[0].play).toHaveBeenCalledTimes(1);
  });

  it('warns that deleting a backed-up recording deletes the backup too', async () => {
    mockListed = { ...mockRecording, backedUp: true };
    const { Alert } = require('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderList();
    fireEvent.press(screen.getByTestId('recording-r1-menu'));
    fireEvent.press(screen.getByTestId('sheet-action-delete'));
    // The menu's action runs once it has gone (iOS: onDismiss).
    const { Modal } = jest.requireActual('react-native');
    act(() => {
      screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
    });
    expect(alert).toHaveBeenCalledWith(
      'Delete this recording?',
      expect.stringContaining('from your backup'),
      expect.any(Array),
    );
    alert.mockRestore();
  });
});
