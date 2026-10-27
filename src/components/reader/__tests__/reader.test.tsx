import React from 'react';
import { StatusBar, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../context/ThemeContext';
import { PlayerCapsule, PlayerControls } from '../PlayerCapsule';
import { ReaderActivity } from '../ReaderActivity';
import { ReaderFrame, READER_HEADER_HEIGHT } from '../ReaderFrame';
import { useReaderChrome } from '../useReaderChrome';
import { TimerChip } from '../../timer/TimerChip';
import { RunningTimerChip } from '../../timer/RunningTimerChip';
import type { ActiveReadingTimer } from '../../../lib/readingTimer';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
const mockInsets = { top: 59, bottom: 34, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => {
  const actual = require('react-native-safe-area-context/jest/mock').default;
  return { ...actual, useSafeAreaInsets: () => mockInsets };
});
const mockTimer: { timer: ActiveReadingTimer | null } = { timer: null };
jest.mock('../../../context/ReadingTimerContext', () => ({
  useReadingTimer: () => ({
    timer: mockTimer.timer,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    finish: jest.fn(),
    discard: jest.fn(),
    notePage: jest.fn(),
    noteRevisedPages: jest.fn(),
  }),
  useNow: () => 1_000_000 + 65_000,
}));
jest.mock('../../../navigation/navigationRef', () => ({ navigateToActivityDay: jest.fn() }));

const withTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);
const hidden = { includeHiddenElements: true };

const controls = (over: Partial<PlayerControls> = {}): PlayerControls => ({
  state: { status: 'idle', verse: null },
  voiceName: 'Husary · Muallim',
  onPlayPage: jest.fn(),
  onPause: jest.fn(),
  onResume: jest.fn(),
  onStop: jest.fn(),
  onPickReciter: jest.fn(),
  ...over,
});

describe('<PlayerCapsule />', () => {
  it('idle: ▶ recites from the top of the page; the reciter opens the picker', async () => {
    const player = controls();
    withTheme(<PlayerCapsule player={player} page={3} />);
    fireEvent.press(await screen.findByLabelText('Play from this page'));
    expect(player.onPlayPage).toHaveBeenCalledWith(3);
    expect(screen.getByText('Husary · Muallim')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/Choose reciter/));
    expect(player.onPickReciter).toHaveBeenCalled();
    expect(screen.queryByLabelText('Stop')).toBeNull();
  });

  it('reciting: the verse, stop, previous, pause, next', async () => {
    const player = controls({
      state: { status: 'playing', verse: { sura: 2, ayah: 57 } },
      onPrevious: jest.fn(),
      onNext: jest.fn(),
    });
    withTheme(<PlayerCapsule player={player} page={3} />);
    expect(await screen.findByText(/2:57/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pause'));
    expect(player.onPause).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Previous verse'));
    fireEvent.press(screen.getByLabelText('Next verse'));
    expect(player.onPrevious).toHaveBeenCalled();
    expect(player.onNext).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Stop'));
    expect(player.onStop).toHaveBeenCalled();
    expect(screen.queryByLabelText('Play from this page')).toBeNull();
  });

  it('paused: play resumes; at the edge of the range previous / next are disabled', async () => {
    const player = controls({ state: { status: 'paused', verse: { sura: 1, ayah: 1 } } });
    withTheme(<PlayerCapsule player={player} page={1} />);
    fireEvent.press(await screen.findByLabelText('Play'));
    expect(player.onResume).toHaveBeenCalled();
    expect(screen.getByLabelText('Previous verse').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('compact (a narrow phone with a recording or timer): no previous / next', async () => {
    const player = controls({ state: { status: 'playing', verse: { sura: 2, ayah: 57 } }, onNext: jest.fn() });
    withTheme(<PlayerCapsule player={player} page={3} compact />);
    expect(await screen.findByLabelText('Pause')).toBeTruthy();
    expect(screen.queryByLabelText('Next verse')).toBeNull();
  });

  it('carries the record control, the timer and a trailing action', async () => {
    withTheme(
      <PlayerCapsule
        player={controls()}
        page={3}
        record={<Text>REC</Text>}
        timer={<Text>TIMER</Text>}
        trailing={<Text>SUBMIT</Text>}
      />,
    );
    expect(await screen.findByText('REC')).toBeTruthy();
    expect(screen.getByText('TIMER')).toBeTruthy();
    expect(screen.getByText('SUBMIT')).toBeTruthy();
  });

  it('says when a recitation could not play', async () => {
    withTheme(<PlayerCapsule player={controls({ state: { status: 'error', verse: { sura: 2, ayah: 1 } } })} page={2} />);
    expect(await screen.findByText(/Couldn’t play/)).toBeTruthy();
    expect(screen.getByLabelText('Retry')).toBeTruthy();
  });
});

describe('<ReaderActivity />', () => {
  const idleRecorder = { phase: 'idle' as const, baseMs: 0, segmentStartedAt: null };
  const idle = { status: 'idle' as const, verse: null };

  it('shows nothing when nothing is running', async () => {
    withTheme(<ReaderActivity recorder={idleRecorder} playback={idle} onPress={jest.fn()} />);
    await act(async () => {});
    expect(screen.queryByTestId('reader-activity')).toBeNull();
  });

  it('a recording: a red dot and its time; tapping shows the controls', async () => {
    const onPress = jest.fn();
    withTheme(
      <ReaderActivity recorder={{ phase: 'paused', baseMs: 83_000, segmentStartedAt: null }} playback={idle} onPress={onPress} />,
    );
    expect(await screen.findByText('1:23')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/Recording paused, 1:23/));
    expect(onPress).toHaveBeenCalled();
  });

  it('a running timer: its clock', async () => {
    mockTimer.timer = {
      mode: 'stopwatch',
      targetSeconds: null,
      startedAt: 1_000_000,
      runningSince: 1_000_000,
      accumulatedMs: 0,
      date: '2026-10-26',
      pagesVisited: [],
    };
    withTheme(<ReaderActivity recorder={idleRecorder} playback={idle} onPress={jest.fn()} />);
    expect(await screen.findByText('1:05')).toBeTruthy();
    expect(screen.getByLabelText(/Timer running, 1:05/)).toBeTruthy();
    mockTimer.timer = null;
  });

  it('a recitation: its verse', async () => {
    withTheme(
      <ReaderActivity recorder={idleRecorder} playback={{ status: 'playing', verse: { sura: 2, ayah: 255 } }} onPress={jest.fn()} />,
    );
    expect(await screen.findByText('2:255')).toBeTruthy();
    expect(screen.getByLabelText(/Reciting 2:255/)).toBeTruthy();
  });
});

describe('<ReaderFrame />', () => {
  const frame = (visible: boolean) => (
    <ReaderFrame
      chromeVisible={visible}
      background="#000"
      isDark
      header={<Text>HEADER</Text>}
      quietHeader={<Text>Juz 1</Text>}
      footer={<Text>FOOTER</Text>}
      footerHeight={100}
      pageLabel={<Text>3</Text>}
      activity={<Text>ACTIVITY</Text>}
    >
      <Text>PAGE</Text>
    </ReaderFrame>
  );
  const statusBar = () => screen.UNSAFE_getByType(StatusBar).props;

  it('reading: the quiet header and page number, no status bar; the controls hidden and untouchable', async () => {
    withTheme(frame(false));
    expect(await screen.findByText('Juz 1')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('ACTIVITY')).toBeTruthy();
    expect(screen.queryByText('HEADER')).toBeNull(); // hidden from screen readers
    expect(screen.getByTestId('reader-header', hidden).props.pointerEvents).toBe('none');
    expect(screen.getByTestId('reader-footer', hidden).props.pointerEvents).toBe('none');
    expect(statusBar().hidden).toBe(true);
  });

  it('with the controls: header and footer, the status bar; the quiet layer out of the way', async () => {
    withTheme(frame(true));
    expect(await screen.findByText('HEADER')).toBeTruthy();
    expect(screen.getByText('FOOTER')).toBeTruthy();
    expect(screen.queryByText('Juz 1')).toBeNull();
    expect(screen.getByTestId('reader-quiet-footer', hidden).props.pointerEvents).toBe('none');
    expect(statusBar().hidden).toBe(false);
  });

  it('keeps the room for the controls in both states, so the page never moves', async () => {
    const pageArea = () => StyleSheet.flatten(screen.getByText('PAGE').parent!.parent!.props.style);
    const view = withTheme(frame(false));
    await act(async () => {});
    const reading = pageArea();
    expect(reading).toMatchObject({ top: 59 + READER_HEADER_HEIGHT, bottom: 34 + 100 });
    view.rerender(<ThemeProvider>{frame(true)}</ThemeProvider>);
    expect(pageArea()).toMatchObject({ top: reading.top, bottom: reading.bottom });
  });

  it('hiding the status bar (no notch: the top inset drops) does not move the page', async () => {
    mockInsets.top = 20;
    const view = withTheme(frame(true));
    await act(async () => {});
    mockInsets.top = 0;
    view.rerender(<ThemeProvider>{frame(false)}</ThemeProvider>);
    const style = StyleSheet.flatten(screen.getByText('PAGE').parent!.parent!.props.style);
    expect(style.top).toBe(20 + READER_HEADER_HEIGHT);
    mockInsets.top = 59;
  });
});

describe('<ReaderFrame /> around the page', () => {
  const frame = (props: Partial<React.ComponentProps<typeof ReaderFrame>>) => (
    <ReaderFrame
      chromeVisible={false}
      background="#000"
      isDark
      header={<Text>HEADER</Text>}
      quietHeader={<Text>Juz 1</Text>}
      footer={<Text>FOOTER</Text>}
      footerHeight={60}
      pageLabel={<Text>3</Text>}
      {...props}
    >
      <Text>PAGE</Text>
    </ReaderFrame>
  );

  it('sets the status bar only while its screen is focused (it is app-wide)', async () => {
    withTheme(frame({ active: false }));
    await act(async () => {});
    expect(screen.UNSAFE_queryAllByType(StatusBar)).toHaveLength(0);
  });

  it('a tap above or below the page toggles the controls too', async () => {
    const onBackgroundPress = jest.fn();
    withTheme(frame({ onBackgroundPress }));
    fireEvent.press(await screen.findByTestId('reader-background'));
    expect(onBackgroundPress).toHaveBeenCalled();
  });

  it('shows a hint under the page number while reading', async () => {
    withTheme(frame({ hint: <Text>Tap the page for the controls</Text> }));
    expect(await screen.findByText('Tap the page for the controls')).toBeTruthy();
  });
});

describe('useReaderChrome', () => {
  it('reading by default; tap toggles; swipe hides; locked keeps them up', () => {
    const { result, rerender } = renderHook(({ locked }: { locked: boolean }) => useReaderChrome({ locked }), {
      initialProps: { locked: false },
    });
    expect(result.current.visible).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.visible).toBe(true);
    act(() => result.current.hide());
    expect(result.current.visible).toBe(false);
    rerender({ locked: true });
    expect(result.current.visible).toBe(true);
    // Taps and swipes while locked change nothing...
    act(() => result.current.toggle());
    act(() => result.current.hide());
    // ...and when it lets go, they stay up (the user is using them).
    rerender({ locked: false });
    expect(result.current.visible).toBe(true);
  });
});

describe('<TimerChip />', () => {
  beforeEach(() => {
    mockTimer.timer = null;
  });

  it('idle: a stopwatch that opens the timer controls', async () => {
    withTheme(<TimerChip />);
    fireEvent.press(await screen.findByLabelText('Open timer'));
    expect(await screen.findByLabelText('Start timer')).toBeTruthy();
  });

  it('"Open the Quran" closes the sheet first', async () => {
    mockTimer.timer = {
      mode: 'stopwatch',
      targetSeconds: null,
      startedAt: 1_000_000,
      runningSince: 1_000_000,
      accumulatedMs: 0,
      date: '2026-10-26',
      pagesVisited: [],
    };
    const onOpenQuran = jest.fn();
    withTheme(<TimerChip onOpenQuran={onOpenQuran} />);
    fireEvent.press(await screen.findByLabelText(/Timer running/));
    fireEvent.press(await screen.findByText('Open the Quran'));
    expect(onOpenQuran).toHaveBeenCalled();
    expect(screen.queryByText('Open the Quran')).toBeNull();
  });

  it('running: the live clock', async () => {
    mockTimer.timer = {
      mode: 'stopwatch',
      targetSeconds: null,
      startedAt: 1_000_000,
      runningSince: 1_000_000,
      accumulatedMs: 0,
      date: '2026-10-26',
      pagesVisited: [],
    };
    withTheme(<TimerChip />);
    expect(await screen.findByLabelText(/Timer running, 1:05/)).toBeTruthy();
  });
});

describe('<RunningTimerChip /> (Home in the new design, which has no floating timer)', () => {
  beforeEach(() => {
    mockTimer.timer = null;
  });

  it('shows nothing until a timer runs, then its clock, opening the controls', async () => {
    const { unmount } = withTheme(<RunningTimerChip />);
    expect(screen.queryByLabelText('Open timer')).toBeNull();
    expect(screen.queryByLabelText(/Timer running/)).toBeNull();
    unmount();

    mockTimer.timer = {
      mode: 'stopwatch',
      targetSeconds: null,
      startedAt: 1_000_000,
      runningSince: 1_000_000,
      accumulatedMs: 0,
      date: '2026-10-26',
      pagesVisited: [],
    };
    withTheme(<RunningTimerChip />);
    fireEvent.press(await screen.findByLabelText(/Timer running/));
    expect(await screen.findByLabelText('Discard timer')).toBeTruthy();
  });
});
