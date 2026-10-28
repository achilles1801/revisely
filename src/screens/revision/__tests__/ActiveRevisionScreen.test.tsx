// Regression: unchecking pages that were already saved must take them back
// out of today's session (it used to only ever add, so 7/10 stayed 7/10).
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import ActiveRevisionScreen from '../ActiveRevisionScreen';
import { getCurrentRevisionDay } from '../../../lib/algorithm';
import type { RevisionLog, User, UserPage } from '../../../types';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));
// The page: a tap toggles the controls, and the test can swipe it (and onto
// the end card after the last page, which it shows).
const mockPager: {
  onUserSwipe?: () => void;
  onPageChange?: (p: number) => void;
  onReachEnd?: (lastPage: number, bySwipe: boolean) => void;
} = {};
jest.mock('../../../components/MushafPager', () => {
  const { Pressable, View } = require('react-native');
  return {
    MushafPager: (props: {
      onTap?: () => void;
      onUserSwipe?: () => void;
      onPageChange?: (p: number) => void;
      onReachEnd?: (lastPage: number, bySwipe: boolean) => void;
      endCard?: React.ReactNode;
    }) => {
      mockPager.onUserSwipe = props.onUserSwipe;
      mockPager.onPageChange = props.onPageChange;
      mockPager.onReachEnd = props.onReachEnd;
      return (
        <View>
          <Pressable accessibilityLabel="The page" onPress={props.onTap} />
          {props.endCard}
        </View>
      );
    },
  };
});
let mockReduceMotion = false;
jest.mock('../../../design/motion', () => ({ useReduceMotion: () => mockReduceMotion }));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ key: 'ActiveRevision-1', name: 'ActiveRevision' }),
  useIsFocused: () => true,
}));
jest.mock('../../../navigation/navigationRef', () => ({ navigateToActivityDay: jest.fn() }));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('../../../context/ReadingTimerContext', () => ({
  useReadingTimer: () => ({
    timer: null,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    finish: jest.fn(),
    discard: jest.fn(),
    notePage: jest.fn(),
    noteRevisedPages: jest.fn(),
  }),
  useNow: () => Date.now(),
}));

const mockApp: any = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});

const DAY_PAGES = [331, 332, 333, 334, 335, 336, 337, 338, 339, 340];

function setup(revised: number[], dayPages: number[] = DAY_PAGES) {
  const user = {
    id: 'u1',
    createdAt: '2026-09-01T00:00:00.000Z',
    smartTrackingEnabled: false,
    hasSeenSmartTrackingPreview: true,
    dailyPageCapacity: 10,
    scheduleMode: 'pages',
    dailyJuzCount: 1,
    reminderTime: '08:00',
    notificationsEnabled: true,
    currentMemorizationJuz: null,
    currentMemorizationPage: null,
    currentKhatamPage: 1,
    savedPlans: [],
    streak: 0,
    lastRevisionDate: null,
    memorizedSurahs: [],
    fajrBoundaryEnabled: false,
    locationCoords: null,
    fajrCalculationMethod: 'NorthAmerica',
    scheduleAnchorDate: '2026-09-01',
    customPlan: null,
  } as User;
  const today = getCurrentRevisionDay(user);
  user.customPlan = { days: [dayPages], cycleStartDate: today, direction: 'forward' };

  const pages: UserPage[] = Array.from({ length: 604 }, (_, i) => ({
    pageNumber: i + 1,
    status: dayPages.includes(i + 1) ? 'memorized' : 'not_memorized',
    dateMemorized: null,
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  }));
  const todaysLog: RevisionLog = {
    id: today,
    date: today,
    assignedPages: dayPages,
    pagesRevised: revised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: 12,
  };
  Object.assign(mockApp, {
    user,
    pages,
    logs: [todaysLog],
    error: null,
    loadData: jest.fn(),
    updatePages: jest.fn(() => Promise.resolve()),
    addLog: jest.fn(() => Promise.resolve()),
    updateLog: jest.fn(() => Promise.resolve()),
  });
  return todaysLog;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReduceMotion = false;
});

describe('ActiveRevisionScreen — unchecking saved pages', () => {
  it('removes an unchecked page from today’s session on exit', async () => {
    // Everything saved already, so the screen opens on the first page (331).
    const log = setup(DAY_PAGES);
    render(<ActiveRevisionScreen />);
    expect(screen.getByText(/10\/10/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Unmark current page'));
    expect(screen.getByText(/9\/10/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });

    expect(mockApp.updateLog).toHaveBeenCalledTimes(1);
    expect(mockApp.updateLog).toHaveBeenCalledWith({
      ...log,
      pagesRevised: DAY_PAGES.filter((p) => p !== 331),
    });
    // Nothing new was checked, so nothing is added.
    expect(mockApp.addLog).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('only adds when nothing saved was unchecked', async () => {
    setup([332, 333]);
    render(<ActiveRevisionScreen />);
    // Opens on 331 (first unrevised); show the controls, mark it and leave.
    fireEvent.press(screen.getByLabelText('The page'));
    fireEvent.press(screen.getByLabelText('Mark current page as revised'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });
    expect(mockApp.addLog).toHaveBeenCalledWith(
      expect.objectContaining({ pagesRevised: [331] }),
    );
    expect(mockApp.updateLog).not.toHaveBeenCalled();
  });
});

// The controls stay rendered (they fade); hidden, they are hidden from screen readers too.
const byTestId = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });

describe('ActiveRevisionScreen — a failed load', () => {
  it('shows the error with Try again, then the session once the data arrives', () => {
    const log = setup([]);
    const loaded = { ...mockApp };
    Object.assign(mockApp, { user: null, pages: [], logs: [], error: 'Network error' });
    const view = render(<ActiveRevisionScreen />);
    expect(screen.getByText("Couldn't load your session")).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(mockApp.loadData).toHaveBeenCalled();
    // The retry succeeds: the same screen now has more to render (hooks included).
    Object.assign(mockApp, { ...loaded, logs: [log] });
    view.rerender(<ActiveRevisionScreen />);
    expect(screen.queryByText("Couldn't load your session")).toBeNull();
    expect(screen.getByTestId('reader-background')).toBeTruthy();
  });
});

describe('ActiveRevisionScreen — reading and the controls', () => {
  it('opens on the page alone: its number, the juz and surah; the controls hidden', () => {
    setup([332, 333]);
    render(<ActiveRevisionScreen />);
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(true);
    expect(byTestId('reader-footer').props.pointerEvents).toBe('none');
    expect(screen.getByText('331')).toBeTruthy();
    expect(screen.queryByLabelText('Mark current page as revised')).toBeNull();
  });

  it('a tap on the page shows the controls; turning the page hides them', () => {
    setup([332, 333]);
    render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(false);
    expect(screen.getByLabelText('Play from this page')).toBeTruthy();
    expect(screen.getByLabelText('Record your recitation')).toBeTruthy();
    expect(screen.getByLabelText('Open timer')).toBeTruthy();
    act(() => mockPager.onUserSwipe?.());
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(true);
    // And a second tap hides them too.
    fireEvent.press(screen.getByLabelText('The page'));
    fireEvent.press(screen.getByLabelText('The page'));
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(true);
  });

  it('with every page revised, the controls stay up with Submit (a swipe or tap doesn’t hide them)', () => {
    setup(DAY_PAGES);
    render(<ActiveRevisionScreen />);
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(false);
    expect(within(byTestId('reader-footer')).getByLabelText('Submit session')).toBeTruthy();
    act(() => mockPager.onUserSwipe?.());
    fireEvent.press(screen.getByLabelText('The page'));
    expect(within(byTestId('reader-footer')).getByLabelText('Submit session')).toBeTruthy();
  });

  it('arriving on the last page marks nothing and leaves the controls as they were (the end card is next)', () => {
    setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    render(<ActiveRevisionScreen />);
    act(() => {
      mockPager.onUserSwipe?.();
      mockPager.onPageChange?.(340);
    });
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(true);
    expect(screen.getAllByText(/9\/10/).length).toBeGreaterThan(0);
  });

  it('a tap above or below the page toggles the controls too', () => {
    setup([332, 333]);
    render(<ActiveRevisionScreen />);
    fireEvent.press(byTestId('reader-background'));
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(false);
  });
});

// "When I reach the last page I can't swipe anymore": the end card after it.
describe('ActiveRevisionScreen — swiping off the last page', () => {
  const finish = () =>
    act(async () => {
      mockPager.onReachEnd?.(340, true);
    });

  it('marks it done and finishes the session: confetti, a success buzz, saved at once, Revision complete', async () => {
    setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    render(<ActiveRevisionScreen />);
    expect(screen.getByText('9 of 10 revised')).toBeTruthy();
    await finish();
    expect(screen.getAllByText(/10\/10/).length).toBeGreaterThan(0);
    expect(screen.getByText('Revision complete')).toBeTruthy();
    expect(screen.getByText('10 pages revised today')).toBeTruthy();
    expect(screen.getByTestId('confetti', { includeHiddenElements: true })).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(mockApp.addLog).toHaveBeenCalledWith(expect.objectContaining({ pagesRevised: [340] }));
    // No "marked as revised · Undo" for the page that finished it.
    expect(screen.queryByText('Page 340 marked as revised')).toBeNull();
  });

  it('a one-page session finishes the same way', async () => {
    setup([], [582]);
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(582, true);
    });
    expect(screen.getByText('Revision complete')).toBeTruthy();
    expect(screen.getByText('1 page revised today')).toBeTruthy();
    expect(mockApp.addLog).toHaveBeenCalledWith(expect.objectContaining({ pagesRevised: [582] }));
  });

  it('pages left: the last page is marked (with Undo), no confetti; the card counts and offers End session', async () => {
    setup([331, 332, 333, 334, 335]);
    render(<ActiveRevisionScreen />);
    await finish();
    expect(screen.getByText('Page 340 marked as revised')).toBeTruthy();
    expect(screen.getByText('6 of 10 revised')).toBeTruthy();
    expect(screen.getByTestId('session-end-end')).toBeTruthy();
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('getting there without a swipe (a jump) marks nothing', async () => {
    setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, false);
    });
    expect(screen.getByText('9 of 10 revised')).toBeTruthy();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('every page already done: the card says so, without a burst or a buzz', async () => {
    setup(DAY_PAGES);
    render(<ActiveRevisionScreen />);
    await finish();
    expect(screen.getByText('Revision complete')).toBeTruthy();
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('back to the last page and onto the card again after finishing: celebrated once', async () => {
    setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    render(<ActiveRevisionScreen />);
    await finish();
    act(() => mockPager.onPageChange?.(340));
    await finish();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(mockApp.addLog).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/10\/10/).length).toBeGreaterThan(0);
  });

  it('Reduce Motion: no confetti, the check instead', async () => {
    mockReduceMotion = true;
    setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    render(<ActiveRevisionScreen />);
    await finish();
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('session-end-check')).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('finished: the header names the last page, Submit is in the controls (not twice), and ends the session', async () => {
    setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    render(<ActiveRevisionScreen />);
    await finish();
    expect(screen.getByText(/^Page 340 ·/)).toBeTruthy();
    expect(screen.queryByTestId('session-end-end')).toBeNull();
    expect(screen.getAllByLabelText('Submit session')).toHaveLength(1);
    await act(async () => {
      fireEvent.press(within(byTestId('reader-footer')).getByLabelText('Submit session'));
    });
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('pages left: End session on the card ends it (the rest skipped)', async () => {
    setup([331, 332, 333, 334, 335]);
    render(<ActiveRevisionScreen />);
    await finish();
    await act(async () => {
      fireEvent.press(screen.getByTestId('session-end-end'));
    });
    expect(mockApp.addLog).toHaveBeenCalledWith(expect.objectContaining({ pagesRevised: [340] }));
    expect(mockApp.updatePages).toHaveBeenLastCalledWith(expect.any(Array), [336, 337, 338, 339]);
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});
