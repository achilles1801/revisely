// Insights' range (ACT-22; mocks i1 and i2). Majd, Nov 7 2026: "why is insights restricted to just the
// last 30 days?" One range for the whole tab, from a chip at the end of the tabs row, kept on the phone.
import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityBlocksViews } from '../../../src/components/activity/ActivityBlocksViews';
import * as firestoreService from '../../../src/services/firestoreService';

const TODAY = '2026-11-05';
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: (_t, k) => (k === 'heat' || k === 'heatInk' ? ['#000000', '#000000', '#000000', '#000000', '#000000'] : '#000000') }), theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));
// Juz 30 memorized (pages 582–604); the account started on 1 September.
jest.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    pages: Array.from({ length: 23 }, (_, i) => ({ pageNumber: 582 + i, status: 'memorized', weaknessRating: 4, lastRevisedDate: null, skipCount: 0 })),
    user: { smartTrackingEnabled: false, createdAt: '2026-09-01T12:00:00.000Z' },
    logs: [],
  }),
}));
// Revised every day but Saturdays: Juz 30's first 10 pages each day; all of it once, 60 days ago.
function mockRevisions() {
  const out = [];
  for (let k = 0; k < 66; k++) {
    const d = new Date(Date.parse('2026-11-05T00:00:00Z') - k * 86_400_000);
    if (d.getUTCDay() === 6) continue;
    const day = d.toISOString().slice(0, 10);
    const pages = k === 60 ? Array.from({ length: 23 }, (_, i) => 582 + i) : Array.from({ length: 10 }, (_, i) => 582 + i);
    out.push({ id: day, day, countsFor: day, pages, skipped: [], assigned: pages, minutes: 20, occurredAt: Date.parse(`${day}T06:00:00`) });
  }
  return out;
}
jest.mock('../../../src/services/firestoreService', () => ({
  getActivityItemsBetween: jest.fn(async () => ({ revisions: mockRevisions(), memorized: [], reads: [] })),
  getMemorizationsBetween: jest.fn(async () => [{ day: '2026-10-01', pages: [604] }]),
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
  return { useActivityReload: (load: () => void) => mockReact.useEffect(() => load(), [load]) };
});
const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

function open() {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ActivityBlocksViews today={TODAY} noteDays={new Set()} onOpenDay={jest.fn()} onReviseTomorrow={jest.fn()} onPlanIt={jest.fn()} onOpenPage={jest.fn()} />
    </SafeAreaProvider>,
  );
}

const sheetGone = () =>
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });

async function choose(label: string) {
  fireEvent.press(screen.getByTestId('insights-range'));
  fireEvent.press(await screen.findByText(label));
  sheetGone();
}

describe('Insights’ range', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (firestoreService.getActivityItemsBetween as jest.Mock).mockClear();
  });
  // A sheet's closing animation ends on a timer: let it end while the test's world still stands.
  afterEach(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  it('[ACT-22] a chip at the end of the tabs row, on Insights only: 30 days at first; Coverage has no pills of its own', async () => {
    open();
    await screen.findByText('November 2026');
    expect(screen.queryByTestId('insights-range')).toBeNull();
    fireEvent.press(screen.getByTestId('pill-insights'));
    expect(await screen.findByTestId('insights-range')).toBeTruthy();
    expect(screen.getByLabelText('Insights for 30 days')).toBeTruthy();
    expect(screen.queryByTestId('coverage-window')).toBeNull();
    await waitFor(() => expect(screen.getByText(/memorized pages in 30 days( ›)?$/)).toBeTruthy());
    fireEvent.press(screen.getByTestId('insights-range'));
    expect(await screen.findByText('Insights for')).toBeTruthy();
    for (const label of ['7 days', '30 days', '3 months']) expect(screen.getByTestId(`sheet-action-range-${label === '3 months' ? 90 : label.split(' ')[0]}`)).toBeTruthy();
  });

  it('[ACT-22] 3 months: every section reads three months, the weeks grid and the missed days’ pattern; kept on the phone', async () => {
    open();
    await screen.findByText('November 2026');
    fireEvent.press(screen.getByTestId('pill-insights'));
    await screen.findByTestId('insights-range');
    await choose('3 months');
    await waitFor(() => expect(screen.getByText(/memorized pages in 3 months( ›)?$/)).toBeTruthy());
    // The account is 66 days old: the days count from its start.
    expect(screen.getByText(/^of 66 days since you started( ›)?$/)).toBeTruthy();
    expect(screen.getByTestId('insights-weeks-grid')).toBeTruthy();
    expect(screen.getByTestId('insights-pattern').props.children).toBe('Every missed day was a Saturday');
    expect(screen.getByText('Minutes by hour, last 3 months')).toBeTruthy();
    expect(screen.getByText('+1 in 3 months')).toBeTruthy();
    // Three months and the three before (Pace compares them).
    const froms = (firestoreService.getActivityItemsBetween as jest.Mock).mock.calls.map((c) => c[0]);
    expect(froms).toContain('2026-05-09');
    expect(await AsyncStorage.getItem('activity.insightsRange')).toBe('90');
  });

  it('[ACT-22] 7 days: the week’s circles and this month', async () => {
    await AsyncStorage.setItem('activity.insightsRange', '7');
    open();
    await screen.findByText('November 2026');
    fireEvent.press(screen.getByTestId('pill-insights'));
    expect(await screen.findByLabelText('Insights for 7 days')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/memorized pages in 7 days( ›)?$/)).toBeTruthy());
    expect(screen.getByText(/^of the last 7 days · /)).toBeTruthy();
    expect(screen.queryByTestId('insights-weeks-grid')).toBeNull();
  });

  it('[ACT-22] All time: since the account’s first day, Coverage in cycles, the grid from the start; read from the first day', async () => {
    open();
    await screen.findByText('November 2026');
    fireEvent.press(screen.getByTestId('pill-insights'));
    await screen.findByTestId('insights-range');
    fireEvent.press(screen.getByTestId('insights-range'));
    expect(await screen.findByText('Since 1 September')).toBeTruthy();
    fireEvent.press(screen.getByText('All time'));
    sheetGone();
    await waitFor(() => expect(screen.getByText(/^cycles? of your 23 memorized pages since 1 September( ›)?$/)).toBeTruthy());
    expect(screen.getByText(/^of 66 days since 1 September( ›)?$/)).toBeTruthy();
    expect(screen.getByTestId('insights-weeks-grid')).toBeTruthy();
    expect(screen.getByText('Minutes by hour, since 1 September')).toBeTruthy();
    // Read from the account's first day (90 days at least).
    const froms = (firestoreService.getActivityItemsBetween as jest.Mock).mock.calls.map((c) => c[0]);
    expect(froms.length).toBeGreaterThan(0);
    expect(froms.every((d: string) => d <= '2026-09-01')).toBe(true);
    expect(await AsyncStorage.getItem('activity.insightsRange')).toBe('all');
  });
});
