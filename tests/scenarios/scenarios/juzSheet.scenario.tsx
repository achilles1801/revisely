// The juz sheet (ACT-21; mocks i5 and i6): a Coverage tile, the untouched row and a day's Revised block
// open one juz. Without Smart Tracking it shows recency, never strength (ACT-19). Majd, Nov 7 2026:
// "not being able to click on anything in coverage".
import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InsightsView, type InsightsData } from '../../../src/components/activity/InsightsView';
import { DayBlocks } from '../../../src/components/activity/DayBlocks';
import { plainText } from '../../../src/lib/passages';

const TODAY = '2026-11-03';
// Juz 28 (542–561) memorized and revised today; Juz 4 (62–81) memorized, last revised 41 days ago.
const JUZ28 = Array.from({ length: 20 }, (_, i) => 542 + i);
const JUZ4 = Array.from({ length: 20 }, (_, i) => 62 + i);
const page = (pageNumber: number, lastRevisedDate: string, weaknessRating = 4) => ({
  pageNumber,
  status: 'memorized',
  weaknessRating,
  lastRevisedDate,
  totalRevisionCount: 3,
  skipCount: 0,
  dateMemorized: null,
});
const mockApp: { pages: unknown[]; user: unknown; updatePages: jest.Mock } = { pages: [], user: null, updatePages: jest.fn() };
jest.mock('../../../src/context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: (_t, k) => (k === 'heat' || k === 'heatInk' ? ['#000000', '#000000', '#000000', '#000000', '#000000'] : '#000000') }), theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]) };
});
jest.mock('../../../src/context/ReadingTimerContext', () => ({ useReadingTimer: () => ({ timer: null }) }));
jest.mock('../../../src/lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../src/lib/revo/useRevoContext', () => ({ useRevoContext: () => ({ sources: () => null }) }));
jest.mock('../../../src/lib/recordings', () => ({ listRecordings: jest.fn(async () => []) }));
// Juz 28 revised today (a function: the mock below is hoisted above the constants).
function mockRevisedToday() {
  const pages = Array.from({ length: 20 }, (_, i) => 542 + i);
  return { id: '2026-11-03', day: '2026-11-03', countsFor: '2026-11-03', pages, skipped: [], assigned: pages, minutes: 34, occurredAt: null };
}
jest.mock('../../../src/services/firestoreService', () => ({
  getActivityItemsBetween: jest.fn(async () => ({ revisions: [mockRevisedToday()], memorized: [], reads: [] })),
  getActivityItemsForDay: jest.fn(async () => ({ revisions: [mockRevisedToday()], memorized: [], reads: [] })),
}));
const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

function setUp(smartTracking: boolean) {
  mockApp.pages = [...JUZ28.map((p) => page(p, TODAY, p === 546 ? 2 : 4)), ...JUZ4.map((p) => page(p, '2026-09-23'))];
  mockApp.user = { smartTrackingEnabled: smartTracking };
}

function insights(smartTracking: boolean) {
  setUp(smartTracking);
  const onOpenPage = jest.fn();
  const onPlanIt = jest.fn();
  const data: InsightsData = {
    today: TODAY,
    memorized: new Set([...JUZ28, ...JUZ4]),
    learning: new Set(),
    rating: (p) => (p === 546 ? 2 : 4),
    ratedWeak: new Map(),
    revised: [mockRevisedToday()],
    read: [],
    memorizations: [],
    capacity: 20,
    revo: false,
    smartTracking,
  };
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InsightsView data={data} onReviseTomorrow={jest.fn()} onPlanIt={onPlanIt} onOpenPage={onOpenPage} />
    </SafeAreaProvider>,
  );
  return { onOpenPage, onPlanIt };
}

/** A sheet's action runs once it has gone (iOS: the Modal's onDismiss). */
const sheetGone = () =>
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('the juz sheet', () => {
  // A sheet's closing animation ends on a timer: let it end while the test's world still stands.
  afterEach(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  it('[ACT-21] a Coverage tile opens its juz: when it was last revised, how often, a row per surah', async () => {
    insights(false);
    fireEvent.press(screen.getByTestId('juz-tile-28'));
    await flush();
    expect(screen.getByText('Juz 28')).toBeTruthy();
    expect(screen.getByTestId('juz-sheet-headline').props.children).toBe('Revised today');
    expect(screen.getByText(/1 time in 30 days/)).toBeTruthy();
    expect(screen.getAllByTestId(/^juz-cell-/)).toHaveLength(20);
    expect(plainText(String(screen.getByTestId('juz-surah-58').props.accessibilityLabel))).toMatch(/^Al-Mujadila, Today/);
  });

  it('[ACT-19] without Smart Tracking the sheet shows recency, never strength', async () => {
    insights(false);
    fireEvent.press(screen.getByTestId('juz-tile-28'));
    await flush();
    expect(screen.getByText('this week')).toBeTruthy();
    expect(screen.queryByText(/^(weak|moderate|strong)$/)).toBeNull();
    expect(screen.queryByText(/Ayahs .* weak/)).toBeNull();
  });

  it('[ACT-19] with Smart Tracking the sheet shows strength', async () => {
    insights(true);
    fireEvent.press(screen.getByTestId('juz-tile-28'));
    await flush();
    expect(screen.getByText('weak')).toBeTruthy();
    expect(screen.getByText(/^Ayahs \d+–\d+ weak$/)).toBeTruthy();
  });

  it('[ACT-21] a page, a surah and Open in the reader open the reader, once the sheet has gone', async () => {
    const { onOpenPage } = insights(false);
    fireEvent.press(screen.getByTestId('juz-tile-28'));
    await flush();
    fireEvent.press(screen.getByTestId('juz-cell-550'));
    expect(onOpenPage).not.toHaveBeenCalled();
    sheetGone();
    expect(onOpenPage).toHaveBeenLastCalledWith(550);
    fireEvent.press(screen.getByTestId('juz-tile-28'));
    await flush();
    fireEvent.press(screen.getByTestId('juz-surah-66'));
    sheetGone();
    expect(onOpenPage).toHaveBeenLastCalledWith(560);
    fireEvent.press(screen.getByTestId('juz-tile-28'));
    await flush();
    fireEvent.press(screen.getByTestId('juz-sheet-open'));
    sheetGone();
    expect(onOpenPage).toHaveBeenLastCalledWith(542);
  });

  it('[ACT-21] the untouched row opens its juz, stale, and plans it for tomorrow', async () => {
    const { onPlanIt } = insights(false);
    fireEvent.press(screen.getByTestId('insights-untouched'));
    await flush();
    expect(screen.getByText('Juz 4')).toBeTruthy();
    expect(screen.getByTestId('juz-sheet-headline').props.children).toBe('Last revised 41 days ago');
    fireEvent.press(screen.getByTestId('juz-sheet-plan-it'));
    sheetGone();
    expect(onPlanIt).toHaveBeenCalledWith(JUZ4);
  });

  it('[ACT-21] a day’s Revised block opens the juz it was in', async () => {
    setUp(false);
    const noop = jest.fn();
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <DayBlocks
          day={TODAY}
          today={TODAY}
          revisionNotes={[]}
          memorizationNotes={[]}
          readings={[]}
          notes={[]}
          onEditReading={noop}
          onOpenLog={noop}
          revisedLog={null}
          onDeleteRevised={noop}
          onDeleteMemorized={noop}
          onOpenRecording={noop}
          onDeleteReading={noop}
          onOpenPage={noop}
        />
      </SafeAreaProvider>,
    );
    await flush();
    const header = screen.getByTestId('activity-block-revised-header');
    expect(header.props.accessibilityHint).toBe('Opens Juz 28');
    fireEvent.press(header);
    await flush();
    expect(screen.getByText('Juz 28')).toBeTruthy();
  });
});
