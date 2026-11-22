// The bar's progress line after Stop (RECITE-25): nothing for a short wait, "Checking" said once when it shows, and it
// fills and fades once the answer is in. Its way (never back, never full early) is checked in the scenario properties.
jest.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ palette: { separator: '#ddd', primary: '#123' }, theme: {}, isDark: false }),
}));

import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { CheckingLine } from '../CheckingLine';
import { FADE_MS, FILL_MS, SHOW_AFTER_MS } from '../../../lib/reciteLive/checkingProgress';

let current: React.ReactElement;
function line(checking: boolean, expectedMs = 4000) {
  current = <CheckingLine checking={checking} expectedMs={expectedMs} budgetMs={5000} />;
  return current;
}
/** The line's opacity now: Animated moves the native view, so the test renderer sees it on the next render. */
const opacity = () => {
  screen.rerender(current);
  return StyleSheet.flatten(screen.getByTestId('recite-checking-line', { includeHiddenElements: true }).props.style).opacity as number;
};

describe('[RECITE-25] the bar’s progress line after Stop', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Unmounted under the fake clock, so the line's last fill and fade finish here, not after the test.
    screen.unmount();
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows nothing, and says nothing, for an answer within the first moment', async () => {
    render(line(false));
    await act(async () => {}); // the screen reader check settles
    screen.rerender(line(true));
    act(() => jest.advanceTimersByTime(SHOW_AFTER_MS - 200));
    screen.rerender(line(false));
    act(() => jest.advanceTimersByTime(2000));
    expect(opacity()).toBe(0);
    expect(announce).not.toHaveBeenCalled();
  });

  it('shows after the first moment and says “Checking” once, however often the bar re-renders', async () => {
    render(line(false));
    await act(async () => {});
    screen.rerender(line(true));
    act(() => jest.advanceTimersByTime(SHOW_AFTER_MS + 300));
    expect(opacity()).toBe(1);
    // A re-render mid-wait (the take's clock, a new estimate) neither restarts the line nor says it again.
    screen.rerender(line(true, 6000));
    act(() => jest.advanceTimersByTime(1000));
    expect(opacity()).toBe(1);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0][0]).toBe('Checking');
  });

  it('once the answer is in, fills and fades, and the next take starts it empty again', async () => {
    render(line(false));
    await act(async () => {});
    screen.rerender(line(true));
    act(() => jest.advanceTimersByTime(2500));
    expect(opacity()).toBe(1);
    screen.rerender(line(false));
    act(() => jest.advanceTimersByTime(FILL_MS + FADE_MS + 100));
    expect(opacity()).toBe(0);
    // Another take's Stop: hidden again for its first moment.
    screen.rerender(line(true));
    act(() => jest.advanceTimersByTime(SHOW_AFTER_MS - 100));
    expect(opacity()).toBe(0);
  });
});
