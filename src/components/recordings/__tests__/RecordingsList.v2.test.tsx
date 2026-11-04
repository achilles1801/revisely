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
    <DesignProvider initial={{ accent }}>
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

// The bubble's bars are counted from its width: 200pt holds 33 (3 wide, 3 apart).
const WIDTH = 200;
const COUNT = 33;
const layout = (id = 'r1') =>
  fireEvent(screen.getByTestId(`recording-waveform-${id}`), 'layout', {
    nativeEvent: { layout: { width: WIDTH, height: 24, x: 0, y: 0 } },
  });

describe('<RecordingsList /> as voice bubbles (Variant B)', () => {
  it('a recording: name and time, a bubble (play, bars, length), › to Listen back, page chips; no ⋯', async () => {
    const p = paletteV2(false, 'indigo');
    const onOpen = jest.fn();
    await renderV2(<RecordingsList day="2026-10-19" onOpen={onOpen} />);
    expect(screen.getByTestId('recording-r1')).toBeTruthy();
    expect(screen.getByText('Revision')).toBeTruthy();
    // A rounded bubble on the bubble token, no outline.
    const bubble = flat(screen.getByTestId('recording-bubble-r1').props.style);
    expect(bubble.backgroundColor).toBe(p.bubble);
    expect(bubble.borderRadius).toBe(24);
    expect(bubble.borderWidth ?? 0).toBe(0);
    expect(screen.getByTestId('recording-play-r1').props.accessibilityLabel).toBe('Play recording');
    expect(screen.getByTestId('recording-waveform-r1')).toBeTruthy();
    expect(screen.getByTestId('recording-time-r1')).toHaveTextContent('0:14');
    expect(flat(screen.getByTestId('recording-time-r1').props.style).color).toBe(p.secondary);
    expect(screen.getByTestId('recording-page-r1-5')).toBeTruthy();
    expect(screen.getByTestId('recording-page-r1-6')).toBeTruthy();
    expect(screen.queryByTestId('recording-r1-menu')).toBeNull();
    fireEvent.press(screen.getByTestId('recording-open-r1'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('bars 3 wide and 3 apart, as many as fit; not playing, all in secondary (lighter on white)', async () => {
    const p = paletteV2(false, 'indigo');
    await renderV2(<RecordingsList day="2026-10-19" />);
    layout();
    expect(screen.getByTestId('recording-waveform-r1-levels')).toBeTruthy();
    const b = bars();
    expect(b).toHaveLength(COUNT);
    expect(b.every((s) => s.width === 3)).toBe(true);
    expect(new Set(b.map((s) => s.height)).size).toBeGreaterThan(3);
    // The loudest is 90% of the curve, never past the 24pt maximum.
    expect(Math.max(...b.map((s) => s.height as number))).toBeLessThan(24);
    expect(Math.max(...b.map((s) => s.height as number))).toBeGreaterThan(18);
    expect(b.every((s) => s.backgroundColor === p.secondary && s.opacity === 0.75)).toBe(true);
  });

  it('without levels (restored from the backup, or older): dots in track, never made-up bars', async () => {
    const p = paletteV2(false, 'indigo');
    mockListed = [withoutLevels];
    await renderV2(<RecordingsList day="2026-10-19" />);
    layout();
    expect(screen.getByTestId('recording-waveform-r1-flat')).toBeTruthy();
    expect(bars().every((s) => s.height === MIN_BAR_HEIGHT && s.backgroundColor === p.track)).toBe(true);
  });

  it('in your backup and not on this phone: says it downloads when played', async () => {
    mockListed = [{ ...withoutLevels, segments: withoutLevels.segments.map((sg: any) => ({ ...sg, local: false })) }];
    await renderV2(<RecordingsList day="2026-10-19" />);
    expect(screen.getByText('In your backup · downloads when played')).toBeTruthy();
    expect(screen.getByTestId('recording-cloud-r1')).toBeTruthy();
  });

  it('playing: played bars in text, the rest in track, the time in text; the page playing is filled', async () => {
    const p = paletteV2(false, 'indigo');
    await renderV2(<RecordingsList day="2026-10-19" />);
    layout();
    fireEvent.press(screen.getByTestId('recording-play-r1'));
    const player = mockPlayers[0];
    act(() => player.emit({ playing: true, duration: 10, currentTime: 7 }));
    // 7 s of 14: half the bars (a bar counts once playback has passed its start).
    const b = bars();
    expect(b.filter((s) => s.backgroundColor === p.text)).toHaveLength(17);
    expect(b.slice(17).every((s) => s.backgroundColor === p.track)).toBe(true);
    expect(screen.getByTestId('recording-time-r1')).toHaveTextContent('0:07');
    expect(flat(screen.getByTestId('recording-time-r1').props.style)).toMatchObject({ color: p.text, fontWeight: '600' });
    expect(screen.getByTestId('recording-play-r1').props.accessibilityLabel).toBe('Pause recording');
    const chip = screen.getByTestId('recording-page-r1-5');
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    expect(flat(chip.props.style).backgroundColor).toBe(p.text);
    expect(flat(screen.getByTestId('recording-page-r1-6').props.style).backgroundColor).toBe(p.fill);
    // Paused: the button says play again, the progress stays.
    fireEvent.press(screen.getByTestId('recording-play-r1'));
    expect(player.pause).toHaveBeenCalled();
    expect(screen.getByTestId('recording-play-r1').props.accessibilityLabel).toBe('Play recording');
    expect(bars().filter((s) => s.backgroundColor === p.text)).toHaveLength(17);
  });

  it('a page chip plays from where that page was reached, in the bubble', async () => {
    await renderV2(<RecordingsList day="2026-10-19" />);
    fireEvent.press(screen.getByTestId('recording-page-r1-6'));
    const player = mockPlayers[0];
    // 11 s: one second into the second segment, sought once it has loaded.
    expect(player.replace).toHaveBeenLastCalledWith({ uri: 'file:///doc/r1-1.m4a' });
    act(() => player.emit({ isLoaded: true, duration: 4 }));
    expect(player.seekTo).toHaveBeenCalledWith(1);
  });

  it('a tap on the bars plays from there', async () => {
    await renderV2(<RecordingsList day="2026-10-19" />);
    layout();
    const wave = screen.getByTestId('recording-waveform-r1');
    // The bars span 195 of the 200pt, centred: 100 is half way.
    fireEvent(wave, 'responderGrant', { nativeEvent: { locationX: 100 } });
    fireEvent(wave, 'responderRelease', { nativeEvent: { locationX: 100 } });
    const player = mockPlayers[0];
    expect(player.replace).toHaveBeenLastCalledWith({ uri: 'file:///doc/r1-0.m4a' });
    act(() => player.emit({ isLoaded: true, duration: 10 }));
    expect(player.seekTo).toHaveBeenCalledWith(7);
  });

  it('a sideways drag scrubs, seeking on release; a touch taken by the scroll seeks nothing', async () => {
    const p = paletteV2(false, 'indigo');
    await renderV2(<RecordingsList day="2026-10-19" />);
    layout();
    const wave = screen.getByTestId('recording-waveform-r1');

    // Taken away (a vertical scroll began): nothing plays.
    fireEvent(wave, 'responderGrant', { nativeEvent: { locationX: 20 } });
    expect(wave.props.onResponderTerminationRequest()).toBe(true);
    fireEvent(wave, 'responderTerminate', {});
    expect(mockPlayers).toHaveLength(0);

    fireEvent(wave, 'responderGrant', { nativeEvent: { locationX: 20 } });
    fireEvent(wave, 'responderMove', { nativeEvent: { locationX: 149.75 } });
    // While scrubbing it shows where it will play from, and keeps the touch.
    expect(bars().filter((s) => s.backgroundColor === p.text)).toHaveLength(25);
    expect(wave.props.onResponderTerminationRequest()).toBe(false);
    expect(mockPlayers).toHaveLength(0);
    fireEvent(wave, 'responderRelease', { nativeEvent: { locationX: 149.75 } });
    // (149.75 − 2.5) / 195 of 14 s = 10.57 s: in the second segment.
    const player = mockPlayers[0];
    expect(player.replace).toHaveBeenLastCalledWith({ uri: 'file:///doc/r1-1.m4a' });
    act(() => player.emit({ isLoaded: true, duration: 4 }));
    expect(player.seekTo.mock.calls[0][0]).toBeCloseTo(0.57, 1);
  });

  it('VoiceOver adjusts the bars in steps', async () => {
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

  it.each(combos)('%s (dark %s): the play glyph contrasts with its button (ink, whatever the accent)', async (accent, dark) => {
    const p = paletteV2(dark, accent);
    await renderV2(<RecordingsList day="2026-10-19" />, { dark, accent });
    const button = flat(screen.getByTestId('recording-play-r1').props.style);
    const glyph = flat(screen.getByTestId('recording-play-icon-r1').props.style);
    expect(button.backgroundColor).toBe(p.text);
    expect(glyph.color).toBe(p.bg);
    expect(contrast(glyph.color as string, button.backgroundColor as string)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(combos)('%s (dark %s): played and unplayed bars tell apart; the recorder’s reds read', (accent, dark) => {
    const p = paletteV2(dark, accent);
    expect(contrast(p.text, p.track)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.text, p.bubble)).toBeGreaterThanOrEqual(4.5);
    // The paused pill's time in red on the ground; the stop square on its red.
    expect(contrast(p.red, p.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.onRedFill, p.redFill)).toBeGreaterThanOrEqual(4.5);
  });

  it('the recording just saved: its bubble gets a ring in text', async () => {
    const p = paletteV2(false, 'crimson');
    await renderV2(<RecordingsList day="2026-10-19" highlightId="r1" />, { accent: 'crimson' });
    const bubble = flat(screen.getByTestId('highlighted-recording').props.style);
    expect(bubble).toMatchObject({ borderWidth: 1.5, borderColor: p.text, backgroundColor: p.bubble });
  });

  it('a long press → Delete recording asks first, then deletes', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onChanged = jest.fn();
    await renderV2(<RecordingsList day="2026-10-19" onChanged={onChanged} />);
    fireEvent(screen.getByTestId('recording-r1'), 'longPress');
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

  it('VoiceOver: Delete is an action on the recording', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderV2(<RecordingsList day="2026-10-19" />);
    const head = screen.getByLabelText(/^Revision recording, /);
    expect(head.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete recording' }]);
    fireEvent(head, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(alert).toHaveBeenCalledWith('Delete this recording?', expect.any(String), expect.any(Array));
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

describe('the recorder (Variant B)', () => {
  // The recorder's own readings: the test sends them.
  const levelFeed = () => {
    const listeners = new Set<(l: number) => void>();
    return {
      subscribeLevel: jest.fn((l: (level: number) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      }),
      recentLevels: jest.fn(() => [0.2, 0.6, 0.9]),
      send: (level: number) => act(() => listeners.forEach((l) => l(level))),
      listening: () => listeners.size,
    };
  };
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

  it.each([false, true])('recording (dark %s): the whole capsule, a red dot, the time in ink, live bars, pause, a red stop', async (dark) => {
    const p = paletteV2(dark, 'indigo');
    const feed = levelFeed();
    const r = recorder('recording', feed);
    await renderV2(<RecordButton recorder={r} />, { dark });
    expect(screen.getByTestId('record-pill-recording')).toBeTruthy();
    expect(screen.getByTestId('recorder-dot')).toBeTruthy();
    expect(flat(screen.getByTestId('recorder-time').props.style).color).toBe(p.text);
    expect(screen.getByTestId('recorder-time')).toHaveTextContent('1:05');
    // The bars start from the recorder's recent readings and grow with each new one.
    const hidden = { includeHiddenElements: true };
    fireEvent(screen.getByTestId('recorder-bars', hidden), 'layout', {
      nativeEvent: { layout: { width: 60, height: 26, x: 0, y: 0 } },
    });
    expect(screen.getAllByTestId('recorder-bars-bar', hidden)).toHaveLength(3);
    feed.send(0.7);
    expect(screen.getAllByTestId('recorder-bars-bar', hidden)).toHaveLength(4);
    expect(flat(screen.getAllByTestId('recorder-bars-bar', hidden)[0].props.style).backgroundColor).toBe(p.text);
    // Ten fit in 60pt (one more slides out at the left): never more.
    for (let i = 0; i < 20; i++) feed.send(0.5);
    expect(screen.getAllByTestId('recorder-bars-bar', hidden)).toHaveLength(11);
    const stop = screen.getByTestId('record-stop');
    expect(flat(stop.props.style).backgroundColor).toBe(p.redFill);
    fireEvent.press(screen.getByTestId('record-toggle'));
    expect(r.pause).toHaveBeenCalled();
    fireEvent.press(stop);
    expect(r.finish).toHaveBeenCalled();
  });

  it('beside the timer (crowded): no red dot', async () => {
    await renderV2(<RecordButton recorder={recorder('recording', levelFeed())} crowded />);
    expect(screen.getByTestId('record-pill-recording')).toBeTruthy();
    expect(screen.queryByTestId('recorder-dot')).toBeNull();
  });

  it('saving after Stop: "Saving…", the bars frozen and dim, pause and stop off', async () => {
    const feed = levelFeed();
    await renderV2(<RecordButton recorder={recorder('finishing', feed)} />);
    expect(screen.getByTestId('recorder-saving')).toBeTruthy();
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect(feed.listening()).toBe(0);
    expect(screen.getByTestId('record-toggle').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('record-stop').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('in the hidden mode’s panel (inline): a solid red pill, its contents in the ground colour', async () => {
    const p = paletteV2(false, 'indigo');
    const r = recorder('recording');
    await renderV2(<RecordButton recorder={r} layout="inline" />);
    expect(flat(screen.getByTestId('record-pill-recording').props.style).backgroundColor).toBe(p.red);
    expect(flat(screen.getByText('1:05').props.style).color).toBe(p.bg);
  });

  it('paused: a pill outlined in red; the mic and time resume, the square stops', async () => {
    const p = paletteV2(false, 'indigo');
    const r = recorder('paused', { interrupted: true });
    await renderV2(<RecordButton recorder={r} />);
    expect(screen.getByTestId('record-pill-paused')).toBeTruthy();
    const ring = flat(screen.getByTestId('record-pill-ring').props.style);
    expect(ring).toMatchObject({ borderColor: p.red, borderWidth: 1, opacity: 0.55 });
    expect(flat(screen.getByText('1:05').props.style).color).toBe(p.red);
    const resume = screen.getByLabelText(/Resume recording, 1:05 recorded/);
    expect(resume.props.accessibilityLabel).toMatch(/interruption/);
    fireEvent.press(resume);
    expect(r.resume).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Stop recording'));
    expect(r.finish).toHaveBeenCalled();
  });

  it('idle: a round mic in the palette', async () => {
    const p = paletteV2(true, 'indigo');
    const r = recorder('idle');
    await renderV2(<RecordButton recorder={r} />, { dark: true });
    const mic = screen.getByTestId('record-start');
    expect(flat(mic.props.style).backgroundColor).toBe(p.fill);
    expect(flat(screen.getByTestId('icon-mic-outline').props.style).color).toBe(p.text);
    fireEvent.press(mic);
    expect(r.start).toHaveBeenCalled();
  });

  it('controls hidden, recording: the chip has a red dot, five live bars and the time in ink', async () => {
    const p = paletteV2(true, 'crimson');
    const feed = levelFeed();
    await renderV2(
      <ReaderActivity
        recorder={{ phase: 'recording', baseMs: 83_000, segmentStartedAt: Date.now(), ...feed }}
        playback={{ status: 'idle', verse: null } as any}
        onPress={jest.fn()}
      />,
      { dark: true, accent: 'crimson' },
    );
    const chip = flat(screen.getByTestId('reader-activity').props.style);
    expect(chip).toMatchObject({ backgroundColor: p.fill, height: 24, borderRadius: 12 });
    expect(flat(screen.getByText('1:23').props.style).color).toBe(p.text);
    feed.send(0.5);
    feed.send(0.4);
    feed.send(0.8);
    // Five (and the one sliding out), never more.
    for (let i = 0; i < 10; i++) feed.send(0.6);
    expect(screen.getAllByTestId('reader-activity-bars-bar', { includeHiddenElements: true })).toHaveLength(6);
    expect(screen.getByTestId('reader-activity').props.accessibilityLabel).toMatch(/^Recording, 1:23/);
  });

  it('controls hidden, paused: a hollow dot and the time in grey, no bars', async () => {
    const p = paletteV2(false, 'indigo');
    await renderV2(
      <ReaderActivity
        recorder={{ phase: 'paused', baseMs: 83_000, segmentStartedAt: null }}
        playback={{ status: 'idle', verse: null } as any}
        onPress={jest.fn()}
      />,
    );
    expect(flat(screen.getByText('1:23').props.style).color).toBe(p.secondary);
    expect(screen.queryByTestId('reader-activity-bars')).toBeNull();
  });
});
