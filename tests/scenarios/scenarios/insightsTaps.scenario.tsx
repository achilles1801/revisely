// Insights' one-line taps (ACT-23; the NOTE's proposals, mocks i7 and i10). Majd, Nov 7 2026: "why's none
// of the activity screen interactive? … it's just like a static page."
import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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

function open() {
  const onOpenDay = jest.fn();
  const onOpenCalendar = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InsightsView data={data} onReviseTomorrow={jest.fn()} onPlanIt={jest.fn()} onOpenPage={jest.fn()} onOpenDay={onOpenDay} onOpenCalendar={onOpenCalendar} />
    </SafeAreaProvider>,
  );
  return { onOpenDay, onOpenCalendar };
}

const sheetGone = () =>
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });

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
    sheetGone();
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
});
