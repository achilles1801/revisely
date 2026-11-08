// Activity's Overview (ACT-18): two tabs, Overview and Insights. Week or Month is the calendar's own
// choice (a chip beside its title), not a second row of tabs; Today brings back today's month or week;
// the picked day's whole preview opens the day. (Majd, Nov 8 2026.)
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityBlocksViews } from '../../../src/components/activity/ActivityBlocksViews';

jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));
jest.mock('../../../src/context/AppContext', () => ({ useApp: () => ({ pages: [], user: { smartTrackingEnabled: false }, logs: [] }) }));
const TODAY = '2026-11-05';
jest.mock('../../../src/services/firestoreService', () => ({
  getActivityItemsBetween: jest.fn(() =>
    Promise.resolve({
      revisions: [{ id: '2026-11-05', day: '2026-11-05', countsFor: '2026-11-05', pages: [1, 2], skipped: [], assigned: [1, 2], minutes: 12, occurredAt: null }],
      memorized: [],
      reads: [{ id: 'r', day: '2026-11-05', pages: [562], minutes: 8, occurredAt: null }],
    }),
  ),
  getMemorizationsBetween: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../../src/lib/recordings', () => ({
  ...jest.requireActual('../../../src/lib/recordings'),
  listRecordings: jest.fn(() => Promise.resolve([])),
  onRecordingsChanged: jest.fn(() => () => undefined),
}));
jest.mock('../../../src/lib/revo/open', () => ({ openRevo: jest.fn() }));
// Loads once on mount (the screen's focus and the outbox's changes aren't part of this).
jest.mock('../../../src/components/activity/useActivityReload', () => {
  const mockReact = jest.requireActual('react');
  return { useActivityReload: (load: () => void) => mockReact.useEffect(() => load(), []) };
});

const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

function open() {
  const onOpenDay = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ActivityBlocksViews
        today={TODAY}
        noteDays={new Set()}
        onOpenDay={onOpenDay}
        onReviseTomorrow={jest.fn()}
        onPlanIt={jest.fn()}
        onOpenPage={jest.fn()}
      />
    </SafeAreaProvider>,
  );
  return { onOpenDay };
}

describe('Activity: Overview', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('[ACT-18] two tabs only; Week or Month is a chip beside the title, kept on the phone', async () => {
    open();
    expect(await screen.findByText('November 2026')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual(['Overview, selected', 'Insights']);
    // No second row of pills: Week and Month are in the chip's menu.
    expect(screen.queryByTestId('pill-week')).toBeNull();
    expect(screen.queryByTestId('pill-month')).toBeNull();
    fireEvent.press(screen.getByTestId('calendar-span'));
    fireEvent.press(await screen.findByTestId('sheet-action-week'));
    expect(await screen.findByTestId('calendar-week')).toBeTruthy();
    // The week holding today (Sun 1 – Sat 7 November).
    expect(screen.getByText('Nov 1 – 7')).toBeTruthy();
    await waitFor(async () => expect(await AsyncStorage.getItem('activity.calendarSpan')).toBe('week'));
  });

  it('[ACT-18] away from today’s month, Today brings it back with today picked', async () => {
    open();
    await screen.findByText('November 2026');
    expect(screen.queryByTestId('calendar-today')).toBeNull();
    fireEvent.press(screen.getByLabelText('Previous month'));
    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(await screen.findByText('September 2026')).toBeTruthy();
    fireEvent.press(screen.getByTestId('calendar-day-2026-09-10'));
    fireEvent.press(screen.getByTestId('calendar-today'));
    expect(await screen.findByText('November 2026')).toBeTruthy();
    expect(screen.queryByTestId('calendar-today')).toBeNull();
    expect(screen.getByTestId('preview-date').props.children).toBe('Thursday 5 November');
  });

  it('[ACT-18] the picked day’s whole preview opens the day: its date, Open and each row', async () => {
    const { onOpenDay } = open();
    const revised = await screen.findByTestId('preview-row-revised');
    fireEvent.press(revised);
    fireEvent.press(screen.getByTestId('preview-row-read'));
    fireEvent.press(screen.getByTestId('preview-date'));
    fireEvent.press(screen.getByLabelText('Open the day'));
    expect(onOpenDay.mock.calls).toEqual([[TODAY], [TODAY], [TODAY], [TODAY]]);
  });
});
