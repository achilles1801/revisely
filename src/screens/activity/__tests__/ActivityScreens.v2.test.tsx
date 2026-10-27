import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ActivityScreen from '../ActivityScreen';
import ActivityDayScreen from '../ActivityDayScreen';
import { emptyJournalEntry, shiftDay } from '../../../lib/journal';
import { getRevisionDayForUser } from '../../../lib/fajrBoundary';
import type { JournalEntry, ReadingSession, RevisionLog, User } from '../../../types';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
const mockRoute: { key: string; params: { date?: string } } = { key: 'r1', params: {} };
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => mockNavigation,
    useRoute: () => mockRoute,
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

jest.mock('../../../context/ReadingTimerContext', () => ({
  useReadingTimer: () => ({ timer: null }),
  useNow: () => Date.now(),
}));
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
// The new design.
jest.mock('../../../design/DesignContext', () => ({
  useDesign: () => ({ isNew: true, chosen: 'new', allowed: true, hapticsOn: true }),
}));

const mockApp: any = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));

const mockService: Record<string, jest.Mock> = {
  getReadingSessions: jest.fn(),
  getReadingSessionsForDay: jest.fn(),
  getJournalEntries: jest.fn(),
  getJournalEntry: jest.fn(),
  updateReadingSessionPages: jest.fn(() => Promise.resolve()),
  deleteReadingSession: jest.fn(() => Promise.resolve()),
};
jest.mock('../../../services/firestoreService', () => ({
  getReadingSessions: (...a: unknown[]) => mockService.getReadingSessions(...a),
  getReadingSessionsForDay: (...a: unknown[]) => mockService.getReadingSessionsForDay(...a),
  getJournalEntries: (...a: unknown[]) => mockService.getJournalEntries(...a),
  getJournalEntry: (...a: unknown[]) => mockService.getJournalEntry(...a),
  updateReadingSessionPages: (...a: unknown[]) => mockService.updateReadingSessionPages(...a),
  deleteReadingSession: (...a: unknown[]) => mockService.deleteReadingSession(...a),
}));

jest.mock('../../../components/EditSessionModal', () => {
  const { Text } = require('react-native');
  return {
    EditSessionModal: ({ log }: { log: { id: string } }) => <Text>{`Editing ${log.id}`}</Text>,
  };
});

const user = { createdAt: '2026-01-01T12:00:00.000Z', fajrBoundaryEnabled: false } as User;
const today = getRevisionDayForUser(user);
const day = (n: number) => shiftDay(today, -n);

function at(date: string, hour: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour).getTime();
}

function log(date: string, pagesRevised: number[], durationMinutes: number | null = null): RevisionLog {
  return {
    id: `log-${date}`,
    date,
    pagesRevised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes,
  };
}

function reading(date: string, hour: number, minutes: number, pages: number[] = []): ReadingSession {
  return {
    id: `r-${date}-${hour}`,
    date,
    startedAt: at(date, hour),
    endedAt: at(date, hour) + minutes * 60_000,
    durationSeconds: minutes * 60,
    mode: 'stopwatch',
    targetSeconds: null,
    pages,
    pagesVisited: [],
  };
}

function entry(date: string, overrides: Partial<JournalEntry>): JournalEntry {
  return { ...emptyJournalEntry(date), ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApp.user = user;
  mockApp.logs = [];
  mockApp.updateLog = jest.fn();
  mockApp.deleteLog = jest.fn();
  mockService.getReadingSessions.mockResolvedValue([]);
  mockService.getReadingSessionsForDay.mockResolvedValue([]);
  mockService.getJournalEntries.mockResolvedValue([]);
  mockService.getJournalEntry.mockResolvedValue(null);
  mockRoute.params = {};
});

describe('<ActivityScreen /> in the new design', () => {
  it('is a feed: a summary post, then a post per day with a line per kind of activity', async () => {
    mockApp.logs = [log(today, [1, 2, 3], 12)];
    mockService.getReadingSessions.mockResolvedValue([reading(today, 9, 20), reading(day(1), 7, 15)]);
    mockService.getJournalEntries.mockResolvedValue([entry(day(2), { memorization: '1/2 p3' })]);
    render(<ActivityScreen />);

    expect(await screen.findByText('Today')).toBeTruthy();
    expect(screen.getByText('Last 7 days')).toBeTruthy();
    expect(screen.getByText('3 of 7 days active')).toBeTruthy();
    expect(screen.getByText('3 pages revised · 35m timed · 0m logged')).toBeTruthy();
    expect(screen.getByText('Revised pages 1–3')).toBeTruthy();
    expect(screen.getAllByText('Timed session')).toHaveLength(2);
    expect(screen.getByText('1/2 p3')).toBeTruthy();
    // Sentence case, no uppercase eyebrows.
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.queryByText('RECENT')).toBeNull();
  });

  it('an empty today offers Log today; any day opens', async () => {
    mockService.getReadingSessions.mockResolvedValue([reading(day(3), 9, 5)]);
    render(<ActivityScreen />);
    fireEvent.press(await screen.findByText('Log today'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('JournalEntry', { date: today });
    fireEvent.press(screen.getByLabelText(/^Open /));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ActivityDay', { date: day(3) });
  });
});

describe('<ActivityDayScreen /> in the new design (a thread)', () => {
  it('the day, then each session and the daily log as replies joined by the line', async () => {
    mockRoute.params = { date: day(1) };
    mockApp.logs = [log(day(1), [50, 51], 9)];
    mockService.getReadingSessionsForDay.mockResolvedValue([reading(day(1), 21, 10, [60, 61]), reading(day(1), 6, 25)]);
    mockService.getJournalEntry.mockResolvedValue(entry(day(1), { revision: 'Juz 3 again', notes: 'Tired' }));
    render(<ActivityDayScreen />);

    expect(await screen.findByText('2 pages revised')).toBeTruthy();
    expect(screen.getByText('1 revision session · 2 timed · daily log')).toBeTruthy();
    expect(screen.getByText('Pages 60–61')).toBeTruthy();
    expect(screen.getByText('Add pages')).toBeTruthy();
    expect(screen.getByText('Revision: Juz 3 again')).toBeTruthy();
    expect(screen.getByText('Tired')).toBeTruthy();
    // day → revision → 25m → 10m → daily log: 1 + 2 + 2 + 2 + 1 line segments.
    expect(screen.getAllByTestId('thread-line', { includeHiddenElements: true })).toHaveLength(8);
    // The completed revision session is the jade done mark.
    expect(screen.getAllByTestId('mark-done', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('a timed session’s ⋯ deletes it after confirming', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRoute.params = { date: today };
    const s = reading(today, 9, 20);
    mockService.getReadingSessionsForDay.mockResolvedValue([s]);
    render(<ActivityDayScreen />);
    fireEvent.press(await screen.findByTestId(`day-reply-${s.id}-menu`));
    fireEvent.press(screen.getByText('Delete session'));
    // The menu's action runs once it has gone (iOS: onDismiss).
    const { Modal } = jest.requireActual('react-native');
    act(() => {
      screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
    });
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Delete')?.onPress?.();
    });
    expect(mockService.deleteReadingSession).toHaveBeenCalledWith(s.id);
    alert.mockRestore();
  });

  it('an empty day still has the daily log to write', async () => {
    mockRoute.params = { date: today };
    render(<ActivityDayScreen />);
    expect(await screen.findByText('Nothing logged yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Write'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('JournalEntry', { date: today });
  });
});
