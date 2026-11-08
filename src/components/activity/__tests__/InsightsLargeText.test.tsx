// Insights at the largest text (CLAUDE.md, UI traps; Overview had the same fix, #390): every piece is
// chrome, so it stops growing at 1.4×; numbers shrink to fit rather than clip; side-by-side figures stack.
// The juz sheet, what wasn't revised and Pace's timed revisions too.
import React from 'react';
import { Dimensions, Modal, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InsightsView, type InsightsData } from '../InsightsView';

const mockPalette = new Proxy({}, { get: (_t, k) => (k === 'heat' || k === 'heatInk' ? ['#000000', '#000000', '#000000', '#000000', '#000000'] : '#000000') });
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: [], user: { smartTrackingEnabled: true } }) }));
jest.mock('../../../lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../lib/revo/useRevoContext', () => ({ useRevoContext: () => ({ sources: () => null }) }));
jest.mock('../../../services/firestoreService', () => ({ getActivityItemsBetween: jest.fn(async () => ({ revisions: [], memorized: [], reads: [] })) }));

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } };
const TODAY = '2026-11-03';
const JUZ30 = Array.from({ length: 23 }, (_, i) => 582 + i);
const localAt = (day: string, h: number) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, 10).getTime();
const dayBefore = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
// Everything Insights can show: twelve timed revisions (Pace), pages left unrevised, weak pages, a month
// of memorizing, Juz 4 untouched for 41 days.
const data: InsightsData = {
  today: TODAY,
  memorized: new Set([...JUZ30, ...Array.from({ length: 20 }, (_, i) => 62 + i)]),
  learning: new Set(),
  rating: (p) => (p === 585 ? 2 : 4),
  ratedWeak: new Map([[585, 3]]),
  revised: Array.from({ length: 13 }, (_, n) => {
    const day = dayBefore(n);
    return { day, countsFor: day, pages: JUZ30.slice(0, 20), skipped: [], minutes: 36 + n, occurredAt: localAt(day, 6) };
  }),
  read: [],
  memorizations: [
    { day: '2026-10-20', pages: [600] },
    { day: '2026-10-29', pages: [601, 602] },
  ],
  capacity: 20,
  revo: true,
  smartTracking: true,
  range: 30,
  lastRevisedOn: new Map(Array.from({ length: 20 }, (_, i) => [62 + i, '2026-09-23'] as [number, string])),
};

const flat = (st: unknown): Record<string, unknown> => (Array.isArray(st) ? Object.assign({}, ...st.map(flat)) : ((st as Record<string, unknown>) ?? {}));
// Words and numbers only: an icon is a Text holding its glyph (a private-use character).
const words = (c: unknown): string =>
  Array.isArray(c) ? c.map(words).join('') : typeof c === 'string' || typeof c === 'number' ? String(c).replace(/[-]/g, '') : '';
const uncapped = () =>
  screen
    .UNSAFE_getAllByType(Text)
    .filter((t) => words(t.props.children).trim() !== '')
    .filter((t) => !(typeof t.props.maxFontSizeMultiplier === 'number' && t.props.maxFontSizeMultiplier <= 1.4))
    .map((t) => words(t.props.children));
const sheetGone = () =>
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });

let dims: jest.SpyInstance;
function open(fontScale = 3.1) {
  dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 667, scale: 2, fontScale });
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InsightsView data={data} onReviseTomorrow={jest.fn()} onPlanIt={jest.fn()} onOpenPage={jest.fn()} onOpenDay={jest.fn()} onOpenCalendar={jest.fn()} />
    </SafeAreaProvider>,
  );
}

describe('Insights at the largest text', () => {
  afterEach(async () => {
    dims?.mockRestore();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  it('every text in every section stops growing at 1.4×', () => {
    open();
    expect(screen.getByTestId('insights-pace')).toBeTruthy();
    expect(screen.getByTestId('insights-weak-spots')).toBeTruthy();
    expect(uncapped()).toEqual([]);
  });

  it('the juz sheet, what wasn’t revised and Pace’s timed revisions: capped too', () => {
    open();
    fireEvent.press(screen.getByTestId('juz-tile-30'));
    expect(screen.getByText('Juz 30')).toBeTruthy();
    expect(uncapped()).toEqual([]);
    fireEvent.press(screen.getByTestId('juz-sheet-open'));
    sheetGone();
    fireEvent.press(screen.getByTestId('insights-coverage-figure'));
    expect(screen.getByTestId('insights-uncovered')).toBeTruthy();
    expect(uncapped()).toEqual([]);
    fireEvent.press(screen.getByTestId('uncovered-62'));
    sheetGone();
    fireEvent.press(screen.getByTestId('insights-pace-revisions'));
    expect(screen.getByTestId('pace-chart')).toBeTruthy();
    expect(uncapped()).toEqual([]);
  });

  it('numbers shrink inside their tiles and bars’ labels rather than clip; the tiles grow', () => {
    open();
    const tile = screen.getByTestId('juz-tile-30');
    expect(flat(tile.props.style).height).toBeUndefined();
    expect(flat(tile.props.style).minHeight).toBe(32);
    const number = screen.getAllByText('30').find((t) => t.props.adjustsFontSizeToFit);
    expect(number?.props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
  });

  it('side-by-side figures stack: Pace’s tiles, a figure’s right-hand words', () => {
    open();
    expect(flat(screen.getByTestId('insights-pace-tiles').props.style).flexDirection).toBe('column');
    expect(flat(screen.getByTestId('insights-memorization-figure').props.style).flexWrap).toBe('wrap');
  });

  it('at the default size Pace’s tiles stay side by side', () => {
    open(1);
    expect(flat(screen.getByTestId('insights-pace-tiles').props.style).flexDirection).toBe('row');
    expect(flat(screen.getByTestId('insights-memorization-figure').props.style).flexWrap).toBeUndefined();
  });
});
