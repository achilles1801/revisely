import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatStopwatch, type ActiveReadingTimer } from '../../../lib/readingTimer';

jest.mock('@expo/vector-icons', () => {
  const { Text: T } = require('react-native');
  return { Ionicons: ({ name, color }: { name: string; color?: string }) => <T testID={`icon-${name}`} style={{ color }} /> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// Any glass card the controls render shows up as this.
jest.mock('../../GlassCard', () => {
  const { View } = require('react-native');
  return { GlassCard: () => <View testID="glass-card" /> };
});
jest.mock('../../../navigation/navigationRef', () => ({ navigateToActivityDay: jest.fn() }));

const mockTimer: { timer: ActiveReadingTimer | null } = { timer: null };
const mockActions = {
  start: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  finish: jest.fn(async () => true),
  discard: jest.fn(),
};
jest.mock('../../../context/ReadingTimerContext', () => ({
  useReadingTimer: () => ({
    timer: mockTimer.timer,
    ...mockActions,
    notePage: jest.fn(),
    noteRevisedPages: jest.fn(),
  }),
  useNow: () => 1_000_000 + 65_000,
}));

import * as Haptics from 'expo-haptics';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { TimerControls } from '../TimerControls';
import { TimerChip } from '../TimerChip';
import { paletteV2, DEFAULT_ACCENT } from '../../../theme/v2';

// The new design starts on Indigo (no account here to say otherwise).
const palette = paletteV2(false, DEFAULT_ACCENT);

const v2 = (ui: React.ReactElement) =>
  render(
    <DesignProvider initial={{ allowed: true, chosen: 'new' }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </DesignProvider>,
  );

const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));

const running = (over: Partial<ActiveReadingTimer> = {}): ActiveReadingTimer => ({
  mode: 'stopwatch',
  targetSeconds: null,
  startedAt: 1_000_000,
  runningSince: 1_000_000,
  accumulatedMs: 0,
  date: '2026-10-26',
  pagesVisited: [],
  ...over,
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockTimer.timer = null;
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

describe('<TimerControls /> in the new design', () => {
  it('idle: Stopwatch and Timer as pills, Start a solid pill in the primary colour, no glass', async () => {
    v2(<TimerControls onClose={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('timer-controls-v2')).toBeTruthy();
    expect(screen.getByTestId('pill-stopwatch')).toBeTruthy();
    expect(screen.getByTestId('pill-timer')).toBeTruthy();
    expect(screen.queryByTestId('glass-card')).toBeNull();
    // The clock in ink.
    expect(screen.getByTestId('timer-clock').props.children).toBe(formatStopwatch(0));
    expect(flat(screen.getByTestId('timer-clock').props.style).color).toBe(palette.text);
    const start = screen.getByTestId('timer-start');
    expect(flat(start.props.style).backgroundColor).toBe(palette.primary);
    fireEvent.press(screen.getByLabelText('Start timer'));
    expect(mockActions.start).toHaveBeenCalledWith('stopwatch', null);
  });

  it('a timer: presets as pills (the chosen one solid), a stepper, and the clock direction; Start passes them on', async () => {
    v2(<TimerControls onClose={jest.fn()} />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('pill-timer'));
    expect(screen.getByTestId('timer-setup')).toBeTruthy();
    expect(screen.getByText('Length')).toBeTruthy();
    expect(screen.getByText('Clock')).toBeTruthy();
    // 30 minutes is chosen to begin with.
    expect(flat(screen.getByTestId('timer-preset-30').props.style).backgroundColor).toBe(palette.primary);
    expect(flat(screen.getByTestId('timer-preset-45').props.style).backgroundColor).toBeUndefined();
    expect(screen.getByText('1h 30m')).toBeTruthy();
    // The ring: a separator track, the primary colour for progress.
    expect(screen.getByTestId('timer-ring')).toBeTruthy();
    fireEvent.press(screen.getByTestId('timer-preset-45'));
    fireEvent.press(screen.getByLabelText('5 minutes more'));
    expect(screen.getByTestId('timer-minutes').props.children).toEqual([50, ' min']);
    expect(flat(screen.getByTestId('timer-plus').props.style).borderColor).toBe(palette.outline);
    fireEvent.press(screen.getByTestId('pill-countUp'));
    fireEvent.press(screen.getByLabelText('Start timer'));
    expect(mockActions.start).toHaveBeenCalledWith('countUp', 50 * 60);
    expect(screen.queryByTestId('glass-card')).toBeNull();
  });

  it('running: Pause (outline) and End (solid); End saves, marks it with a haptic and closes', async () => {
    mockTimer.timer = running();
    const onClose = jest.fn();
    const onSaved = jest.fn();
    v2(<TimerControls onClose={onClose} onSaved={onSaved} onOpenQuran={jest.fn()} />);
    await act(async () => {});
    // No kind tabs once it runs.
    expect(screen.queryByTestId('pill-stopwatch')).toBeNull();
    expect(flat(screen.getByTestId('timer-end').props.style).backgroundColor).toBe(palette.primary);
    expect(flat(screen.getByTestId('timer-pause').props.style).backgroundColor).toBeUndefined();
    expect(screen.getByText('Open the Quran')).toBeTruthy();
    expect(flat(screen.getByText('Discard session').props.style).color).toBe(palette.red);
    fireEvent.press(screen.getByLabelText('Pause timer'));
    expect(mockActions.pause).toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Stop and save timer'));
    });
    expect(mockActions.finish).toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('s');
    expect(onClose).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith('2026-10-26', expect.any(Number));
  });

  it('paused: Resume, and "Paused" under the clock', async () => {
    mockTimer.timer = running({ runningSince: null, accumulatedMs: 65_000 });
    v2(<TimerControls onClose={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByText('Paused')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Resume timer'));
    expect(mockActions.resume).toHaveBeenCalled();
  });

  it('Discard asks first, then discards and closes', async () => {
    mockTimer.timer = running();
    const onClose = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    v2(<TimerControls onClose={onClose} />);
    await act(async () => {});
    fireEvent.press(screen.getByLabelText('Discard timer'));
    expect(alert).toHaveBeenCalledWith('Discard this session?', expect.any(String), expect.any(Array));
    expect(mockActions.discard).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe('<TimerChip /> in the new design', () => {
  it('idle: a bare stopwatch in ink that opens the controls', async () => {
    v2(<TimerChip />);
    await act(async () => {});
    const chip = screen.getByTestId('timer-chip-idle');
    expect(flat(chip.props.style).backgroundColor).toBeUndefined();
    expect(flat(screen.getByTestId('icon-stopwatch-outline').props.style).color).toBe(palette.text);
    fireEvent.press(screen.getByLabelText('Open timer'));
    expect(await screen.findByTestId('timer-controls-v2')).toBeTruthy();
    expect(screen.getByLabelText('Start timer')).toBeTruthy();
  });

  it('running: the clock in the accent on its tint', async () => {
    mockTimer.timer = running();
    v2(<TimerChip />);
    expect(await screen.findByLabelText(/Timer running, 1:05/)).toBeTruthy();
    expect(flat(screen.getByTestId('timer-chip-running').props.style).backgroundColor).toBe(palette.accentSubtle);
    expect(flat(screen.getByTestId('timer-chip-clock').props.style).color).toBe(palette.accentText);
  });

  it('paused: the clock in ink on the quiet fill', async () => {
    mockTimer.timer = running({ runningSince: null, accumulatedMs: 65_000 });
    v2(<TimerChip />);
    expect(await screen.findByLabelText(/Timer paused/)).toBeTruthy();
    expect(flat(screen.getByTestId('timer-chip-paused').props.style).backgroundColor).toBe(palette.fill);
    expect(flat(screen.getByTestId('timer-chip-clock').props.style).color).toBe(palette.text);
  });
});
