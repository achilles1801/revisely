// The History/Overview calendar: the screen label, the Week | Month toggle (remembered per
// phone), and stepping through weeks (Majd, Nov 2026).
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ActivityBlocksViews } from '../ActivityBlocksViews';
import { CALENDAR_SPAN_KEY } from '../../../lib/activityCalendar';

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
  setItem: jest.fn((k: string, v: string) => {
    store[k] = v;
    return Promise.resolve();
  }),
}));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: [], user: null, logs: [] }) }));
const mockPalette = new Proxy({}, { get: () => '#000000' });
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('../../../services/firestoreService', () => ({
  getActivityItemsBetween: jest.fn(() => Promise.resolve({ revisions: [], memorized: [], reads: [] })),
}));
jest.mock('../../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../useActivityReload', () => {
  const mockReact = jest.requireActual('react');
  return { useActivityReload: (load: () => void) => mockReact.useEffect(() => load(), []) };
});
jest.mock('../DayParts', () => ({ ProgressRing: () => null }));

const TODAY = '2026-11-05';
const props = { today: TODAY, noteDays: new Set<string>(), onOpenDay: jest.fn(), onReviseTomorrow: jest.fn(), onPlanIt: jest.fn() };

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('the History/Overview calendar', () => {
  it('is labelled Overview (one constant), with Week and Month inside', async () => {
    render(<ActivityBlocksViews {...props} />);
    expect(await screen.findByText('Overview')).toBeTruthy();
    expect(screen.getByText('Week')).toBeTruthy();
    expect(screen.getByText('Month')).toBeTruthy();
  });

  it('Week shows the seven days, each with a one-line summary', async () => {
    render(<ActivityBlocksViews {...props} />);
    fireEvent.press(await screen.findByText('Week'));
    expect(await screen.findByTestId('calendar-week')).toBeTruthy();
    expect(screen.getAllByText('Nothing logged')).toHaveLength(7);
    expect(store[CALENDAR_SPAN_KEY]).toBe('week');
  });

  it('remembers the last choice on this phone: a Week choice opens Week next time', async () => {
    store[CALENDAR_SPAN_KEY] = 'week';
    render(<ActivityBlocksViews {...props} />);
    expect(await screen.findByTestId('calendar-week')).toBeTruthy();
  });

  it('steps to the next week and shows its title', async () => {
    store[CALENDAR_SPAN_KEY] = 'week';
    render(<ActivityBlocksViews {...props} />);
    await screen.findByTestId('calendar-week');
    const before = screen.getByText('Nov 1 – 7');
    expect(before).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Next week'));
    await waitFor(() => expect(screen.getByText('Nov 8 – 14')).toBeTruthy());
  });
});
