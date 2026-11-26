// One Activity tab (ACT-35, Revisely Dev; Majd's version A, Nov 25 2026): the calendar and the picked day first, with no
// Overview | Insights switch and no note on the day; the sections as quiet rows under them, those with nothing to say left
// out; the range and Edit sections on the list; a row opens its section on a page of its own.
import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render as rtlRender, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityBlocksViews } from '../ActivityBlocksViews';
import { resetInsightsRangeForTests } from '../InsightsRangeChip';
import { setActivityOneTabForTests } from '../../../lib/release/activityOneTab';
import { setJournalDesignReleasedForTests } from '../../../lib/release/journalDesign';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
let mockPages: { pageNumber: number; status: string; weaknessRating: number; lastRevisedDate?: string }[] = [];
let mockUser: { id: string; smartTrackingEnabled: boolean } = { id: 'u1', smartTrackingEnabled: true };
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: mockPages, user: mockUser, logs: [] }) }));
const mockPalette = new Proxy({}, { get: () => '#000000' });
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('../../../services/firestoreService', () => ({
  getActivityItemsBetween: jest.fn(() => Promise.resolve({ revisions: [], memorized: [], reads: [] })),
  getMemorizationsBetween: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../../lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../../lib/recordings', () => ({
  listRecordings: jest.fn(() => Promise.resolve([])),
  onRecordingsChanged: jest.fn(() => () => undefined),
}));
jest.mock('../useActivityReload', () => {
  const mockReact = jest.requireActual('react');
  return {
    useActivityReload: (load: () => void) =>
      mockReact.useEffect(() => {
        load();
      }, []),
  };
});
jest.mock('../DayParts', () => ({ ProgressRing: () => null }));

const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const render = (ui: React.ReactElement) => rtlRender(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
// An ActionSheet's action runs once it has gone (iOS: the Modal's onDismiss).
const closeSheets = () =>
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });

const TODAY = '2026-11-05';
const props = () => ({
  today: TODAY,
  noteDays: new Set<string>([TODAY]),
  noteOf: (day: string) => (day === TODAY ? 'Slow down at the second one.' : null),
  onAddNote: jest.fn(),
  onOpenDay: jest.fn(),
  onReviseTomorrow: jest.fn(),
  onPlanIt: jest.fn(),
  onOpenPage: jest.fn(),
  onOpenSection: jest.fn(),
  onOpenMonth: jest.fn(),
});
// Juz 30 memorized and revised yesterday: Coverage and Consistency have something to say.
const memorized = (rating = 4) =>
  Array.from({ length: 23 }, (_, i) => ({ pageNumber: 582 + i, status: 'memorized', weaknessRating: rating, lastRevisedDate: '2026-11-04T09:00:00.000Z' }));

// Both Revisely Dev's: the one tab, and the day as one entry (ACT-34).
beforeAll(() => {
  setActivityOneTabForTests(true);
  setJournalDesignReleasedForTests(true);
});
afterAll(() => {
  setActivityOneTabForTests(undefined);
  setJournalDesignReleasedForTests(undefined);
});
beforeEach(() => {
  jest.clearAllMocks();
  resetInsightsRangeForTests();
  mockPages = memorized();
  mockUser = { id: 'u1', smartTrackingEnabled: true };
});

describe('[ACT-35] one Activity tab', () => {
  it('this week and the picked day first (Majd’s T1), with no Overview | Insights switch; the day shows no note', async () => {
    const p = props();
    render(<ActivityBlocksViews {...p} />);
    // The week in one line, not the month: seven days, a grey line, and Month ›.
    expect(await screen.findByTestId('calendar-strip')).toBeTruthy();
    expect(screen.queryByTestId('calendar-month')).toBeNull();
    expect(screen.getByTestId('calendar-strip-title')).toHaveTextContent('This week');
    for (const d of ['2026-11-01', '2026-11-05', '2026-11-07']) expect(screen.getByTestId(`calendar-day-${d}`)).toBeTruthy();
    expect(screen.queryByTestId('calendar-day-2026-11-08')).toBeNull();
    expect(screen.getByTestId('calendar-week-line')).toHaveTextContent('0 of 5 days revised');
    fireEvent.press(screen.getByTestId('calendar-month-link'));
    expect(p.onOpenMonth).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByText('Overview')).toBeNull();
    expect(screen.getByTestId('calendar-preview')).toBeTruthy();
    // The day has a note, and the entry neither shows it nor offers another.
    expect(screen.queryByTestId('preview-row-notes')).toBeNull();
    expect(screen.queryByText('Slow down at the second one.')).toBeNull();
    expect(screen.queryByTestId('preview-add-note')).toBeNull();
  });

  it('under the day: "Your revision" with the range chip, the sections as rows, and Edit sections last', async () => {
    const p = props();
    render(<ActivityBlocksViews {...p} />);
    const list = await screen.findByTestId('activity-sections-list');
    expect(within(list).getByText('Your revision')).toBeTruthy();
    expect(within(list).getByTestId('insights-range')).toBeTruthy();
    const coverage = await screen.findByTestId('insights-row-coverage');
    expect(within(coverage).getByText('Coverage')).toBeTruthy();
    expect(screen.getByTestId('insights-row-consistency')).toBeTruthy();
    // Rows, not the sections drawn in full.
    expect(screen.queryByTestId('insights-coverage')).toBeNull();
    expect(screen.queryByTestId('juz-tile-30')).toBeNull();
    expect(screen.getByTestId('activity-edit-sections')).toHaveTextContent(/Edit sections/);
    fireEvent.press(coverage);
    expect(p.onOpenSection).toHaveBeenCalledWith('coverage');
  });

  it('a section with nothing to say has no row, and one grey line says the others come', async () => {
    render(<ActivityBlocksViews {...props()} />);
    await screen.findByTestId('insights-row-coverage');
    // No page rated weak, nothing memorized in the year, nothing timed, no takes.
    for (const id of ['weak', 'memorization', 'pace', 'recitation']) expect(screen.queryByTestId(`insights-row-${id}`)).toBeNull();
    expect(screen.getByTestId('insights-rows-later')).toHaveTextContent('The other sections show here once they have something to say.');
  });

  it('Weak spots has a row once a page is rated weak, with how many and where first', async () => {
    mockPages = memorized(2);
    render(<ActivityBlocksViews {...props()} />);
    const weak = await screen.findByTestId('insights-row-weak');
    expect(within(weak).getByText('Weak spots')).toBeTruthy();
    expect(screen.getByTestId('insights-row-weak-figure')).toHaveTextContent(/^\d+\s*pages$/);
    expect(screen.getByTestId('insights-row-weak-line')).toHaveTextContent(/ first$/);
  });

  it('without Smart Tracking, Weak spots has no row (it has no ratings), and no invite either', async () => {
    mockPages = memorized(2);
    mockUser = { id: 'u1', smartTrackingEnabled: false };
    render(<ActivityBlocksViews {...props()} />);
    await screen.findByTestId('insights-row-coverage');
    expect(screen.queryByTestId('insights-row-weak')).toBeNull();
    expect(screen.queryByTestId('insights-smart-tracking')).toBeNull();
  });

  it('a section’s own page draws that section in full, with no calendar and no rows', async () => {
    render(<ActivityBlocksViews {...props()} section="coverage" />);
    expect(await screen.findByTestId('insights-coverage')).toBeTruthy();
    expect(screen.getByTestId('juz-tile-30')).toBeTruthy();
    expect(screen.queryByTestId('calendar-month')).toBeNull();
    expect(screen.queryByTestId('insights-rows')).toBeNull();
    expect(screen.queryByTestId('insights-consistency')).toBeNull();
    // The page's top bar names it: the section starts at its figure, with no title or subtitle of its own (board A4).
    expect(screen.queryByText('Coverage')).toBeNull();
    expect(screen.queryByText("Which juz you've revised lately")).toBeNull();
  });

  it('the day in C2’s form: its ring and “N of M revised”, the other kinds in one grey line with the calendar’s marks', async () => {
    const service = jest.requireMock('../../../services/firestoreService') as { getActivityItemsBetween: jest.Mock };
    service.getActivityItemsBetween.mockResolvedValue({
      revisions: [{ id: TODAY, day: TODAY, countsFor: TODAY, pages: [582, 583, 584], skipped: [], assigned: [582, 583, 584, 585], minutes: 12, occurredAt: null }],
      memorized: [{ id: 'm', day: TODAY, pages: [600] }],
      reads: [{ id: 'r', day: TODAY, pages: [1, 2], minutes: 22, occurredAt: null }],
    });
    try {
      render(<ActivityBlocksViews {...props()} />);
      expect(await screen.findByTestId('preview-ring-figure')).toHaveTextContent('3 of 4 revised');
      expect(screen.getByTestId('preview-extra-memorized')).toHaveTextContent('1 page memorized');
      expect(screen.getByTestId('preview-extra-read')).toHaveTextContent('22 min read');
      // No chip backgrounds: plain lines, and no note or Add a note.
      expect(screen.queryByTestId('preview-add-note')).toBeNull();
      expect(screen.getByTestId('calendar-week-line')).toHaveTextContent('1 of 5 days revised · 22 min read');
    } finally {
      service.getActivityItemsBetween.mockResolvedValue({ revisions: [], memorized: [], reads: [] });
    }
  });

  it('“Month ›” opens the full calendar: the month, its arrows and totals, the picked day in C2’s form', async () => {
    render(<ActivityBlocksViews {...props()} monthPage />);
    expect(await screen.findByTestId('calendar-month')).toBeTruthy();
    expect(screen.getByText('November 2026')).toBeTruthy();
    expect(screen.queryByTestId('calendar-strip')).toBeNull();
    expect(screen.queryByTestId('insights-rows')).toBeNull();
    expect(screen.queryByTestId('preview-row-notes')).toBeNull();
  });

  it('one range for all of Activity: a choice on the list is the one a section’s page reads', async () => {
    render(<ActivityBlocksViews {...props()} />);
    const chip = await screen.findByTestId('insights-range');
    expect(chip).toHaveTextContent(/30 days/);
    fireEvent.press(chip);
    fireEvent.press(await screen.findByTestId('sheet-action-range-90'));
    closeSheets();
    expect(screen.getByTestId('insights-range')).toHaveTextContent(/3 months/);
    screen.unmount();
    render(<ActivityBlocksViews {...props()} section="coverage" />);
    expect(await screen.findByTestId('insights-coverage-figure')).toHaveTextContent(/3 months/);
  });
});
