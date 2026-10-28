import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ActivityScreen from '../ActivityScreen';
import ActivityDayScreen from '../ActivityDayScreen';
import { getRevisionDayForUser } from '../../../lib/fajrBoundary';
import type { ReadingSession, RevisionLog, User } from '../../../types';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));
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

// The rest of both screens is covered in ActivityScreens.v2.test.tsx.
describe('<ActivityScreen />', () => {
  it('still shows what loaded when one source fails, and retries', async () => {
    mockApp.logs = [log(today, [5])];
    mockService.getJournalEntries.mockRejectedValue(new Error('offline'));
    render(<ActivityScreen />);
    expect(await screen.findByText(/Couldn't load all of your activity/)).toBeTruthy();
    expect(screen.getByText('Revised 1 page')).toBeTruthy();
    expect(screen.queryByTestId('recent-empty')).toBeNull();
    mockService.getJournalEntries.mockResolvedValue([]);
    await act(async () => {
      fireEvent.press(screen.getByText(/Couldn't load all of your activity/));
    });
    await waitFor(() => expect(screen.queryByText(/Couldn't load all of your activity/)).toBeNull());
  });
});

describe('<ActivityDayScreen />', () => {
  it('edits a revision session', async () => {
    mockRoute.params = { date: today };
    mockApp.logs = [log(today, [1])];
    render(<ActivityDayScreen />);
    fireEvent.press(await screen.findByLabelText(/^Revision session, 1 pages? revised\. Edit$/));
    expect(screen.getByText(`Editing log-${today}`)).toBeTruthy();
  });

  it('assigns pages to a timed session', async () => {
    mockRoute.params = { date: today };
    const s = reading(today, 9, 20);
    mockService.getReadingSessionsForDay.mockResolvedValue([s]);
    render(<ActivityDayScreen />);
    fireEvent.press(await screen.findByLabelText('Timed session, 20m. Edit pages'));
    fireEvent.changeText(screen.getByPlaceholderText('e.g. 45–52, 60'), '45-47');
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });
    expect(mockService.updateReadingSessionPages).toHaveBeenCalledWith(s.id, [45, 46, 47]);
    expect(await screen.findByText('Pages 45–47')).toBeTruthy();
  });
});
