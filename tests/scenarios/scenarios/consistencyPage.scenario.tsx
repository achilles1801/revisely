// Consistency's own page (BEHAVIOUR.md ACT-43, Revisely Dev; Majd, Nov 27 2026: "i can't even see how my consistent is
// the last month or two weeks ago or what my trend is ... what about consistency is completing our cycles? or consistency in
// terms of reading a page ... i can't even click on an hour on that chart i need to hold it down like what bro"). The real
// Activity views on a section's page (ActivityBlocksViews, section "consistency"), from a year of items.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InsightsRangeChip, resetInsightsRangeForTests } from '../../../src/components/activity/InsightsRangeChip';
import { ActivityBlocksViews } from '../../../src/components/activity/ActivityBlocksViews';
import { setActivityOneTabForTests } from '../../../src/lib/release/activityOneTab';
import * as firestoreService from '../../../src/services/firestoreService';

const TODAY = '2026-11-27';
const mockShift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
let mockFirst = '2025-11-01';
jest.mock('../../../src/context/ThemeContext', () => {
  const palette = jest.requireActual('../../../src/theme/v2').paletteV2(false, 'crimson');
  return { useTheme: () => ({ palette, theme: palette, isDark: false }) };
});
// Juz 30 memorized (pages 582–604), five pages a day.
jest.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    pages: Array.from({ length: 23 }, (_, i) => ({ pageNumber: 582 + i, status: 'memorized', weaknessRating: 4, lastRevisedDate: null, skipCount: 0 })),
    user: { smartTrackingEnabled: false, createdAt: `${mockFirst}T12:00:00.000Z`, dailyPageCapacity: 5 },
    logs: [],
  }),
}));
/**
 * Since the account's first day: revised every day but Saturdays, and every day of the last 30; five pages a day round
 * Juz 30; mostly at 5:30 in the morning, every fourth day at 9:10 at night. Read every other day, at 6:15.
 */
function mockItems() {
  const revisions = [];
  const reads = [];
  let next = 0;
  let i = 0;
  for (let day = mockFirst; day <= TODAY; day = mockShift(day, 1)) {
    const saturday = new Date(`${day}T00:00:00Z`).getUTCDay() === 6;
    const recent = day >= mockShift(TODAY, -29);
    if (!saturday || recent) {
      const pages = Array.from({ length: 5 }, (_, k) => 582 + ((next + k) % 23));
      next = (next + 5) % 23;
      const at = i++ % 4 === 0 ? '21:10' : '05:30';
      revisions.push({ id: day, day, countsFor: day, pages, skipped: [], assigned: pages, minutes: 20, occurredAt: Date.parse(`${day}T${at}:00`) });
    }
    if (Date.parse(`${day}T00:00:00Z`) / 86_400_000 % 2 === 0) reads.push({ id: `r-${day}`, day, pages: [1, 2], minutes: 25, occurredAt: Date.parse(`${day}T06:15:00`) });
  }
  return { revisions, memorized: [], reads };
}
let mockEmpty = false;
jest.mock('../../../src/services/firestoreService', () => ({
  getActivityItemsBetween: jest.fn(async () => (mockEmpty ? { revisions: [], memorized: [], reads: [] } : mockItems())),
  getMemorizationsBetween: jest.fn(async () => []),
}));
jest.mock('../../../src/lib/recordings', () => ({
  ...jest.requireActual('../../../src/lib/recordings'),
  listRecordings: jest.fn(() => Promise.resolve([])),
  onRecordingsChanged: jest.fn(() => () => undefined),
}));
jest.mock('../../../src/lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../src/lib/revo/useRevoContext', () => ({ useRevoContext: () => ({ sources: () => null }) }));
jest.mock('../../../src/components/activity/useActivityReload', () => {
  const mockReact = jest.requireActual('react');
  return { useActivityReload: (load: () => void) => mockReact.useEffect(() => { load(); }, [load]) };
});
const METRICS = { frame: { x: 0, y: 0, width: 440, height: 956 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

function open(onOpenCalendar = jest.fn()) {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      {/* The page's header chip: the page's one range (ActivitySectionScreen). */}
      <InsightsRangeChip firstDay={mockFirst} testID="section-range" />
      <ActivityBlocksViews
        today={TODAY}
        section="consistency"
        noteDays={new Set()}
        onOpenDay={jest.fn()}
        onOpenCalendar={onOpenCalendar}
        onReviseTomorrow={jest.fn()}
        onPlanIt={jest.fn()}
        onOpenPage={jest.fn()}
      />
    </SafeAreaProvider>,
  );
  return onOpenCalendar;
}
const text = (id: string) => {
  const el = screen.queryByTestId(id);
  if (!el) return null;
  const flat = (n: unknown): string =>
    n == null || typeof n === 'boolean' ? '' : typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(flat).join('') : flat((n as { props?: { children?: unknown } }).props?.children);
  return flat(el.props.children);
};

describe('Consistency’s own page', () => {
  beforeAll(() => setActivityOneTabForTests(true));
  afterAll(() => setActivityOneTabForTests(undefined));
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetInsightsRangeForTests();
    (firestoreService.getActivityItemsBetween as jest.Mock).mockClear();
    mockFirst = '2025-11-01';
    mockEmpty = false;
  });
  afterEach(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  it('[ACT-43] Revising: the days revised against the 30 before, most weeks, week by week tapped (a year at All time), the hours tapped, never held', async () => {
    open();
    // The page reads a year of weeks, whatever the range.
    await waitFor(() => expect(firestoreService.getActivityItemsBetween).toHaveBeenCalled());
    const from = (firestoreService.getActivityItemsBetween as jest.Mock).mock.calls[0][0] as string;
    expect(from <= mockShift(TODAY, -371)).toBe(true);
    await waitFor(() => expect(text('consistency-revising-hero-value')).toBe('30'));
    expect(text('consistency-revising-hero-unit')).toBe('of 30 days');
    // 26 of the 30 days before: their four Saturdays missed.
    expect(text('consistency-revising-hero-trend')).toBe('from 26');
    expect(screen.getByTestId('consistency-revising-hero').props.accessibilityLabel).toBe('30 of 30 days, Up from 26 the month before');
    expect(text('consistency-revising-hero-line')).toBe('7 days most weeks · The last 30 days against the 30 before');

    // Week by week: 4 weeks at 30 days, this week lit; a tap on a week makes the line that week, the same week clears it.
    expect(screen.getAllByTestId(/^consistency-weeks-chart-bar-/)).toHaveLength(4);
    expect(text('consistency-weeks-line')).toBe('This week · 6 of 6 days so far');
    fireEvent.press(screen.getByTestId('consistency-weeks-chart-bar-2026-11-08'));
    expect(text('consistency-weeks-line')).toBe('Week of 8 Nov · 7 of 7 days');
    fireEvent.press(screen.getByTestId('consistency-weeks-chart-bar-2026-11-08'));
    expect(text('consistency-weeks-line')).toBe('This week · 6 of 6 days so far');
    // One range, the header's: the chart has no span of its own. All time: a year of weeks, a Saturday missed in each before
    // the last month.
    expect(screen.queryByTestId('consistency-weeks-span')).toBeNull();
    fireEvent.press(screen.getByTestId('section-range'));
    fireEvent.press(screen.getByTestId('sheet-action-range-all'));
    // The sheet acts once iOS reports it gone (SHEET-1), which the harness's Modal leaves to the test.
    await act(async () => {
      const { Modal } = jest.requireActual<typeof import('react-native')>('react-native');
      screen.UNSAFE_queryAllByType(Modal).forEach((m) => (m.props as { onDismiss?: () => void }).onDismiss?.());
    });
    await waitFor(() => expect(screen.getAllByTestId(/^consistency-weeks-chart-bar-/)).toHaveLength(52));
    fireEvent.press(screen.getByTestId('consistency-weeks-chart-bar-2026-06-07'));
    expect(text('consistency-weeks-line')).toBe('Week of 7 Jun · 6 of 7 days');

    // When you revise: the busiest hours; a tap on an hour, never a hold, for its minutes; the same hour again puts it back.
    expect(text('consistency-hours-line')).toBe('Mostly 5–6 AM');
    const nine = screen.getByTestId('consistency-hour-bars-bar-21');
    expect(nine.props.onLongPress).toBeUndefined();
    fireEvent.press(nine);
    expect(text('consistency-hours-line')).toMatch(/^9–10 PM · (\d+ h )?\d+ min$/);
    fireEvent.press(screen.getByTestId('consistency-hour-bars-bar-21'));
    expect(text('consistency-hours-line')).toBe('Mostly 5–6 AM');
  });

  it('[ACT-43] Full cycles: each against the plan’s 5 days, and Reading: the days read with the time', async () => {
    open();
    await waitFor(() => expect(text('consistency-revising-hero-value')).toBe('30'));
    fireEvent.press(screen.getByTestId('pill-cycles'));
    expect(text('consistency-cycles-hero-line')).toBe('Your plan goes round all 23 pages every 5 days.');
    // Five pages a day round 23 pages, every day this month: every cycle in it on time.
    const unit = text('consistency-cycles-hero-unit')!;
    const finished = Number(/^of (\d+) on time$/.exec(unit)![1]);
    expect(finished).toBeGreaterThan(4);
    expect(text('consistency-cycles-hero-value')).toBe(String(finished));
    const details = screen.getAllByTestId(/^consistency-cycle-.*-detail$/).map((el) => text(el.props.testID));
    // The one under way (none when a cycle ended today), then the finished ones, all on time.
    const current = screen.queryAllByTestId(/^consistency-cycle-.*-detail$/).filter((el) => /pages$/.test(text(el.props.testID) ?? ''));
    expect(current.length).toBeLessThanOrEqual(1);
    if (current.length) expect(text(current[0].props.testID)).toMatch(/^\d days? · \d+ of 23 pages$/);
    expect(details.filter((d) => !/pages$/.test(d ?? '')).every((d) => /^[45] days · on time$/.test(d ?? ''))).toBe(true);
    expect(screen.queryAllByTestId(/^consistency-cycle-.*-late$/)).toHaveLength(0);

    fireEvent.press(screen.getByTestId('pill-reading'));
    expect(text('consistency-reading-hero-unit')).toBe('of 30 days read');
    expect(Number(text('consistency-reading-hero-value'))).toBe(15);
    expect(text('consistency-reading-hero-line')).toBe('6 h 15 min · mostly 6–7 AM');
    expect(text('consistency-read-weeks-line')).toMatch(/^This week · \d days · \d+ (h \d+ )?min$/);
  });

  it('[ACT-43] a new account: 0 of 1 day since today, no trend, the chart’s one line rather than an empty frame, no hours', async () => {
    mockFirst = TODAY;
    mockEmpty = true;
    open();
    await waitFor(() => expect(text('consistency-revising-hero-unit')).toBe('of 1 day'));
    expect(text('consistency-revising-hero-value')).toBe('0');
    expect(screen.queryByTestId('consistency-revising-hero-trend')).toBeNull();
    expect(text('consistency-revising-hero-line')).toBe('Since 27 November');
    expect(text('consistency-weeks-chart-empty')).toBe('Nothing here yet in this range');
    expect(screen.queryByTestId('consistency-hours')).toBeNull();
    fireEvent.press(screen.getByTestId('pill-cycles'));
    expect(text('consistency-cycles-none')).toBe('Nothing revised yet');
  });
});
