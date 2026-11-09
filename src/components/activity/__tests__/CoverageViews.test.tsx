// Coverage's three views (ACT-26; Majd approved the mocks on Nov 8 2026, with Surah filterable by juz): Juz
// tiles filled by share, the memorized surahs under juz headers that open and close, and a cell per page.
import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InsightsView, type InsightsData } from '../InsightsView';
import { paletteV2 } from '../../../theme/v2';
import { COVERAGE_OPEN_KEY, COVERAGE_VIEW_KEY } from '../../../lib/coverageViews';

const mockPalette = paletteV2(false, 'indigo');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: [], user: { smartTrackingEnabled: true } }) }));
jest.mock('../../../lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../lib/revo/useRevoContext', () => ({ useRevoContext: () => ({ sources: () => null }) }));
jest.mock('../../../services/firestoreService', () => ({ getActivityItemsBetween: jest.fn(async () => ({ revisions: [], memorized: [], reads: [] })) }));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const TODAY = '2026-11-03';
const JUZ30 = Array.from({ length: 23 }, (_, i) => 582 + i);
const JUZ4 = Array.from({ length: 20 }, (_, i) => 62 + i);
// Majd's case (Juz 30 memorized yesterday, five pages revised today), with Juz 4 left 41 days.
const data: InsightsData = {
  today: TODAY,
  memorized: new Set([...JUZ30, ...JUZ4]),
  learning: new Set(),
  rating: () => 4,
  ratedWeak: new Map(),
  revised: [{ day: TODAY, countsFor: TODAY, pages: JUZ30.slice(0, 5), skipped: [], minutes: 12, occurredAt: null }],
  read: [],
  memorizations: [],
  capacity: 5,
  revo: false,
  smartTracking: true,
  range: 30,
  lastRevisedOn: new Map(JUZ4.map((p) => [p, '2026-09-23'] as [number, string])),
  coverageSince: new Map([...JUZ30.map((p) => [p, '2026-11-02'] as [number, string]), ...JUZ4.map((p) => [p, '2026-01-15'] as [number, string])]),
};

const flat = (st: unknown) => StyleSheet.flatten(st as never) as Record<string, unknown>;
let onOpenPage: jest.Mock;
async function open() {
  onOpenPage = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InsightsView data={data} onReviseTomorrow={jest.fn()} onPlanIt={jest.fn()} onOpenPage={onOpenPage} onOpenDay={jest.fn()} onOpenCalendar={jest.fn()} />
    </SafeAreaProvider>,
  );
  await act(async () => {});
}
async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('Coverage views (ACT-26)', () => {
  it('[ACT-26] Juz: a tile fills by the share revised, the number drawn in each part’s own colour', async () => {
    await open();
    expect(screen.getByTestId('coverage-juz')).toBeTruthy();
    const tile = screen.getByTestId('juz-tile-30');
    expect(tile.props.accessibilityLabel).toBe('Juz 30, 5 of 23 pages revised, the rest not revised yet');
    // The number on the ground in ink, and again over the five pages revised this week in that fill's ink.
    // The copies over the fill are hidden from VoiceOver (the tile reads once).
    const numbers = within(tile).getAllByText('30', { includeHiddenElements: true });
    expect(within(tile).getAllByText('30')).toHaveLength(1);
    expect(numbers.map((n) => flat(n.props.style).color)).toEqual([mockPalette.text, mockPalette.heatInk[3]]);
    const clip = within(tile)
      .UNSAFE_getAllByProps({ pointerEvents: 'none' })
      .find((v) => flat(v.props.style).overflow === 'hidden' && flat(v.props.style).position === 'absolute');
    expect(flat(clip!.props.style).width).toBe(`${(5 / 23) * 100}%`);
    // Juz 4, 41 days: red, untouched.
    expect(screen.getByTestId('juz-tile-4').props.accessibilityLabel).toBe('Juz 4, revised 41 days ago');
    expect(screen.getByTestId('insights-untouched')).toBeTruthy();
  });

  it('[ACT-26] Surah: a header per juz, open at first where there is something to act on; a tap hides or shows it, kept on the phone', async () => {
    await open();
    await press('pill-surah');
    expect(await AsyncStorage.getItem(COVERAGE_VIEW_KEY)).toBe('surah');
    expect(screen.getByText("Which surahs you've revised lately")).toBeTruthy();
    // Both juz have something to act on (Juz 4 is 30+ days, Juz 30 not revised yet): both open.
    expect(screen.getByTestId('coverage-juz-30').props.accessibilityLabel).toBe('Juz 30, 5 of 23 pages revised, the rest not revised yet');
    expect(screen.getByTestId('coverage-juz-30').props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.getByTestId('coverage-surah-30-78').props.accessibilityLabel).toBe('An-Naba, revised this week');
    expect(screen.getByTestId('coverage-surah-30-114').props.accessibilityLabel).toBe('An-Nas, not revised yet');
    expect(screen.getByTestId('coverage-surah-4-3').props.accessibilityLabel).toMatch(/^Ali 'Imran, over 30 days$/);
    // Hide Juz 30: its surahs go, its header stays and still says where it stands; the choice is kept.
    await press('coverage-juz-30');
    expect(screen.queryByTestId('coverage-juz-30-surahs')).toBeNull();
    expect(screen.getByTestId('coverage-juz-30').props.accessibilityState).toMatchObject({ expanded: false });
    expect(JSON.parse((await AsyncStorage.getItem(COVERAGE_OPEN_KEY))!)).toEqual({ opened: [], closed: [30] });
    // A chip opens its juz's sheet.
    await press('coverage-surah-4-3');
    expect(await screen.findByTestId('juz-sheet-headline')).toBeTruthy();
  });

  it('[ACT-26] Surah: the juz the user hid stays hidden next time; Page: a cell per page opens the reader there', async () => {
    await AsyncStorage.setItem(COVERAGE_VIEW_KEY, 'surah');
    await AsyncStorage.setItem(COVERAGE_OPEN_KEY, JSON.stringify({ opened: [], closed: [4] }));
    await open();
    expect(screen.getByTestId('coverage-juz-4').props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.getByTestId('coverage-juz-30-surahs')).toBeTruthy();

    await press('pill-page');
    expect(screen.getByTestId('coverage-pages')).toBeTruthy();
    expect(screen.getByTestId('coverage-page-row-4')).toBeTruthy();
    const cell = screen.getByTestId('coverage-page-586');
    expect(cell.props.accessibilityLabel).toBe('At-Takwir, page 586, revised this week');
    expect(screen.getByTestId('coverage-page-604').props.accessibilityLabel).toBe('Al-Ikhlas to An-Nas, page 604, not revised yet');
    expect(screen.getByTestId('coverage-page-62').props.accessibilityLabel).toBe("Ali 'Imran 92 to 100, page 62, over 30 days");
    await press('coverage-page-586');
    expect(onOpenPage).toHaveBeenCalledWith(586);
    // A row's juz opens its sheet.
    await press('coverage-page-row-30');
    expect(await screen.findByTestId('juz-sheet-headline')).toBeTruthy();
    act(() => {
      screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
    });
  });
});
