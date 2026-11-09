// Insights at every range for an account one day, one week and one year old (ACT-22). Majd, Nov 8 2026,
// on a fresh account: "think i found a bug when u filter by all time or 3 months". Consistency's weeks
// grid stretched its cells to the width (one day under All time was one cell about 420 pt square, and
// 3 months kept the whole grid's height for one cell); Coverage said "0 cycles"; "1 of 1 days"; and the
// same day count said "since 8 November" under All time but "since you started" under 3 months.
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InsightsView, type InsightsData } from '../../../src/components/activity/InsightsView';
import type { InsightsRange } from '../../../src/lib/insightsRange';

jest.mock('../../../src/context/ThemeContext', () => {
  const { paletteV2 } = jest.requireActual('../../../src/theme/v2');
  const palette = paletteV2(true, 'indigo');
  return { useTheme: () => ({ palette, theme: palette, isDark: true }) };
});
jest.mock('../../../src/context/AppContext', () => ({ useApp: () => ({ pages: [], user: { smartTrackingEnabled: true } }) }));
jest.mock('../../../src/lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../src/lib/revo/useRevoContext', () => ({ useRevoContext: () => ({ sources: () => null }) }));
jest.mock('../../../src/services/firestoreService', () => ({ getActivityItemsBetween: jest.fn(async () => ({ revisions: [], memorized: [], reads: [] })) }));

// Majd's phone: an iPhone 17 Pro Max (440 pt wide). Today is Sunday 8 November 2026.
const METRICS = { frame: { x: 0, y: 0, width: 440, height: 956 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };
const TODAY = '2026-11-08';
const JUZ30 = Array.from({ length: 23 }, (_, i) => 582 + i);
const dayBefore = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** An account `days` old, Juz 30 memorized, five pages revised each day at 7 PM (one page on its first day). */
function account(days: number, range: InsightsRange): InsightsData {
  const revised = Array.from({ length: days }, (_, k) => {
    const day = dayBefore(k);
    const first = k === days - 1;
    const pages = first && days === 1 ? [582] : JUZ30.slice((k * 5) % 20, ((k * 5) % 20) + 5);
    return { day, countsFor: day, pages, skipped: [], minutes: 20, occurredAt: Date.parse(`${day}T19:10:00`) };
  });
  return {
    today: TODAY,
    memorized: new Set(JUZ30),
    learning: new Set(),
    rating: () => 4,
    ratedWeak: new Map(),
    revised,
    read: [],
    memorizations: [],
    capacity: 5,
    revo: false,
    smartTracking: true,
    range,
    firstDay: dayBefore(days - 1),
    coverageSince: new Map(JUZ30.map((p) => [p, dayBefore(days - 1)] as [number, string])),
  };
}

function open(days: number, range: InsightsRange) {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InsightsView data={account(days, range)} onReviseTomorrow={jest.fn()} onPlanIt={jest.fn()} onOpenPage={jest.fn()} onOpenDay={jest.fn()} onOpenCalendar={jest.fn()} />
    </SafeAreaProvider>,
  );
}
/** A figure as VoiceOver reads it: its number, then its line. */
const figure = (testID: string) => screen.getByTestId(testID).props.accessibilityLabel as string;
const flat = (st: unknown) => StyleSheet.flatten(st as never) as Record<string, number>;
/** The weeks grid: its columns, and the size of a cell. */
function grid() {
  const g = screen.queryByTestId('insights-weeks-grid');
  if (!g) return null;
  const cells = screen.getAllByTestId(/^insights-grid-/);
  const size = flat(cells[0].props.style);
  return { columns: g.props.children.length as number, width: size.width, height: size.height };
}

describe('Insights for a short and a long history, at every range (ACT-22)', () => {
  let dims: jest.SpyInstance;
  beforeEach(() => {
    dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 440, height: 956, scale: 3, fontScale: 1 });
  });
  afterEach(() => dims.mockRestore());

  it('[ACT-22] one day: the grid is one column of small cells; the share, not "0 cycles"; "1 of 1 day since 8 November" at every range', () => {
    for (const range of [30, 90, 'all'] as InsightsRange[]) {
      open(1, range);
      expect(figure('insights-consistency-figure')).toBe('1 of 1 day since 8 November');
      const words = range === 'all' ? 'since 8 November' : range === 90 ? 'in 3 months' : 'in 30 days';
      expect(figure('insights-coverage-figure')).toBe(`4% 1 of 23 memorized pages ${words}`);
      screen.unmount();
    }
    for (const range of [90, 'all'] as InsightsRange[]) {
      open(1, range);
      const g = grid()!;
      expect(g.columns).toBe(1);
      expect(g.width).toBe(g.height);
      expect(g.width).toBeLessThanOrEqual(18);
      screen.unmount();
    }
    open(1, 30);
    expect(grid()).toBeNull();
    screen.unmount();
  });

  it('[ACT-22] one week: two columns (the week began on a Monday); cycles under All time once the pages went round', () => {
    open(7, 'all');
    expect(figure('insights-consistency-figure')).toBe('7 of 7 days since 2 November');
    // 35 page revisions over 23 pages: 1.5 times round.
    expect(figure('insights-coverage-figure')).toBe('1.5 cycles of your 23 memorized pages since 2 November');
    expect(grid()).toMatchObject({ columns: 2 });
    screen.unmount();
    open(7, 90);
    expect(figure('insights-consistency-figure')).toBe('7 of 7 days since 2 November');
    expect(grid()).toMatchObject({ columns: 2 });
    screen.unmount();
  });

  it('[ACT-22] one year: 3 months is 13 weeks, All time the last 26; cells keep their size', () => {
    open(365, 90);
    expect(figure('insights-consistency-figure')).toBe('90 of the last 90 days');
    const g90 = grid()!;
    expect(g90.columns).toBe(13);
    expect(g90.width).toBe(18);
    screen.unmount();
    open(365, 'all');
    expect(figure('insights-consistency-figure')).toBe('365 of 365 days since 9 November');
    const gAll = grid()!;
    expect(gAll.columns).toBe(26);
    // 26 weeks across 440 pt, less the gutters and gaps.
    expect(gAll.width).toBe(Math.floor((440 - 32 - 25 * 3) / 26));
    screen.unmount();
  });
});
