// Activity's sections, arranged by the user (ACT-29). Majd, Nov 16 2026: "all these 'sections' on activity should be
// configurable so users can pick what they want to see and should be able to drag and move them around".
import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { ActivityBlocksViews } from '../../../src/components/activity/ActivityBlocksViews';
import { loadActivitySections } from '../../../src/lib/activitySections';

const TODAY = '2026-11-05';
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated/mock'),
  useFrameCallback: () => ({ setActive: jest.fn(), isActive: false, callbackId: -1 }),
}));
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: (_t, k) => (k === 'heat' || k === 'heatInk' ? ['#000000', '#000000', '#000000', '#000000', '#000000'] : '#000000') }), theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));
// A tester (previewTester) with Juz 30 memorized, Smart Tracking on; another account per test where it matters.
let mockUser: Record<string, unknown> = {};
jest.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    pages: Array.from({ length: 23 }, (_, i) => ({ pageNumber: 582 + i, status: 'memorized', weaknessRating: 4, lastRevisedDate: null, skipCount: 0 })),
    user: mockUser,
    logs: [],
  }),
}));
// Revised every day for 66 days, 20 minutes each: every Insights section has something to show, Pace included.
function mockRevisions() {
  const out = [];
  for (let k = 0; k < 66; k++) {
    const day = new Date(Date.parse('2026-11-05T00:00:00Z') - k * 86_400_000).toISOString().slice(0, 10);
    const pages = Array.from({ length: 10 }, (_, i) => 582 + i);
    out.push({ id: day, day, countsFor: day, pages, skipped: [], assigned: pages, minutes: 20, occurredAt: Date.parse(`${day}T06:00:00`) });
  }
  return out;
}
jest.mock('../../../src/services/firestoreService', () => ({
  getActivityItemsBetween: jest.fn(async () => ({ revisions: mockRevisions(), memorized: [{ day: '2026-11-02', pages: [604] }], reads: [] })),
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
  return { useActivityReload: (load: () => void) => mockReact.useEffect(() => { load(); }, [load]) };
});
/** What the tree search needs of a node. */
type Node = { type: unknown; props: { testID?: string } };

const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

const TESTER = { id: 'tester-1', previewTester: true, smartTrackingEnabled: true, createdAt: '2026-09-01T12:00:00.000Z' };

const INSIGHTS_IDS: Record<string, string> = {
  'insights-coverage': 'coverage',
  'insights-consistency': 'consistency',
  'insights-weak-spots': 'weak',
  'insights-smart-tracking': 'weak',
  'insights-memorization': 'memorization',
  'insights-pace': 'pace',
};
const OVERVIEW_IDS: Record<string, string> = {
  'calendar-totals': 'totals',
  'calendar-grid': 'calendar',
  'calendar-week': 'calendar',
  'calendar-legend': 'key',
  'calendar-preview': 'day',
};

/** The sections on screen, top to bottom (host views only: a component and its view share a testID). */
function order(ids: Record<string, string>): string[] {
  return screen.UNSAFE_root.findAll((n: Node) => typeof n.type === 'string' && ids[n.props.testID ?? ''] != null).map((n: Node) => ids[n.props.testID ?? '']);
}

function open(user: Record<string, unknown> = TESTER) {
  mockUser = user;
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ActivityBlocksViews
        today={TODAY}
        noteDays={new Set()}
        onOpenDay={jest.fn()}
        onReviseTomorrow={jest.fn()}
        onPlanIt={jest.fn()}
        onOpenPage={jest.fn()}
        onTurnOnSmartTracking={jest.fn()}
      />
    </SafeAreaProvider>,
  );
}

const sheetGone = () =>
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });

async function toInsights() {
  await screen.findByText('November 2026');
  fireEvent.press(screen.getByTestId('pill-insights'));
  await waitFor(() => expect(screen.getByTestId('insights-pace')).toBeTruthy());
}

async function edit() {
  fireEvent.press(screen.getByTestId('activity-edit-sections'));
  await screen.findByTestId('sections-done');
}

async function done() {
  fireEvent.press(screen.getByTestId('sections-done'));
  sheetGone();
}

/** A tap on a section's row flips its switch. */
const tapRow = (id: string) =>
  act(() => {
    fireGestureHandler(getByGestureTestId(`sections-tap-${id}`), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]);
  });

const stored = async (uid = TESTER.id) => JSON.parse((await AsyncStorage.getItem(`@revisely_activity_sections:v1:${uid}`)) ?? 'null');

describe('Activity’s sections', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await act(async () => {
      await loadActivitySections(null);
    });
  });
  afterEach(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  it('[ACT-29] at first both tabs are as they were: Insights in its usual order, Overview totals, calendar, key, day', async () => {
    open();
    await screen.findByText('November 2026');
    expect(order(OVERVIEW_IDS)).toEqual(['totals', 'calendar', 'key', 'day']);
    await toInsights();
    expect(order(INSIGHTS_IDS)).toEqual(['coverage', 'consistency', 'weak', 'memorization', 'pace']);
    expect(screen.getByLabelText('Edit sections')).toBeTruthy();
  });

  it('[ACT-29] a switch hides a section at once, and it stays hidden for the account on this phone', async () => {
    const first = open();
    await toInsights();
    await edit();
    expect(screen.getByText('Insights sections')).toBeTruthy();
    tapRow('consistency');
    await done();
    expect(order(INSIGHTS_IDS)).toEqual(['coverage', 'weak', 'memorization', 'pace']);
    expect((await stored()).insights.hidden).toEqual(['consistency']);
    // Opened again: still hidden.
    first.unmount();
    open();
    await toInsights();
    expect(order(INSIGHTS_IDS)).toEqual(['coverage', 'weak', 'memorization', 'pace']);
    // Turned back on, it comes back in its place.
    await edit();
    tapRow('consistency');
    await done();
    expect(order(INSIGHTS_IDS)).toEqual(['coverage', 'consistency', 'weak', 'memorization', 'pace']);
  });

  it('[ACT-29] holding a section and dragging it moves it; the first one shown has no hairline above it', async () => {
    open();
    await toInsights();
    await edit();
    // Coverage (row 0) dragged two rows down (rows are 52 tall before they are measured).
    act(() => {
      fireGestureHandler(getByGestureTestId('sections-drag-coverage'), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationY: 0, absoluteY: 300 },
        { state: State.ACTIVE, translationY: 114, absoluteY: 414 },
        { state: State.END, translationY: 114, absoluteY: 414 },
      ]);
    });
    await done();
    expect(order(INSIGHTS_IDS)).toEqual(['consistency', 'weak', 'coverage', 'memorization', 'pace']);
    expect((await stored()).insights.order.slice(0, 3)).toEqual(['consistency', 'weak', 'coverage']);
    const border = (testID: string) =>
      [screen.getByTestId(testID).props.style].flat(Infinity).reduce((w: number, s: { borderTopWidth?: number } | false | null) => (s && s.borderTopWidth) || w, 0);
    expect(border('insights-consistency')).toBe(0);
    expect(border('insights-coverage')).toBeGreaterThan(0);
  });

  it('[ACT-29] VoiceOver moves a section with Move up and Move down', async () => {
    open();
    await toInsights();
    await edit();
    const row = (id: string) => screen.getByTestId(`sections-item-${id}`);
    expect(row('coverage').props.accessibilityLabel).toBe('Coverage');
    expect(row('coverage').props.accessibilityRole).toBe('switch');
    expect(row('coverage').props.accessibilityState).toEqual({ checked: true });
    expect(row('coverage').props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['activate', 'moveDown']);
    // Five rows: no Recitation for an account without a take.
    expect(screen.queryByTestId('sections-item-recitation')).toBeNull();
    expect(row('pace').props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['activate', 'moveUp']);
    fireEvent(row('pace'), 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    fireEvent(row('coverage'), 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    // Activate turns a section off, as a tap on its row does.
    fireEvent(row('consistency'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(row('consistency').props.accessibilityState).toEqual({ checked: false });
    expect(row('consistency').props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['activate', 'moveDown']);
    await done();
    expect(order(INSIGHTS_IDS)).toEqual(['coverage', 'weak', 'pace', 'memorization']);
  });

  it('[ACT-29] Overview: the calendar is always shown, the rest can go or move; the header stays on top', async () => {
    open();
    await screen.findByText('November 2026');
    await edit();
    expect(screen.getByText('Overview sections')).toBeTruthy();
    expect(screen.queryByTestId('sections-toggle-calendar')).toBeNull();
    expect(screen.getByText('Always shown')).toBeTruthy();
    expect(screen.getByTestId('sections-item-calendar').props.accessibilityLabel).toBe('Calendar, always shown');
    // A tap on the calendar's row changes nothing.
    tapRow('calendar');
    tapRow('key');
    // Day summary up to the top, a place at a time.
    for (let k = 0; k < 3; k++) fireEvent(screen.getByTestId('sections-item-day'), 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    await done();
    expect(order(OVERVIEW_IDS)).toEqual(['day', 'totals', 'calendar']);
    expect(screen.getByTestId('calendar-head')).toBeTruthy();
    const all = screen.UNSAFE_root.findAll((n: Node) => typeof n.type === 'string' && ['calendar-head', 'calendar-preview'].includes(n.props.testID ?? ''));
    expect(all.map((n: Node) => n.props.testID)).toEqual(['calendar-head', 'calendar-preview']);
    expect((await stored()).overview).toEqual({ order: ['day', 'totals', 'calendar', 'key'], hidden: ['key'] });
  });

  it('[ACT-29] every Insights section hidden: one line, and the way back', async () => {
    open();
    await toInsights();
    await edit();
    for (const id of ['coverage', 'consistency', 'weak', 'memorization', 'pace']) tapRow(id);
    await done();
    expect(order(INSIGHTS_IDS)).toEqual([]);
    expect(screen.getByText('Every section is hidden.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('insights-edit-sections'));
    await screen.findByTestId('sections-done');
    fireEvent.press(screen.getByTestId('sections-reset'));
    await done();
    expect(order(INSIGHTS_IDS)).toEqual(['coverage', 'consistency', 'weak', 'memorization', 'pace']);
  });

  it('[ACT-29] per account: another account on this phone has the usual layout', async () => {
    await AsyncStorage.setItem(
      `@revisely_activity_sections:v1:${TESTER.id}`,
      JSON.stringify({ insights: { order: ['pace', 'coverage'], hidden: ['consistency'] } }),
    );
    const first = open();
    await toInsights();
    expect(order(INSIGHTS_IDS)).toEqual(['pace', 'coverage', 'weak', 'memorization']);
    first.unmount();
    open({ ...TESTER, id: 'tester-2' });
    await toInsights();
    expect(order(INSIGHTS_IDS)).toEqual(['coverage', 'consistency', 'weak', 'memorization', 'pace']);
  });

  it('[ACT-29] with Smart Tracking off Weak spots’ slot is its invite, and the editor says why', async () => {
    open({ ...TESTER, smartTrackingEnabled: false });
    await toInsights();
    expect(order(INSIGHTS_IDS)).toEqual(['coverage', 'consistency', 'weak', 'memorization', 'pace']);
    await edit();
    expect(screen.getByText('Smart Tracking is off')).toBeTruthy();
    // No Recitation row for an account without a take.
    expect(screen.queryByTestId('sections-row-recitation')).toBeNull();
    await done();
  });

  it('[ACT-29] testers only for now: anyone else has no Edit sections and the usual layout, whatever this phone holds', async () => {
    const plain = { ...TESTER, id: 'plain-1', previewTester: false };
    await AsyncStorage.setItem('@revisely_activity_sections:v1:plain-1', JSON.stringify({ insights: { order: ['pace'], hidden: ['coverage'] } }));
    open(plain);
    await toInsights();
    expect(screen.queryByTestId('activity-edit-sections')).toBeNull();
    expect(order(INSIGHTS_IDS)).toEqual(['coverage', 'consistency', 'weak', 'memorization', 'pace']);
  });
});
