// Insights' Gaps (ACT-28): the figure, the strip, the two tiles, what each tap opens, and where it sits.
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text as SvgText } from 'react-native-svg';
import { GAPS_IN_DAYS_KEY, GapsSection } from '../GapsSection';
import { InsightsView, type InsightsData } from '../InsightsView';

const mockPalette = new Proxy(
  {},
  { get: (_t, k) => (k === 'heat' || k === 'heatInk' ? ['#000000', '#000000', '#000000', '#000000', '#000000'] : k === 'red' ? '#DC2626' : '#000000') },
);
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: [], user: { smartTrackingEnabled: false } }) }));
jest.mock('../../../lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../lib/revo/useRevoContext', () => ({ useRevoContext: () => ({ sources: () => null }) }));
jest.mock('../../../services/firestoreService', () => ({ getActivityItemsBetween: jest.fn(async () => ({ revisions: [], memorized: [], reads: [] })) }));

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } };
const TODAY = '2026-11-15';
// The board's account: revised most days from 17 Oct, nothing from 29 Oct to 5 Nov, then 6, 7 and 9 Nov.
const BOARD = [
  '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24',
  '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-11-06', '2026-11-07', '2026-11-09',
];
const revisedOn = (days: string[]) => days.map((day) => ({ day, countsFor: day, pages: [582, 583], skipped: [], minutes: null, occurredAt: null }));
const flat = (st: unknown): Record<string, unknown> => (Array.isArray(st) ? Object.assign({}, ...st.map(flat)) : ((st as Record<string, unknown>) ?? {}));

function renderGaps(days: string[], extra: Partial<React.ComponentProps<typeof GapsSection>> = {}) {
  const onOpenDay = jest.fn();
  const onOpenCalendar = jest.fn();
  render(
    <GapsSection
      revised={revisedOn(days)}
      today={TODAY}
      window={30}
      inWords="in 30 days"
      lastWords="last 30 days"
      firstDay="2026-09-01"
      knownSince="2026-08-17"
      onOpenDay={onOpenDay}
      onOpenCalendar={onOpenCalendar}
      {...extra}
    />,
  );
  return { onOpenDay, onOpenCalendar };
}

describe('Gaps', () => {
  it('says how long since the last revision, in red from 3 days, and opens that day', () => {
    const { onOpenDay } = renderGaps(BOARD);
    const figure = screen.getByTestId('insights-gaps-figure');
    expect(within(figure).getByText('6 days')).toBeTruthy();
    expect(within(figure).getByText(/since your last revision/)).toBeTruthy();
    expect(flat(within(figure).getByText('6 days').props.style).color).toBe('#DC2626');
    fireEvent.press(figure);
    expect(onOpenDay).toHaveBeenCalledWith('2026-11-09');
  });

  it('a revision today: "Today, you revised, after 6 days", not in red', () => {
    renderGaps([...BOARD, TODAY]);
    const figure = screen.getByTestId('insights-gaps-figure');
    expect(within(figure).getByText('Today')).toBeTruthy();
    expect(within(figure).getByText(/you revised, after 6 days/)).toBeTruthy();
    expect(flat(within(figure).getByText('Today').props.style).color).toBe('#000000');
  });

  it('the longest gap and the usual rhythm, side by side; the longest opens Overview at its month', () => {
    const { onOpenCalendar } = renderGaps(BOARD);
    const longest = screen.getByTestId('insights-gaps-longest');
    expect(within(longest).getByText('9')).toBeTruthy();
    expect(within(longest).getByText('days')).toBeTruthy();
    expect(within(longest).getByText(/Longest gap, 28 Oct – 6 Nov/)).toBeTruthy();
    fireEvent.press(longest);
    expect(onOpenCalendar).toHaveBeenCalledWith('2026-10');
    const rhythm = screen.getByTestId('insights-gaps-rhythm');
    expect(within(rhythm).getByText('Every day')).toBeTruthy();
    expect(within(rhythm).getByText('Your usual rhythm · 2 gaps of 3+ days')).toBeTruthy();
  });

  it('every day revised: no gaps in the range', () => {
    const days = Array.from({ length: 30 }, (_, i) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10));
    renderGaps(days);
    const longest = screen.getByTestId('insights-gaps-longest');
    expect(within(longest).getByText('None')).toBeTruthy();
    expect(within(longest).getByText('No gaps in 30 days')).toBeTruthy();
    expect(within(screen.getByTestId('insights-gaps-rhythm')).getByText('Your usual rhythm · no gaps of 3+ days')).toBeTruthy();
  });

  it('the strip reads its gaps to VoiceOver and opens the day touched', () => {
    const { onOpenDay } = renderGaps(BOARD);
    const strip = screen.getByTestId('insights-gaps-strip');
    expect(strip.props.accessibilityLabel).toBe(
      'Last 30 days: revised on 14 days. Gaps of 3 days or more: 9 days, from 28 October to 6 November; 6 days so far, since 9 November.',
    );
    // 30 days over 343 pt (6 pt in from each end): the 12th day (28 Oct) is at 6 + 11 × 331 / 29.
    fireEvent(strip, 'layout', { nativeEvent: { layout: { width: 343, height: 48 } } });
    fireEvent.press(strip, { nativeEvent: { locationX: 6 + (11 * 331) / 29 } });
    expect(onOpenDay).toHaveBeenLastCalledWith('2026-10-28');
    // Each long gap's length is drawn above it; the 2-day gaps (one missed day) have none.
    expect(screen.UNSAFE_getAllByType(SvgText).map((l) => l.props.children)).toEqual(['9 days', '6 days so far']);
  });

  it('three months: a touch on the strip opens Overview at that month', () => {
    const { onOpenCalendar, onOpenDay } = renderGaps(BOARD, { window: 90, inWords: 'in 3 months', lastWords: 'last 3 months' });
    const strip = screen.getByTestId('insights-gaps-strip');
    fireEvent(strip, 'layout', { nativeEvent: { layout: { width: 343, height: 48 } } });
    fireEvent.press(strip, { nativeEvent: { locationX: 340 } });
    expect(onOpenCalendar).toHaveBeenLastCalledWith('2026-11');
    expect(onOpenDay).not.toHaveBeenCalled();
  });

  it('an account younger than the range names its first day, as Consistency does', () => {
    renderGaps(['2026-11-12', '2026-11-13', '2026-11-14'], { firstDay: '2026-11-08' });
    expect(screen.getByTestId('insights-gaps-strip').props.accessibilityLabel).toBe('Since 8 November: revised on 3 days. No gaps of 3 days or more.');
    expect(screen.getByText('8 Nov', { includeHiddenElements: true })).toBeTruthy();
  });

  it('away a while: words and the date, not in red; no Days switch while nothing reads differently', async () => {
    renderGaps(['2026-10-23', '2026-10-24']);
    const figure = screen.getByTestId('insights-gaps-figure');
    expect(within(figure).getByText('Over 3 weeks')).toBeTruthy();
    expect(within(figure).getByText(/since your last revision, on 24 Oct/)).toBeTruthy();
    expect(flat(within(figure).getByText('Over 3 weeks').props.style).color).toBe('#000000');
    await act(async () => undefined);
    screen.unmount();
    renderGaps(BOARD);
    expect(screen.queryByTestId('insights-gaps-in-days')).toBeNull();
  });

  it('Days shows every length in exact days, and is kept on the phone', async () => {
    await AsyncStorage.removeItem(GAPS_IN_DAYS_KEY);
    renderGaps(['2026-10-23', '2026-10-24']);
    const days = screen.getByTestId('insights-gaps-in-days');
    expect(days.props.accessibilityState).toMatchObject({ checked: false });
    await act(async () => {
      fireEvent.press(days);
    });
    expect(within(screen.getByTestId('insights-gaps-figure')).getByText('22 days')).toBeTruthy();
    expect(await AsyncStorage.getItem(GAPS_IN_DAYS_KEY)).toBe('1');
    screen.unmount();
    // Opened again: still in days.
    renderGaps(['2026-10-23', '2026-10-24']);
    await waitFor(() => expect(within(screen.getByTestId('insights-gaps-figure')).getByText('22 days')).toBeTruthy());
    await AsyncStorage.removeItem(GAPS_IN_DAYS_KEY);
  });

  it('back today after an absence: gently, "you’re back"', () => {
    renderGaps(['2026-10-23', '2026-10-24', TODAY]);
    expect(within(screen.getByTestId('insights-gaps-figure')).getByText(/you’re back, after over 3 weeks/)).toBeTruthy();
  });

  it('the full revision, pushed back or on schedule', () => {
    renderGaps(BOARD, {
      pushBack: { cycleDays: 16, late: Array.from({ length: 60 }, (_, i) => ({ page: 100 + i, due: '2026-11-12', next: '2026-11-28' })), due: '2026-11-14', next: '2026-11-30', days: 16, missed: true },
    });
    const line = screen.getByTestId('insights-gaps-revision');
    expect(line.props.accessibilityLabel).toBe(
      'Full revision pushed back over 2 weeks. 60 pages from your gaps come round by 30 Nov instead of 14 Nov. Your plan goes round every 16 days.',
    );
    screen.unmount();
    renderGaps(BOARD, { pushBack: { cycleDays: 16, late: [], due: null, next: null, days: 0, missed: false } });
    expect(screen.getByTestId('insights-gaps-revision').props.accessibilityLabel).toBe(
      'Full revision on schedule. Every page comes round within 16 days, as your plan has it.',
    );
  });

  it('hides with nothing revised on record', () => {
    renderGaps([]);
    expect(screen.queryByTestId('insights-gaps')).toBeNull();
  });

  it('from a page’s own record when no item reaches back: 56 days, "over a month"', () => {
    renderGaps([], { lastRevisedOn: new Map([[582, '2026-09-20T07:30:00.000Z']]) });
    expect(within(screen.getByTestId('insights-gaps-figure')).getByText('Over a month')).toBeTruthy();
  });
});

describe('Gaps in Insights', () => {
  const data: InsightsData = {
    today: TODAY,
    memorized: new Set([582, 583]),
    learning: new Set(),
    rating: () => undefined,
    ratedWeak: new Map(),
    revised: revisedOn(BOARD),
    read: [],
    memorizations: [],
    capacity: 20,
    revo: false,
    // Recency only: Gaps is the same with Smart Tracking off.
    smartTracking: false,
    range: 30,
    firstDay: '2026-09-01',
    itemsFrom: '2026-08-17',
    gaps: true,
  };
  const renderInsights = (d: InsightsData) =>
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <InsightsView data={d} onReviseTomorrow={jest.fn()} onPlanIt={jest.fn()} onOpenPage={jest.fn()} onOpenDay={jest.fn()} onOpenCalendar={jest.fn()} onTurnOnSmartTracking={jest.fn()} />
      </SafeAreaProvider>,
    );

  it('comes right after Consistency', () => {
    renderInsights(data);
    const order = screen
      .getByTestId('activity-insights')
      .props.children.flat()
      .filter((c: unknown) => c && typeof c === 'object')
      .map((c: { type: { name?: string } }) => c.type?.name ?? '');
    expect(order.indexOf('GapsSection')).toBe(order.indexOf('Consistency') + 1);
    expect(within(screen.getByTestId('insights-gaps')).getByText('6 days')).toBeTruthy();
  });

  it('is not there for an account it isn’t open to yet', () => {
    renderInsights({ ...data, gaps: false });
    expect(screen.getByTestId('insights-consistency')).toBeTruthy();
    expect(screen.queryByTestId('insights-gaps')).toBeNull();
  });
});
