import React from 'react';
import { Alert, Keyboard, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FloatingTimer } from '../timer/FloatingTimer';
import { FloatingTimerProvider, useFloatingTimerOffset } from '../timer/floatingTimerOffset';
import { ThemeProvider } from '../../context/ThemeContext';
import { pauseTimer, startTimer, type ActiveReadingTimer } from '../../lib/readingTimer';
import { spacing } from '../../theme/spacing';

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
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// The focused route (what the timer reads) and the route of the screen that
// asks for an offset (useRoute) are separate, like in the app.
const mockRoute = { key: 'Dashboard-1', name: 'Dashboard' };
const mockScreenRoute = { key: 'Dashboard-1' };
jest.mock('@react-navigation/native', () => ({ useRoute: () => mockScreenRoute }));

const mockNavigate = jest.fn();
jest.mock('../../navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => true,
    getCurrentRoute: () => mockRoute,
    addListener: () => () => {},
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
  navigateToActivityDay: jest.fn(),
}));

const T0 = 1_000_000;
const mockTimerApi = {
  timer: null as ActiveReadingTimer | null,
  start: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  finish: jest.fn(() => Promise.resolve(true)),
  discard: jest.fn(),
  notePage: jest.fn(),
  noteRevisedPages: jest.fn(),
};
jest.mock('../../context/ReadingTimerContext', () => ({
  useReadingTimer: () => mockTimerApi,
  // Freeze the clock 12 min 5 s after the timer started.
  useNow: () => 1_000_000 + 12 * 60_000 + 5_000,
}));

function Offset({ bottom }: { bottom: number | 'hidden' | null }) {
  useFloatingTimerOffset(bottom);
  return null;
}

function renderTimer(children?: React.ReactNode) {
  return render(
    <ThemeProvider>
      <FloatingTimerProvider>
        {children}
        <FloatingTimer />
      </FloatingTimerProvider>
    </ThemeProvider>,
  );
}

const bottomOf = () => StyleSheet.flatten(screen.getByTestId('floating-timer').props.style).bottom;

beforeEach(() => {
  jest.clearAllMocks();
  mockTimerApi.timer = null;
  mockRoute.key = 'Dashboard-1';
  mockRoute.name = 'Dashboard';
  mockScreenRoute.key = 'Dashboard-1';
});

describe('<FloatingTimer />', () => {
  it('is a round stopwatch button while idle', async () => {
    renderTimer();
    expect(await screen.findByLabelText('Open timer')).toBeTruthy();
    expect(screen.queryByLabelText(/Timer running/)).toBeNull();
  });

  it('opens the controls and starts a stopwatch', async () => {
    renderTimer();
    fireEvent.press(await screen.findByLabelText('Open timer'));
    fireEvent.press(screen.getByLabelText('Start timer'));
    expect(mockTimerApi.start).toHaveBeenCalledWith('stopwatch', null);
  });

  it('starts a timed session with the chosen length', async () => {
    renderTimer();
    fireEvent.press(await screen.findByLabelText('Open timer'));
    // The sheet is titled "Timer" too; the segment comes after it.
    fireEvent.press(screen.getAllByText('Timer').pop()!);
    fireEvent.press(screen.getByText('45m'));
    fireEvent.press(screen.getByLabelText('Start timer'));
    expect(mockTimerApi.start).toHaveBeenCalledWith('countDown', 45 * 60);
  });

  it('shows the live clock while running and pauses from the controls', async () => {
    mockTimerApi.timer = startTimer('stopwatch', null, '2026-10-10', T0);
    renderTimer();
    expect(await screen.findByText('12:05')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/Timer running, 12:05/));
    fireEvent.press(screen.getByLabelText('Pause timer'));
    expect(mockTimerApi.pause).toHaveBeenCalled();
  });

  it('shows the paused time and offers resume', async () => {
    mockTimerApi.timer = pauseTimer(startTimer('stopwatch', null, '2026-10-10', T0), T0 + 5 * 60_000);
    renderTimer();
    fireEvent.press(await screen.findByLabelText(/Timer paused, 5:00/));
    expect(screen.getByText('Paused')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Resume timer'));
    expect(mockTimerApi.resume).toHaveBeenCalled();
  });

  it('stop & save saves and offers the day in Activity', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockTimerApi.timer = startTimer('stopwatch', null, '2026-10-10', T0);
    renderTimer();
    fireEvent.press(await screen.findByLabelText(/Open timer controls/));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Stop and save timer'));
    });
    expect(mockTimerApi.finish).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Session saved', expect.any(String), expect.any(Array));
    const { navigateToActivityDay } = require('../../navigation/navigationRef');
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Add pages')?.onPress?.();
    expect(navigateToActivityDay).toHaveBeenCalledWith('2026-10-10');
    alert.mockRestore();
  });

  it('asks before discarding', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockTimerApi.timer = startTimer('stopwatch', null, '2026-10-10', T0);
    renderTimer();
    fireEvent.press(await screen.findByLabelText(/Open timer controls/));
    fireEvent.press(screen.getByLabelText('Discard timer'));
    expect(mockTimerApi.discard).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    act(() => buttons.find((b) => b.text === 'Discard')?.onPress?.());
    expect(mockTimerApi.discard).toHaveBeenCalled();
    alert.mockRestore();
  });

  it('opens the Quran from the controls, except in the reader', async () => {
    mockTimerApi.timer = startTimer('stopwatch', null, '2026-10-10', T0);
    renderTimer();
    fireEvent.press(await screen.findByLabelText(/Open timer controls/));
    fireEvent.press(screen.getByText('Open the Quran'));
    // The Read tab as it is, so an open reader isn't covered by a second index.
    expect(mockNavigate).toHaveBeenCalledWith('Read');
  });

  it('has no "Open the Quran" in the reader', async () => {
    mockRoute.name = 'QuranReader';
    mockTimerApi.timer = startTimer('stopwatch', null, '2026-10-10', T0);
    renderTimer();
    fireEvent.press(await screen.findByLabelText(/Open timer controls/));
    expect(screen.queryByText('Open the Quran')).toBeNull();
  });

  it.each(['Settings', 'PlanEdit', 'PlanDayEdit', 'Memorization', 'JournalEntry'])(
    'is hidden on %s',
    async (name) => {
      mockRoute.name = name;
      renderTimer();
      await act(async () => {});
      expect(screen.queryByTestId('floating-timer')).toBeNull();
    },
  );

  it('shows on Activity, the Read tab and Insights', async () => {
    for (const name of ['Activity', 'ActivityDay', 'ReadIndex', 'Insights']) {
      mockRoute.name = name;
      const { unmount } = renderTimer();
      expect(await screen.findByTestId('floating-timer')).toBeTruthy();
      unmount();
    }
  });

  it('hides while the keyboard is open', async () => {
    const listeners: Record<string, () => void> = {};
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      listeners[event] = cb;
      return { remove: jest.fn() };
    }) as never);
    renderTimer();
    expect(await screen.findByTestId('floating-timer')).toBeTruthy();
    const show = listeners.keyboardWillShow ?? listeners.keyboardDidShow;
    const hide = listeners.keyboardWillHide ?? listeners.keyboardDidHide;
    act(() => show());
    expect(screen.queryByTestId('floating-timer')).toBeNull();
    act(() => hide());
    expect(screen.getByTestId('floating-timer')).toBeTruthy();
    spy.mockRestore();
  });

  it('sits above the tab bar on tab screens', async () => {
    renderTimer();
    await screen.findByTestId('floating-timer');
    // Tab bar pill (52) + gap with no safe-area inset (14) + spacing.sm.
    expect(bottomOf()).toBe(52 + 14 + spacing.sm);
  });

  it('sits low on screens without a tab bar, and screens can raise it', async () => {
    mockRoute.key = 'QuranReader-1';
    mockRoute.name = 'QuranReader';
    mockScreenRoute.key = 'QuranReader-1';
    const tree = (bottom: number | null) => (
      <ThemeProvider>
        <FloatingTimerProvider>
          <Offset bottom={bottom} />
          <FloatingTimer />
        </FloatingTimerProvider>
      </ThemeProvider>
    );
    const { rerender } = render(tree(null));
    await screen.findByTestId('floating-timer');
    expect(bottomOf()).toBe(spacing.md);
    rerender(tree(160));
    expect(bottomOf()).toBe(160);
    rerender(tree(null));
    expect(bottomOf()).toBe(spacing.md);
  });

  it('hides when the reader hides its controls (so nothing covers the page)', async () => {
    mockRoute.key = 'QuranReader-1';
    mockRoute.name = 'QuranReader';
    mockScreenRoute.key = 'QuranReader-1';
    const tree = (bottom: number | 'hidden') => (
      <ThemeProvider>
        <FloatingTimerProvider>
          <Offset bottom={bottom} />
          <FloatingTimer />
        </FloatingTimerProvider>
      </ThemeProvider>
    );
    const { rerender } = render(tree(40));
    await screen.findByTestId('floating-timer');
    rerender(tree('hidden'));
    expect(screen.queryByTestId('floating-timer')).toBeNull();
    rerender(tree(40));
    expect(await screen.findByTestId('floating-timer')).toBeTruthy();
  });

  it("ignores an offset from a screen that isn't focused", async () => {
    // The reader below in the stack asked for 160; Activity is on top.
    mockRoute.key = 'Activity-1';
    mockRoute.name = 'Activity';
    mockScreenRoute.key = 'QuranReader-1';
    renderTimer(<Offset bottom={160} />);
    await screen.findByTestId('floating-timer');
    expect(bottomOf()).toBe(52 + 14 + spacing.sm);
  });
});
