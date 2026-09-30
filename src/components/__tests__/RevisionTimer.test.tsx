import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RevisionTimerButton } from '../revision/RevisionTimer';
import { ThemeProvider } from '../../context/ThemeContext';
import { pauseTimer, startTimer, type ActiveReadingTimer } from '../../lib/readingTimer';

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

const T0 = 1_000_000;
const mockTimerApi = {
  timer: null as ActiveReadingTimer | null,
  start: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  finish: jest.fn(),
  discard: jest.fn(),
  notePage: jest.fn(),
  noteRevisedPages: jest.fn(),
};
jest.mock('../../context/ReadingTimerContext', () => ({
  useReadingTimer: () => mockTimerApi,
  // Freeze the clock 12 min 5 s after the timer started.
  useNow: () => 1_000_000 + 12 * 60_000 + 5_000,
}));

function renderButton(onStop = jest.fn()) {
  render(
    <ThemeProvider>
      <RevisionTimerButton onStop={onStop} />
    </ThemeProvider>,
  );
  return onStop;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTimerApi.timer = null;
});

describe('<RevisionTimerButton />', () => {
  it('starts a revision stopwatch in one tap', async () => {
    renderButton();
    fireEvent.press(await screen.findByLabelText('Start revision timer'));
    expect(mockTimerApi.start).toHaveBeenCalledWith('stopwatch', null, 'revision');
  });

  it('shows the live time while running', async () => {
    mockTimerApi.timer = startTimer('stopwatch', null, '2026-09-30', T0, 'revision');
    renderButton();
    expect(await screen.findByText('12:05')).toBeTruthy();
    expect(screen.queryByLabelText('Start revision timer')).toBeNull();
  });

  it('pauses from the controls', async () => {
    mockTimerApi.timer = startTimer('stopwatch', null, '2026-09-30', T0, 'revision');
    renderButton();
    fireEvent.press(await screen.findByLabelText(/Open timer controls/));
    fireEvent.press(screen.getByLabelText('Pause timer'));
    expect(mockTimerApi.pause).toHaveBeenCalled();
  });

  it('offers resume when paused', async () => {
    const running = startTimer('stopwatch', null, '2026-09-30', T0, 'revision');
    mockTimerApi.timer = pauseTimer(running, T0 + 5 * 60_000);
    renderButton();
    fireEvent.press(await screen.findByLabelText(/Timer paused, 5:00/));
    expect(screen.getByText('Paused')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Resume timer'));
    expect(mockTimerApi.resume).toHaveBeenCalled();
  });

  it('stop & save hands off to the screen', async () => {
    mockTimerApi.timer = startTimer('stopwatch', null, '2026-09-30', T0, 'revision');
    const onStop = renderButton();
    fireEvent.press(await screen.findByLabelText(/Open timer controls/));
    fireEvent.press(screen.getByLabelText('Stop and save timer'));
    expect(onStop).toHaveBeenCalled();
  });

  it('asks before discarding', async () => {
    mockTimerApi.timer = startTimer('stopwatch', null, '2026-09-30', T0, 'revision');
    renderButton();
    fireEvent.press(await screen.findByLabelText(/Open timer controls/));
    fireEvent.press(screen.getByLabelText('Discard timer'));
    expect(mockTimerApi.discard).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Confirm discard timer'));
    expect(mockTimerApi.discard).toHaveBeenCalled();
  });
});
