import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ActivityScreen from '../ActivityScreen';
import ActivityDayScreen from '../ActivityDayScreen';
import ActivityAllScreen from '../ActivityAllScreen';
import { paletteLight } from '../../../theme/v2';
import { monthTitle, weekStart, weekTitle } from '../../../lib/activityHeatmap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyJournalEntry, shiftDay } from '../../../lib/journal';
import { getRevisionDayForUser } from '../../../lib/fajrBoundary';
import type { JournalEntry, ReadingSession, RevisionLog, User } from '../../../types';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
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

const layoutCalendar = async () => {
  fireEvent(await screen.findByTestId('calendar-month'), 'layout', { nativeEvent: { layout: { width: 370, height: 300 } } });
};
const flat = (id: string) => Object.assign({}, ...[screen.getByTestId(id).props.style].flat(3).filter(Boolean));
const shade = (date: string) => flat(`heat-fill-${date}`).backgroundColor;
const ring = (date: string) => flat(`heat-${date}`).borderColor;
// A day a few days back can be in last month: step back to it.
const showMonthOf = (date: string) => {
  if (screen.getByTestId('calendar-title').props.children !== monthTitle(date.slice(0, 7))) {
    fireEvent.press(screen.getByTestId('calendar-back'));
  }
};

describe('<ActivityScreen /> in the new design', () => {
  beforeEach(() => AsyncStorage.clear());

  it('a month by default; the picked day in a line under it; the last three things done', async () => {
    mockApp.logs = [log(today, Array.from({ length: 20 }, (_, i) => i + 1), 30)];
    mockService.getReadingSessions.mockResolvedValue([reading(day(1), 7, 15), reading(day(3), 9, 5)]);
    mockService.getJournalEntries.mockResolvedValue([entry(day(2), { memorization: '1/2 p3' })]);
    render(<ActivityScreen />);
    await layoutCalendar();

    expect(screen.getByTestId('calendar-title').props.children).toBe(monthTitle(today.slice(0, 7)));
    // This month is the last one there is.
    expect(screen.getByTestId('calendar-forward').props.accessibilityState).toMatchObject({ disabled: true });
    // A juz is level 3; today is picked to begin with.
    expect(shade(today)).toBe(paletteLight.heat[3]);
    expect(ring(today)).toBe(paletteLight.text);
    expect(screen.getByLabelText('Today: 20 pages revised, 30 min. Open the day')).toBeTruthy();

    // 15 timed minutes is level 2; picking it says so, and the line opens it.
    showMonthOf(day(1));
    expect(shade(day(1))).toBe(paletteLight.heat[2]);
    fireEvent.press(screen.getByTestId(`heat-${day(1)}`));
    expect(ring(day(1))).toBe(paletteLight.text);
    fireEvent.press(screen.getByLabelText(/: 15 min\. Open the day$/));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ActivityDay', { date: day(1) });

    // A note alone is level 1; nothing is 0, says so, and doesn't open.
    showMonthOf(day(2));
    expect(shade(day(2))).toBe(paletteLight.heat[1]);
    showMonthOf(day(4));
    expect(shade(day(4))).toBe(paletteLight.heat[0]);
    fireEvent.press(screen.getByTestId(`heat-${day(4)}`));
    expect(screen.queryByLabelText(/Open the day$/)).toBeNull();
    expect(screen.getByText(/No activity/)).toBeTruthy();

    // Recent: the latest three, nothing older, no "Earlier", no filter pills.
    expect(screen.getByText('Revised 20 pages')).toBeTruthy();
    expect(screen.getByText('Read for 15 min')).toBeTruthy();
    expect(screen.getByText('Daily log')).toBeTruthy();
    expect(screen.queryByText('Read for 5 min')).toBeNull();
    expect(screen.queryByText('Earlier')).toBeNull();
    expect(screen.queryByText('All dates')).toBeNull();
    fireEvent.press(screen.getByText('Read for 15 min'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ActivityDay', { date: day(1) });
    fireEvent.press(screen.getByText('See all'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ActivityAll');
  });

  it('Week shows the seven days with what each held, steps back a week, and is remembered', async () => {
    mockApp.logs = [log(today, [1, 2, 3], 12)];
    render(<ActivityScreen />);
    await layoutCalendar();
    fireEvent.press(screen.getByTestId('pill-week'));

    expect(screen.queryByTestId('calendar-month')).toBeNull();
    expect(screen.getByTestId('calendar-title').props.children).toBe(weekTitle(weekStart(today), today));
    expect(screen.getByLabelText('Today: 3 pages revised, 12 min. Open the day')).toBeTruthy();
    fireEvent.press(screen.getByTestId(`week-${today}`));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ActivityDay', { date: today });
    expect(await AsyncStorage.getItem('@revisely_activity_range')).toBe('week');

    fireEvent.press(screen.getByTestId('calendar-back'));
    expect(screen.getByTestId('calendar-title').props.children).toBe(weekTitle(shiftDay(weekStart(today), -7), today));
    expect(screen.getByTestId(`week-${shiftDay(weekStart(today), -7)}`)).toBeTruthy();
  });

  it('nothing yet: an empty month and one line instead of a list', async () => {
    render(<ActivityScreen />);
    await layoutCalendar();
    expect(shade(today)).toBe(paletteLight.heat[0]);
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
    expect(screen.getByTestId('recent-empty').props.children).toBe('No sessions yet. Start your first revision from Home.');
    expect(screen.queryByText('See all')).toBeNull();
    fireEvent.press(screen.getByLabelText('Log today'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('JournalEntry', { date: today });
  });
});

describe('<ActivityAllScreen /> (See all)', () => {
  beforeEach(() => {
    mockApp.logs = [log(today, [1, 2, 3], 12)];
    mockService.getReadingSessions.mockResolvedValue([reading(day(1), 7, 15, [293, 294])]);
    mockService.getJournalEntries.mockResolvedValue([entry(day(2), { memorization: '1/2 p3' })]);
  });

  it('everything, newest first; search and the kind and date filters narrow it', async () => {
    render(<ActivityAllScreen />);
    expect(await screen.findByText('Revised 3 pages')).toBeTruthy();
    expect(screen.getByText('Read for 15 min')).toBeTruthy();
    expect(screen.getByTestId(`item-log-${day(2)}`)).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('activity-search'), 'kahf');
    expect(screen.queryByText('Revised 3 pages')).toBeNull();
    expect(screen.getByText('Read for 15 min')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('activity-search'), 'zzz');
    expect(screen.getByText('Nothing matches.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Clear search'));

    fireEvent.press(screen.getByTestId('filter-log'));
    expect(screen.getByTestId(`item-log-${day(2)}`)).toBeTruthy();
    expect(screen.queryByText('Read for 15 min')).toBeNull();
    fireEvent.press(screen.getByTestId('filter-all'));
    fireEvent.press(screen.getByText('Read for 15 min'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ActivityDay', { date: day(1) });
  });

  it('opens on a kind when asked (Home’s See all shows sessions)', async () => {
    (mockRoute.params as { kind?: string }).kind = 'revision';
    render(<ActivityAllScreen />);
    expect(await screen.findByText('Revised 3 pages')).toBeTruthy();
    expect(screen.queryByText('Read for 15 min')).toBeNull();
    expect(screen.queryByTestId(`item-log-${day(2)}`)).toBeNull();
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
