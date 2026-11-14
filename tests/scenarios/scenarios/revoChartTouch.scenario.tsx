// A Revo chart answers every touch (REVO-7), the one after putting a picked day away included. A pick
// changes the chat's height; made while JavaScript still had the touch down, the scroll it caused gave
// the chat's ScrollView the JS responder, that touch's end never reached JS on iOS, and the next tap
// anywhere did nothing (E2E flow 09: the weekday letter after closing a day; Nov 8 and Nov 14 2026).
// Gesture Handler's tap ends on its own channel, often before JS has the touch's end, so a pick waits
// for that end (ChartPlot's touchGate), however late it comes.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { WeeksChart } from '../../../src/components/revo/charts/WeeksChart';
import { plainText } from '../../../src/lib/passages';
import type { RevisionLog } from '../../../src/types';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));

// Saturday 7 November; revised on Sunday the 1st and Monday the 2nd.
const TODAY = '2026-11-07';
const log = (date: string, pagesRevised: number[]): RevisionLog => ({ id: date, date, pagesRevised, pagesSkipped: [], weaknessUpdates: [], durationMinutes: null });
const logs = [log('2026-11-01', [582, 583]), log('2026-11-02', [584, 585])];

const title = () => plainText(String(screen.getByTestId('revo-chart-weeks-title').props.children));
const plot = () => screen.getByTestId('revo-chart-weeks-plot');
/** React Native's own touch events on the plot (what its responder system goes by). */
const jsTouchStart = () => fireEvent(plot(), 'touchStart', { nativeEvent: { touches: [{}], changedTouches: [{}] } });
const jsTouchEnd = () => fireEvent(plot(), 'touchEnd', { nativeEvent: { touches: [], changedTouches: [{}] } });
/** Gesture Handler's tap on Sunday the 1st (the last row's first cell). */
const tapSunday = () =>
  act(() =>
    fireGestureHandler(getByGestureTestId('revo-chart-weeks-plot-tap'), [
      { state: State.BEGAN, x: 49, y: 90 },
      { state: State.ACTIVE, x: 49, y: 90 },
      { state: State.END, x: 49, y: 90 },
    ]),
  );
const frames = (n: number) => act(() => new Promise<void>((done) => setTimeout(done, 20 * n)));

describe('Revo’s weeks chart', () => {
  it('[REVO-7] putting a picked day away waits for JS to have the touch’s end, so the next tap (a weekday) still picks', async () => {
    render(<WeeksChart title="Since 1 November" weeks={4} today={TODAY} logs={logs} onOpenDay={jest.fn()} />);
    fireEvent(plot(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 370, height: 100 } } });

    // A day picked: its panel opens under the chart.
    jsTouchStart();
    tapSunday();
    jsTouchEnd();
    await frames(2);
    expect(title()).toBe('Sunday 1 November');
    expect(screen.getByTestId('revo-chart-weeks-detail')).toBeTruthy();

    // The same day again, with Gesture Handler's tap ending well before JS hears the touch end: the panel stays
    // (the chat keeps its height) until then.
    jsTouchStart();
    tapSunday();
    await frames(10);
    expect(title()).toBe('Sunday 1 November');
    expect(screen.getByTestId('revo-chart-weeks-detail')).toBeTruthy();
    jsTouchEnd();
    await frames(2);
    expect(title()).toBe('Since 1 November');
    expect(screen.queryByTestId('revo-chart-weeks-detail')).toBeNull();

    // The next tap lands: a weekday's letter picks its column.
    fireEvent.press(screen.getByTestId('revo-chart-weeks-col-6'));
    expect(title()).toMatch(/^Saturdays · /);
  });
});
