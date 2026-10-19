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
  const { colors } = require('../../../theme/colors');
  return { useTheme: () => ({ theme: colors, isDark: false }) };
});

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

describe('<ActivityScreen />', () => {
  it('welcomes a new user instead of blank days', async () => {
    mockApp.user = { ...user, createdAt: new Date().toISOString() };
    render(<ActivityScreen />);
    expect(await screen.findByText('Your activity will show up here')).toBeTruthy();
    expect(screen.queryByText('RECENT')).toBeNull();
    fireEvent.press(screen.getAllByLabelText('Log today')[0]);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('JournalEntry', { date: today });
  });

  it('merges revision, timed sessions and the daily log by day', async () => {
    mockApp.logs = [log(today, [1, 2, 3], 12)];
    mockService.getReadingSessions.mockResolvedValue([reading(today, 9, 20), reading(day(1), 7, 15)]);
    mockService.getJournalEntries.mockResolvedValue([entry(day(2), { memorization: '1/2 p3' })]);
    render(<ActivityScreen />);

    expect(await screen.findByText('Today')).toBeTruthy();
    expect(screen.getByText(/^Revised 3p/)).toBeTruthy();
    expect(screen.getAllByText('Timed session')).toHaveLength(2);
    expect(screen.getByText('20m')).toBeTruthy();
    expect(screen.getByText('32m')).toBeTruthy(); // today's total: 12m revision + 20m timed
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('1/2 p3')).toBeTruthy();
    // Week summary: 3 pages, 35 min timed, 3 of 7 days active.
    expect(screen.getByText('35m')).toBeTruthy();
    expect(screen.getByText('3 of 7 days active')).toBeTruthy();
  });

  it('opens a day, including an empty one for backfilling', async () => {
    mockService.getReadingSessions.mockResolvedValue([reading(day(3), 9, 5)]);
    render(<ActivityScreen />);
    fireEvent.press(await screen.findByLabelText('Today: nothing logged'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ActivityDay', { date: today });
    fireEvent.press(screen.getByLabelText(/^Open /));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ActivityDay', { date: day(3) });
  });

  it('lists older days under Earlier', async () => {
    mockService.getJournalEntries.mockResolvedValue([entry(day(40), { notes: 'Old note' })]);
    render(<ActivityScreen />);
    expect(await screen.findByText('EARLIER')).toBeTruthy();
    expect(screen.getByText('Old note')).toBeTruthy();
  });

  it('still shows what loaded when one source fails', async () => {
    mockApp.logs = [log(today, [5])];
    mockService.getJournalEntries.mockRejectedValue(new Error('offline'));
    render(<ActivityScreen />);
    expect(await screen.findByText(/Couldn't load all of your activity/)).toBeTruthy();
    expect(screen.getByText(/^Revised 1p/)).toBeTruthy();
    expect(screen.queryByText('Your activity will show up here')).toBeNull();
  });
});

describe('<ActivityDayScreen />', () => {
  it('shows each kind of activity for the day', async () => {
    mockRoute.params = { date: day(1) };
    mockApp.logs = [log(day(1), [50, 51], 9), log(today, [7])];
    mockService.getReadingSessionsForDay.mockResolvedValue([
      reading(day(1), 21, 10, [60, 61]),
      reading(day(1), 6, 25),
    ]);
    mockService.getJournalEntry.mockResolvedValue(entry(day(1), { revision: 'Juz 3 again', notes: 'Tired' }));
    render(<ActivityDayScreen />);

    expect(await screen.findByText('Yesterday')).toBeTruthy();
    expect(mockService.getReadingSessionsForDay).toHaveBeenCalledWith(day(1));
    expect(screen.getByText('2 pages revised')).toBeTruthy();
    expect(screen.queryByText('1 page revised')).toBeNull(); // today's log is not this day
    expect(screen.getByText('p. 60–61')).toBeTruthy();
    expect(screen.getByText('Add pages')).toBeTruthy();
    // Oldest first.
    const durations = screen.getAllByText(/^(25m|10m)$/).map((n) => n.props.children);
    expect(durations).toEqual(['25m', '10m']);
    expect(screen.getByText('Juz 3 again')).toBeTruthy();
    expect(screen.getByText('Tired')).toBeTruthy();
  });

  it('has a place for each kind on an empty day', async () => {
    mockRoute.params = { date: today };
    render(<ActivityDayScreen />);
    expect(await screen.findByText('No revision session this day.')).toBeTruthy();
    expect(screen.getByText(/No timed sessions/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Add to daily log'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('JournalEntry', { date: today });
  });

  it('edits a revision session', async () => {
    mockRoute.params = { date: today };
    mockApp.logs = [log(today, [1])];
    render(<ActivityDayScreen />);
    fireEvent.press(await screen.findByLabelText('Edit revision session'));
    expect(screen.getByText(`Editing log-${today}`)).toBeTruthy();
  });

  it('assigns pages to a timed session', async () => {
    mockRoute.params = { date: today };
    const s = reading(today, 9, 20);
    mockService.getReadingSessionsForDay.mockResolvedValue([s]);
    render(<ActivityDayScreen />);
    fireEvent.press(await screen.findByLabelText('Timed session, 20m'));
    fireEvent.changeText(screen.getByPlaceholderText('e.g. 45–52, 60'), '45-47');
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });
    expect(mockService.updateReadingSessionPages).toHaveBeenCalledWith(s.id, [45, 46, 47]);
    expect(await screen.findByText('p. 45–47')).toBeTruthy();
  });

  it('deletes a timed session after confirming', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRoute.params = { date: today };
    const s = reading(today, 9, 20);
    mockService.getReadingSessionsForDay.mockResolvedValue([s]);
    render(<ActivityDayScreen />);
    fireEvent(await screen.findByLabelText('Timed session, 20m'), 'longPress');
    expect(mockService.deleteReadingSession).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Delete')?.onPress?.();
    });
    expect(mockService.deleteReadingSession).toHaveBeenCalledWith(s.id);
    await waitFor(() => expect(screen.getByText(/No timed sessions/)).toBeTruthy());
    alert.mockRestore();
  });
});
