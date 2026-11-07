// The Activity calendar (gap audit §3): the Calendar | Insights tabs, the month with its totals and
// stepping, and no Week / Month row (the spec removes it).
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ActivityBlocksViews } from '../ActivityBlocksViews';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: [], user: null, logs: [] }) }));
const mockPalette = new Proxy({}, { get: () => '#000000' });
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('../../../services/firestoreService', () => ({
  getActivityItemsBetween: jest.fn(() => Promise.resolve({ revisions: [], memorized: [], reads: [] })),
}));
jest.mock('../../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../../lib/recordings', () => ({
  listRecordings: jest.fn(() =>
    Promise.resolve([
      { id: 'r1', day: '2026-11-05', kind: 'revision' },
      { id: 'r2', day: '2026-11-05', kind: 'revision' },
    ]),
  ),
  onRecordingsChanged: jest.fn(() => () => undefined),
}));
jest.mock('../useActivityReload', () => {
  const mockReact = jest.requireActual('react');
  return { useActivityReload: (load: () => void) => mockReact.useEffect(() => load(), []) };
});
jest.mock('../DayParts', () => ({ ProgressRing: () => null }));

const TODAY = '2026-11-05';
const props = { today: TODAY, noteDays: new Set<string>(), onOpenDay: jest.fn(), onReviseTomorrow: jest.fn(), onPlanIt: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the Activity calendar (gap audit §3)', () => {
  it('shows the Overview and Insights tabs, and the Week | Month toggle (Majd, Nov 2026)', async () => {
    render(<ActivityBlocksViews {...props} />);
    expect(await screen.findByTestId('calendar-month')).toBeTruthy();
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Insights')).toBeTruthy();
    expect(screen.getByText('Week')).toBeTruthy();
    expect(screen.getByText('Month')).toBeTruthy();
  });

  it('Week shows the seven days of the week, each with its summary', async () => {
    render(<ActivityBlocksViews {...props} />);
    fireEvent.press(await screen.findByText('Week'));
    expect(await screen.findByTestId('calendar-week')).toBeTruthy();
    expect(screen.getAllByText('Nothing logged')).toHaveLength(7);
  });

  it('shows the month’s title and its four totals', async () => {
    render(<ActivityBlocksViews {...props} />);
    expect(await screen.findByText('November 2026')).toBeTruthy();
    // Each label is in the totals and in the legend: at least one of each.
    for (const label of ['Revised', 'Memorized', 'Read', 'Notes']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it('the picked day’s preview shows its recordings beside Revised (mock d3)', async () => {
    const service = jest.requireMock('../../../services/firestoreService') as { getActivityItemsBetween: jest.Mock };
    const empty = { revisions: [], memorized: [], reads: [] };
    service.getActivityItemsBetween.mockResolvedValue({
      revisions: [{ id: TODAY, day: TODAY, countsFor: TODAY, pages: [1, 2], skipped: [], assigned: [1, 2], minutes: 12, occurredAt: null }],
      memorized: [],
      reads: [],
    });
    try {
      render(<ActivityBlocksViews {...props} />);
      expect(await screen.findByTestId('preview-recordings-revised')).toBeTruthy();
      expect(screen.getByLabelText('2 recordings')).toBeTruthy();
    } finally {
      service.getActivityItemsBetween.mockResolvedValue(empty);
    }
  });

  it('steps to the next month and shows its title', async () => {
    render(<ActivityBlocksViews {...props} />);
    await screen.findByText('November 2026');
    fireEvent.press(screen.getByLabelText('Next month'));
    await waitFor(() => expect(screen.getByText('December 2026')).toBeTruthy());
  });
});
