import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RecordingsList } from '../RecordingsList';
import { RecordButton } from '../RecordButton';
import { ReaderActivity } from '../../reader/ReaderActivity';
import { MIN_BAR_HEIGHT } from '../../v2/AudioWaveform';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DesignProvider } from '../../../design/DesignContext';
import { ACCENTS, AccentName, paletteV2 } from '../../../theme/v2';
import { WAVEFORM_BARS } from '../../../lib/waveform';

// Icons render their name and colour, so a test can read both.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, color, testID }: { name: string; color: string; testID?: string }) => (
      <Text testID={testID ?? `icon-${name}`} style={{ color }}>
        {name}
      </Text>
    ),
  };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('../../../context/ReadingTimerContext', () => ({
  useReadingTimer: () => ({ timer: null }),
  useNow: () => Date.now(),
}));

const mockPlayers: any[] = [];
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: (_src: any, opts: any) => {
    const listeners: Array<(s: any) => void> = [];
    const p: any = {
      opts,
      isLoaded: false,
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

// 10 s then 4 s, recorded here with levels.
const withLevels: any = {
  id: 'r1',
  kind: 'revision',
  day: '2026-10-19',
  createdAt: new Date(2026, 9, 19, 21, 30).getTime(),
  durationMs: 14_000,
  uri: 'file:///doc/r1-0.m4a',
  segments: [
    {
      uri: 'file:///doc/r1-0.m4a',
      durationMs: 10_000,
      fileName: 'r1-0.m4a',
      local: true,
      levels: [10, 40, 90, 60, 20, 80, 30, 50, 70, 15],
    },
    { uri: 'file:///doc/r1-1.m4a', durationMs: 4_000, fileName: 'r1-1.m4a', local: true, levels: [25, 100, 45, 5] },
  ],
  pageMarks: [
    { atMs: 0, page: 5 },
    { atMs: 11_000, page: 6 },
  ],
  sizeBytes: 1000,
  backedUp: false,
};
// The same, restored from the backup on another phone: no levels.
const withoutLevels: any = {
  ...withLevels,
  backedUp: true,
  restored: true,
  segments: withLevels.segments.map(({ levels: _l, ...sg }: any) => sg),
};
let mockListed: any[] = [withLevels];
jest.mock('../../../lib/recordings', () => {
  const actual = jest.requireActual('../../../lib/recordings');
  return {
    ...actual,
    listRecordings: jest.fn(() => Promise.resolve(mockListed)),
    deleteRecording: jest.fn(() => Promise.resolve(1)),
    isRecordingActive: () => false,
  };
});
jest.mock('../../../lib/recordingBackup', () => ({ downloadMissingSegments: jest.fn() }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'u1' } }) }));

const flat = (style: unknown) => StyleSheet.flatten(style as any) ?? {};

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

async function renderV2(ui: React.ReactElement, { dark = false, accent = 'indigo' as AccentName } = {}) {
  await AsyncStorage.setItem('@revisely_theme_v2', dark ? 'dark' : 'light');
  render(
    <DesignProvider initial={{ allowed: true, chosen: 'new', accent }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

const bars = (id = 'r1') => screen.getAllByTestId(`recording-waveform-${id}-bar`).map((b) => flat(b.props.style));

beforeEach(async () => {
  await AsyncStorage.clear();
  mockPlayers.length = 0;
  mockListed = [withLevels];
});

describe('<RecordingsList /> in the new design', () => {
  it('a row per recording: play, waveform, time, page chips and ⋯, by testID', async () => {
    await renderV2(<RecordingsList day="2026-10-19" />);
    expect(screen.getByTestId('recording-r1')).toBeTruthy();
    expect(screen.getByTestId('recording-play-r1').props.accessibilityLabel).toBe('Play recording');
    expect(screen.getByTestId('recording-waveform-r1')).toBeTruthy();
    expect(screen.getByTestId('recording-time-r1')).toHaveTextContent('0:14');
    expect(screen.getByTestId('recording-page-r1-5')).toBeTruthy();
    expect(screen.getByTestId('recording-page-r1-6')).toBeTruthy();
    expect(screen.getByTestId('recording-r1-menu')).toBeTruthy();
    expect(screen.getByText('Revision')).toBeTruthy();
    // No glass card in the new design.
    const { GlassCard } = require('../../GlassCard');
    expect(screen.UNSAFE_queryAllByType(GlassCard)).toHaveLength(0);
  });

  it('draws the recorded levels: bars of different heights, none played yet', async () => {
    const p = paletteV2(false, 'indigo');
    await renderV2(<RecordingsList day="2026-10-19" />);
    expect(screen.getByTestId('recording-waveform-r1-levels')).toBeTruthy();
    const b = bars();
    expect(b).toHaveLength(WAVEFORM_BARS);
    expect(new Set(b.map((s) => s.height)).size).toBeGreaterThan(3);
    expect(Math.max(...b.map((s) => s.height as number))).toBe(28); // the loudest is full height
    expect(b.every((s) => s.backgroundColor === p.track)).toBe(true);
  });

  it('without levels (restored from the backup, or older): flat, never made-up bars', async () => {
    mockListed = [withoutLevels];
    await renderV2(<RecordingsList day="2026-10-19" />);
    expect(screen.getByTestId('recording-waveform-r1-flat')).toBeTruthy();
    expect(screen.queryByTestId('recording-waveform-r1-levels')).toBeNull();
    expect(bars().every((s) => s.height === MIN_BAR_HEIGHT)).toBe(true);
  });

  it('shows playback progress: played bars in the accent, the rest in the track colour', async () => {
    const p = paletteV2(false, 'indigo');
    await renderV2(<RecordingsList day="2026-10-19" />);
    fireEvent.press(screen.getByTestId('recording-play-r1'));
    const player = mockPlayers[0];
    act(() => player.emit({ playing: true, duration: 10, currentTime: 7 }));
    // 7 s of 14: half the bars.
    const b = bars();
    expect(b.filter((s) => s.backgroundColor === p.accentText)).toHaveLength(WAVEFORM_BARS / 2);
    expect(b.slice(WAVEFORM_BARS / 2).every((s) => s.backgroundColor === p.track)).toBe(true);
    expect(screen.getByTestId('recording-time-r1')).toHaveTextContent('0:07 / 0:14');
    expect(screen.getByTestId('recording-play-r1').props.accessibilityLabel).toBe('Pause recording');
    // The chip of the page playing is chosen.
    expect(screen.getByTestId('recording-page-r1-5').props.accessibilityState).toMatchObject({ selected: true });
    // Paused: the button says play again, the progress stays.
    fireEvent.press(screen.getByTestId('recording-play-r1'));
    expect(player.pause).toHaveBeenCalled();
    expect(screen.getByTestId('recording-play-r1').props.accessibilityLabel).toBe('Play recording');
    expect(bars().filter((s) => s.backgroundColor === p.accentText)).toHaveLength(WAVEFORM_BARS / 2);
  });

  it('a tap on the waveform plays from there', async () => {
    await renderV2(<RecordingsList day="2026-10-19" />);
    const wave = screen.getByTestId('recording-waveform-r1');
    fireEvent(wave, 'layout', { nativeEvent: { layout: { width: 200, height: 28, x: 0, y: 0 } } });
    fireEvent(wave, 'responderGrant', { nativeEvent: { locationX: 100 } });
    fireEvent(wave, 'responderRelease', { nativeEvent: { locationX: 100 } });
    const player = mockPlayers[0];
    // 7 s: in the first segment, sought once it has loaded.
    expect(player.replace).toHaveBeenLastCalledWith({ uri: 'file:///doc/r1-0.m4a' });
    act(() => player.emit({ isLoaded: true, duration: 10 }));
    expect(player.seekTo).toHaveBeenCalledWith(7);
  });

  it('a sideways drag scrubs, seeking on release; a touch taken by the scroll seeks nothing', async () => {
    const p = paletteV2(false, 'indigo');
    await renderV2(<RecordingsList day="2026-10-19" />);
    const wave = screen.getByTestId('recording-waveform-r1');
    fireEvent(wave, 'layout', { nativeEvent: { layout: { width: 200, height: 28, x: 0, y: 0 } } });

    // Taken away (a vertical scroll began): nothing plays.
    fireEvent(wave, 'responderGrant', { nativeEvent: { locationX: 20 } });
    expect(wave.props.onResponderTerminationRequest()).toBe(true);
    fireEvent(wave, 'responderTerminate', {});
    expect(mockPlayers).toHaveLength(0);

    fireEvent(wave, 'responderGrant', { nativeEvent: { locationX: 20 } });
    fireEvent(wave, 'responderMove', { nativeEvent: { locationX: 150 } });
    // While scrubbing it shows where it will play from, and keeps the touch.
    expect(bars().filter((s) => s.backgroundColor === p.accentText)).toHaveLength(36);
    expect(wave.props.onResponderTerminationRequest()).toBe(false);
    expect(mockPlayers).toHaveLength(0);
    fireEvent(wave, 'responderRelease', { nativeEvent: { locationX: 150 } });
    // 150/200 of 14 s = 10.5 s: half a second into the second segment.
    const player = mockPlayers[0];
    expect(player.replace).toHaveBeenLastCalledWith({ uri: 'file:///doc/r1-1.m4a' });
    act(() => player.emit({ isLoaded: true, duration: 4 }));
    expect(player.seekTo).toHaveBeenCalledWith(0.5);
  });

  it('VoiceOver adjusts the waveform in steps', async () => {
    await renderV2(<RecordingsList day="2026-10-19" />);
    const wave = screen.getByTestId('recording-waveform-r1');
    expect(wave.props.accessibilityRole).toBe('adjustable');
    expect(wave.props.accessibilityValue).toEqual({ text: '0:00 of 0:14' });
    fireEvent(wave, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    const player = mockPlayers[0];
    act(() => player.emit({ isLoaded: true, duration: 10 }));
    expect(player.seekTo).toHaveBeenCalledWith(1.4);
  });

  const combos = ACCENTS.flatMap((a) => [
    [a, false],
    [a, true],
  ]) as [AccentName, boolean][];

  it.each(combos)('%s (dark %s): the play glyph contrasts with its button (never white on white)', async (accent, dark) => {
    const p = paletteV2(dark, accent);
    await renderV2(<RecordingsList day="2026-10-19" />, { dark, accent });
    const button = flat(screen.getByTestId('recording-play-r1').props.style);
    const glyph = flat(screen.getByTestId('recording-play-icon-r1').props.style);
    expect(button.backgroundColor).toBe(p.primary);
    expect(glyph.color).toBe(p.onPrimary);
    expect(contrast(glyph.color as string, button.backgroundColor as string)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(combos)('%s (dark %s): played and unplayed bars tell apart (3:1)', (accent, dark) => {
    const p = paletteV2(dark, accent);
    expect(contrast(p.accentText, p.track)).toBeGreaterThanOrEqual(3);
    // The recording pill: its contents (the ground's colour) on red.
    expect(contrast(p.bg, p.red)).toBeGreaterThanOrEqual(4.5);
  });

  it('the recording just saved is marked, in tokens (no tinted ground under secondary text)', async () => {
    const p = paletteV2(false, 'crimson');
    await renderV2(<RecordingsList day="2026-10-19" highlightId="r1" />, { accent: 'crimson' });
    expect(flat(screen.getByTestId('highlighted-recording').props.style).backgroundColor).toBe(p.fill);
  });

  it('⋯ → Delete recording asks first, then deletes', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onChanged = jest.fn();
    await renderV2(<RecordingsList day="2026-10-19" onChanged={onChanged} />);
    fireEvent.press(screen.getByTestId('recording-r1-menu'));
    fireEvent.press(screen.getByTestId('sheet-action-delete'));
    // The menu's action runs once it has gone (iOS: onDismiss).
    const { Modal } = jest.requireActual('react-native');
    act(() => {
      screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
    });
    expect(alert).toHaveBeenCalledWith('Delete this recording?', 'It cannot be recovered.', expect.any(Array));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
    mockListed = [];
    await act(async () => {
      await buttons.find((b) => b.text === 'Delete')?.onPress?.();
    });
    const { deleteRecording } = require('../../../lib/recordings');
    expect(deleteRecording).toHaveBeenCalledWith('r1');
    expect(onChanged).toHaveBeenCalled();
    alert.mockRestore();
  });

  it('none: one quiet line under the header, once listed', async () => {
    mockListed = [];
    const { Text } = require('react-native');
    await renderV2(<RecordingsList day="2026-10-19" header={<Text>Recordings</Text>} />);
    expect(screen.getByText('Recordings')).toBeTruthy();
    expect(screen.getByTestId('recordings-none')).toHaveTextContent('No recordings on this day');
    expect(screen.queryByTestId('recording-r1')).toBeNull();
  });
});

describe('recording controls in the new design', () => {
  const recorder = (phase: string, extra: object = {}) =>
    ({
      phase,
      recording: phase === 'recording',
      paused: phase === 'paused',
      interrupted: false,
      baseMs: 65_000,
      segmentStartedAt: phase === 'recording' ? Date.now() : null,
      start: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      finish: jest.fn(),
      ...extra,
    }) as any;
  const button = (r: any) => <RecordButton recorder={r} color="#000000" background="#FFFFFF" border="#CCCCCC" />;

  it.each([false, true])('recording (dark %s): a solid red pill, its contents in the ground colour', async (dark) => {
    const p = paletteV2(dark, 'indigo');
    const r = recorder('recording');
    await renderV2(button(r), { dark });
    expect(flat(screen.getByTestId('record-pill-recording').props.style).backgroundColor).toBe(p.red);
    expect(flat(screen.getByText('1:05').props.style).color).toBe(p.bg);
    fireEvent.press(screen.getByTestId('record-toggle'));
    expect(r.pause).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Stop recording'));
    expect(r.finish).toHaveBeenCalled();
  });

  it('paused: outlined in red; tap the time to resume', async () => {
    const p = paletteV2(false, 'indigo');
    const r = recorder('paused', { interrupted: true });
    await renderV2(button(r));
    const pill = flat(screen.getByTestId('record-pill-paused').props.style);
    expect(pill.borderColor).toBe(p.red);
    expect(flat(screen.getByText('1:05').props.style).color).toBe(p.red);
    const resume = screen.getByLabelText(/Resume recording, 1:05 recorded/);
    expect(resume.props.accessibilityLabel).toMatch(/interruption/);
    fireEvent.press(resume);
    expect(r.resume).toHaveBeenCalled();
  });

  it('idle: a round mic in the palette (the screen’s classic colours are not used)', async () => {
    const p = paletteV2(true, 'indigo');
    const r = recorder('idle');
    await renderV2(button(r), { dark: true });
    const mic = screen.getByTestId('record-start');
    expect(flat(mic.props.style).backgroundColor).toBe(p.fill);
    expect(flat(screen.getByTestId('icon-mic-outline').props.style).color).toBe(p.text);
    fireEvent.press(mic);
    expect(r.start).toHaveBeenCalled();
  });

  it('the reader’s activity chip: a red recording in tokens', async () => {
    const p = paletteV2(true, 'crimson');
    await renderV2(
      <ReaderActivity
        recorder={{ phase: 'recording', baseMs: 83_000, segmentStartedAt: Date.now() }}
        playback={{ status: 'idle', verse: null } as any}
        onPress={jest.fn()}
      />,
      { dark: true, accent: 'crimson' },
    );
    const chip = flat(screen.getByTestId('reader-activity').props.style);
    expect(chip.backgroundColor).toBe(p.fill);
    expect(flat(screen.getByText('1:23').props.style).color).toBe(p.red);
    expect(screen.getByTestId('reader-activity').props.accessibilityLabel).toMatch(/^Recording, 1:23/);
  });
});
