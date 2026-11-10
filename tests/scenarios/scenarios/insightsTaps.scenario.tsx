// Insights' one-line taps (ACT-23; the NOTE's proposals, mocks i7 and i10). Majd, Nov 7 2026: "why's none
// of the activity screen interactive? … it's just like a static page."
import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InsightsView, type InsightsData } from '../../../src/components/activity/InsightsView';
import { plainText } from '../../../src/lib/passages';

const TODAY = '2026-11-03';
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: (_t, k) => (k === 'heat' || k === 'heatInk' ? ['#000000', '#000000', '#000000', '#000000', '#000000'] : '#000000') }), theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));
jest.mock('../../../src/context/AppContext', () => ({ useApp: () => ({ pages: [], user: { smartTrackingEnabled: false } }) }));
jest.mock('../../../src/lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../src/lib/revo/useRevoContext', () => ({ useRevoContext: () => ({ sources: () => null }) }));
jest.mock('../../../src/services/firestoreService', () => ({ getActivityItemsBetween: jest.fn(async () => ({ revisions: [], memorized: [], reads: [] })) }));
const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

// Juz 30 (582–604) memorized; 582–599 revised today and yesterday, 600–604 never. Revised every day
// this week but Sunday 1 November. Memorized in October: 600 on the 20th, 601–602 on the 29th.
const JUZ30 = Array.from({ length: 23 }, (_, i) => 582 + i);
const revisedOn = (day: string) => ({ day, countsFor: day, pages: JUZ30.filter((p) => p < 600), skipped: [], minutes: 20, occurredAt: null });
const data: InsightsData = {
  today: TODAY,
  memorized: new Set(JUZ30),
  learning: new Set(),
  rating: () => 4,
  ratedWeak: new Map(),
  revised: ['2026-11-03', '2026-11-02', '2026-10-31', '2026-10-30', '2026-10-29', '2026-10-28'].map(revisedOn),
  read: [],
  memorizations: [
    { day: '2026-10-20', pages: [600] },
    { day: '2026-10-29', pages: [601, 602] },
  ],
  capacity: 20,
  revo: false,
  smartTracking: false,
  range: 30,
};

// Twelve timed revisions at 6:10 in the morning (local), 20 pages each, the last 12 days but one with
// no time; Pace shows from ten timed ones (ACT-4).
const localAt = (day: string, h: number, m: number) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m).getTime();
const dayBefore = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const timedData: InsightsData = {
  ...data,
  revised: Array.from({ length: 13 }, (_, n) => {
    const day = dayBefore(n);
    return { day, countsFor: day, pages: JUZ30.slice(0, 20), skipped: [], minutes: n === 5 ? null : 36 + n, occurredAt: localAt(day, 6, 10) };
  }),
};

function open(shown: InsightsData = data) {
  const onOpenDay = jest.fn();
  const onOpenCalendar = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InsightsView data={shown} onReviseTomorrow={jest.fn()} onPlanIt={jest.fn()} onOpenPage={jest.fn()} onOpenDay={onOpenDay} onOpenCalendar={onOpenCalendar} />
    </SafeAreaProvider>,
  );
  return { onOpenDay, onOpenCalendar };
}

/** The sheet closes (its animation), then reports it has gone, as iOS does (onDismiss): only then can another open (SHEET-1). */
const sheetGone = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });
};

describe('Insights’ one-line taps', () => {
  afterEach(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  it('[ACT-23] a day’s circle opens that day, a missed one too; Consistency’s figure opens Overview at the month', () => {
    const { onOpenDay, onOpenCalendar } = open();
    fireEvent.press(screen.getByTestId('insights-day-2026-11-02'));
    fireEvent.press(screen.getByTestId('insights-day-2026-11-01'));
    expect(onOpenDay.mock.calls).toEqual([['2026-11-02'], ['2026-11-01']]);
    fireEvent.press(screen.getByTestId('insights-consistency-figure'));
    expect(onOpenCalendar).toHaveBeenCalledWith('2026-11');
  });

  it('[ACT-23] Coverage’s figure lists what wasn’t revised in the range; a row opens its juz', async () => {
    open();
    expect(screen.getByText(/memorized pages in 30 days ›$/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('insights-coverage-figure'));
    expect(await screen.findByText('Not revised in 30 days')).toBeTruthy();
    expect(screen.getByText('5 of 23 memorized pages')).toBeTruthy();
    const row = screen.getByTestId('uncovered-600');
    expect(plainText(row.props.accessibilityLabel)).toMatch(/Memorized Thursday 29 October, not revised yet$/);
    fireEvent.press(row);
    await sheetGone();
    expect(await screen.findByText('Juz 30')).toBeTruthy();
  });

  it('[ACT-23] a month’s bar: the figure becomes that month, its memorizations list under the bars, each opening its day', () => {
    const { onOpenDay } = open();
    fireEvent.press(screen.getByTestId('insights-month-2026-10'));
    expect(screen.getByText(/^pages in October · /)).toBeTruthy();
    expect(screen.getByText('23 in all')).toBeTruthy();
    fireEvent.press(screen.getByTestId('insights-month-item-2026-10-29'));
    expect(onOpenDay).toHaveBeenCalledWith('2026-10-29');
    // The same bar again: back to the total.
    fireEvent.press(screen.getByTestId('insights-month-2026-10'));
    expect(screen.queryByTestId('insights-month-list')).toBeNull();
  });

  it('[ACT-23] Pace’s timed revisions: each as a dot and a row, the untimed one said; a row opens its day', async () => {
    const { onOpenDay } = open(timedData);
    fireEvent.press(screen.getByTestId('insights-pace-revisions'));
    expect(screen.getByText('12 timed revisions')).toBeTruthy();
    expect(screen.getByTestId('pace-untimed').props.children).toBe('1 revision in 30 days had no time, so it isn’t counted.');
    fireEvent.press(screen.getByTestId(`pace-row-${dayBefore(1)}-1`));
    await sheetGone();
    expect(onOpenDay).toHaveBeenCalledWith(dayBefore(1));
  });

  it('[ACT-23] press and slide on the hour bars: the title becomes the hour; letting go puts it back', async () => {
    open(timedData);
    const title = () => screen.getByTestId('insights-hours-title').props.children;
    expect(title()).toMatch(/^Mostly 6–7 AM/);
    fireEvent(screen.getByTestId('insights-hour-bars'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 240, height: 60 } } });
    // fireGestureHandler ends a gesture it is given, so the moment it is held is driven by its handlers.
    const scrub = getByGestureTestId('insights-hours-scrub') as unknown as { handlers: { onStart: (e: { x: number }) => void; onUpdate: (e: { x: number }) => void } };
    act(() => scrub.handlers.onStart({ x: 65 }));
    expect(title()).toMatch(/^6–7 AM · /);
    expect(screen.getByText(/^12 sessions in 30 days, the last today$/)).toBeTruthy();
    act(() => scrub.handlers.onUpdate({ x: 230 }));
    expect(title()).toBe('11 PM–12 AM');
    // Let go.
    act(() => {
      fireGestureHandler(getByGestureTestId('insights-hours-scrub'), [{ state: State.BEGAN, x: 65 }, { state: State.ACTIVE, x: 65 }, { state: State.END, x: 65 }]);
    });
    expect(title()).toMatch(/^Mostly 6–7 AM/);
  });
});
