// Regression: unchecking pages that were already saved must take them back
// out of today's session (it used to only ever add, so 7/10 stayed 7/10).
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import ActiveRevisionScreen from '../ActiveRevisionScreen';
import { getCurrentRevisionDay } from '../../../lib/algorithm';
import { dateToLocalISODay } from '../../../lib/schedulePlans';
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
  onAdvance?: (leftPage: number, currentPage: number) => void;
  pages?: number[];
  initialPage?: number;
  pageOverlay?: (page: number, scale: number) => React.ReactNode;
  onTapVerse?: (ayah: { page: number; sura: number; ayah: number }) => boolean;
} = {};
// The session's route params (Home's "starts at" line opens a later day).
let mockRouteParams: { aheadDay?: string } | undefined;
jest.mock('../../../components/MushafPager', () => {
  const { Pressable, View } = require('react-native');
  return {
    MushafPager: (props: {
      pages?: number[];
      initialPage?: number;
      onTap?: () => void;
      onUserSwipe?: () => void;
      onPageChange?: (p: number) => void;
      onAdvance?: (leftPage: number, currentPage: number) => void;
      onReachEnd?: (lastPage: number, bySwipe: boolean) => void;
      endCard?: React.ReactNode;
      pageOverlay?: (page: number, scale: number) => React.ReactNode;
      onTapVerse?: (ayah: { page: number; sura: number; ayah: number }) => boolean;
    }) => {
      mockPager.pages = props.pages;
      mockPager.initialPage = props.initialPage;
      mockPager.onAdvance = props.onAdvance;
      mockPager.onUserSwipe = props.onUserSwipe;
      mockPager.onPageChange = props.onPageChange;
      mockPager.onReachEnd = props.onReachEnd;
      mockPager.pageOverlay = props.pageOverlay;
      mockPager.onTapVerse = props.onTapVerse;
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
// The hidden mode's listening: the test sets what it reports and sees how it's used.
const mockListener = {
  active: false,
  onPause: undefined as undefined | (() => void),
  status: 'listening' as string,
  yieldMic: jest.fn(async () => undefined),
  resume: jest.fn(),
};
// Word by word (phase 2): the hook's state from the test, and how the screen uses it.
const mockFollow = {
  followable: true,
  status: 'finding' as string,
  active: false,
  round: undefined as number | undefined,
  onPageDone: undefined as undefined | ((p: number) => void),
};
jest.mock('../../../components/recite/useReciteFollow', () => ({
  canFollowWords: () => mockFollow.followable,
  useReciteFollow: (opts: { active: boolean; round?: number; onPageDone: (p: number) => void }) => {
    mockFollow.active = opts.active;
    mockFollow.round = opts.round;
    mockFollow.onPageDone = opts.onPageDone;
    return { status: mockFollow.status, available: mockFollow.followable, follow: null, heard: '', resume: jest.fn() };
  },
}));
let mockModelState: Record<string, unknown> = { status: 'missing', error: null };
jest.mock('../../../lib/recite/speechModelStore', () => ({
  useSpeechModelState: () => mockModelState,
  startModelDownload: jest.fn(),
  cancelModelDownload: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(async () => ({ type: 'wifi' })) }));
jest.mock('../../../components/recite/usePauseListener', () => ({
  usePauseListener: (opts: { active: boolean; onPause: () => void }) => {
    mockListener.active = opts.active;
    mockListener.onPause = opts.onPause;
    return { status: mockListener.status, hearing: false, yieldMic: mockListener.yieldMic, resume: mockListener.resume };
  },
}));

// The recorder: the real hook, unless a test gives one (a recording in progress).
let mockRecorder: Record<string, unknown> | null = null;
jest.mock('../../../hooks/useVoiceRecorder', () => {
  const actual = jest.requireActual('../../../hooks/useVoiceRecorder');
  return {
    ...actual,
    useVoiceRecorder: (opts: unknown) => mockRecorder ?? actual.useVoiceRecorder(opts),
  };
});
function recordingInProgress() {
  mockRecorder = {
    phase: 'recording',
    recording: true,
    paused: false,
    level: 0,
    elapsedMs: 0,
    start: jest.fn(async () => undefined),
    resume: jest.fn(async () => undefined),
    pause: jest.fn(async () => undefined),
    finish: jest.fn(async () => undefined),
    leave: jest.fn(async () => undefined),
  };
  return mockRecorder as { finish: jest.Mock };
}

// The day's recordings (Listen back on the end card).
let mockRecordings: unknown[] = [];
jest.mock('../../../lib/recordings', () => {
  const actual = jest.requireActual('../../../lib/recordings');
  return { ...actual, listRecordings: jest.fn(async () => mockRecordings) };
});

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ key: 'ActiveRevision-1', name: 'ActiveRevision', params: mockRouteParams }),
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
  mockListener.status = 'listening';
  mockListener.active = false;
  mockPager.pageOverlay = undefined;
  mockPager.onTapVerse = undefined;
  mockFollow.followable = true;
  mockFollow.status = 'finding';
  mockFollow.active = false;
  mockModelState = { status: 'missing', error: null };
  mockRecorder = null;
  mockRecordings = [];
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

// The iOS edge swipe and Android's back button close the screen without the
// Back arrow; a page marked since the last 5-second save used to be lost.
describe('ActiveRevisionScreen — every way out saves', () => {
  it('closed without Back: what was marked is saved', async () => {
    setup([332, 333]);
    const { unmount } = render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    fireEvent.press(screen.getByLabelText('Mark current page as revised'));
    expect(mockApp.addLog).not.toHaveBeenCalled();
    await act(async () => {
      unmount();
    });
    expect(mockApp.addLog).toHaveBeenCalledTimes(1);
    expect(mockApp.addLog).toHaveBeenCalledWith(expect.objectContaining({ pagesRevised: [331] }));
    expect(mockApp.updatePages).toHaveBeenCalledWith(expect.any(Array), [331]);
  });

  it('closed without Back: a saved page unchecked comes out of the session', async () => {
    const log = setup(DAY_PAGES);
    const { unmount } = render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('Unmark current page'));
    await act(async () => {
      unmount();
    });
    expect(mockApp.updateLog).toHaveBeenCalledTimes(1);
    expect(mockApp.updateLog).toHaveBeenCalledWith({
      ...log,
      pagesRevised: DAY_PAGES.filter((p) => p !== 331),
    });
  });

  it('Back, then the screen goes: saved once', async () => {
    setup([332, 333]);
    const { unmount } = render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    fireEvent.press(screen.getByLabelText('Mark current page as revised'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });
    await act(async () => {
      unmount();
    });
    expect(mockApp.addLog).toHaveBeenCalledTimes(1);
  });

  it('nothing marked: closing it writes nothing', async () => {
    setup([332, 333]);
    const { unmount } = render(<ActiveRevisionScreen />);
    await act(async () => {
      unmount();
    });
    expect(mockApp.addLog).not.toHaveBeenCalled();
    expect(mockApp.updatePages).not.toHaveBeenCalled();
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

  it('with every page revised, the controls stay up with Back (a swipe or tap doesn’t hide them); no Submit', () => {
    setup(DAY_PAGES);
    render(<ActiveRevisionScreen />);
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(false);
    act(() => mockPager.onUserSwipe?.());
    fireEvent.press(screen.getByLabelText('The page'));
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(false);
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.queryByLabelText('Submit session')).toBeNull();
    expect(screen.queryByText('Submit')).toBeNull();
  });

  it('the menu has no Save and exit or End session', () => {
    setup([332, 333]);
    render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    fireEvent.press(screen.getByLabelText('Session menu'));
    expect(screen.getByText('Jump or mark in bulk')).toBeTruthy();
    expect(screen.queryByText('Save and exit')).toBeNull();
    expect(screen.queryByText('End session')).toBeNull();
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

  it('pages left: the last page is marked (with Undo), no confetti; the card counts, with no button', async () => {
    setup([331, 332, 333, 334, 335]);
    render(<ActiveRevisionScreen />);
    await finish();
    expect(screen.getByText('Page 340 marked as revised')).toBeTruthy();
    expect(screen.getByText('6 of 10 revised')).toBeTruthy();
    expect(screen.getByText('Swipe back for the pages left.')).toBeTruthy();
    expect(screen.queryByText('End session')).toBeNull();
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

  it('finished: the header names the last page; Back leaves (saved once, nothing skipped)', async () => {
    setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    render(<ActiveRevisionScreen />);
    await finish();
    expect(screen.getByText(/^Page 340 ·/)).toBeTruthy();
    expect(screen.queryByText('Submit')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });
    expect(mockNavigation.goBack).toHaveBeenCalled();
    expect(mockApp.addLog).toHaveBeenCalledTimes(1);
    expect(mockApp.addLog).toHaveBeenCalledWith(expect.objectContaining({ pagesRevised: [340], pagesSkipped: [] }));
  });

  it('pages left: Back saves what was marked and skips nothing (reopening resumes at the first page left)', async () => {
    setup([331, 332, 333, 334, 335]);
    render(<ActiveRevisionScreen />);
    await finish();
    fireEvent.press(screen.getByLabelText('The page'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });
    expect(mockApp.addLog).toHaveBeenCalledTimes(1);
    expect(mockApp.addLog).toHaveBeenCalledWith(expect.objectContaining({ pagesRevised: [340], pagesSkipped: [] }));
    expect(mockApp.updatePages).toHaveBeenCalledTimes(1);
    expect(mockApp.updatePages).toHaveBeenCalledWith(expect.any(Array), [340]);
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});

// With Submit and End session gone, the last page marked completes the session.
describe('ActiveRevisionScreen — the session completes on its last page', () => {
  it('the check on the last page left saves at once (no waiting for the 5-second save)', async () => {
    setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    render(<ActiveRevisionScreen />);
    act(() => mockPager.onPageChange?.(340));
    fireEvent.press(screen.getByLabelText('The page'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Mark current page as revised'));
    });
    expect(mockApp.addLog).toHaveBeenCalledTimes(1);
    expect(mockApp.addLog).toHaveBeenCalledWith(expect.objectContaining({ pagesRevised: [340] }));
  });

  it('a recording in progress is finished when the session completes, as Submit did', async () => {
    const recorder = recordingInProgress();
    setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    expect(recorder.finish).toHaveBeenCalledTimes(1);
  });

  it('pages left: the recording is not finished (Back leaves it paused for later)', async () => {
    const recorder = recordingInProgress();
    setup([331, 332, 333, 334, 335]);
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    fireEvent.press(screen.getByLabelText('The page'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });
    expect(recorder.finish).not.toHaveBeenCalled();
  });

  it('a day already done when the screen opens finishes nothing and saves nothing', async () => {
    const recorder = recordingInProgress();
    setup(DAY_PAGES);
    const { unmount } = render(<ActiveRevisionScreen />);
    await act(async () => {
      unmount();
    });
    expect(recorder.finish).not.toHaveBeenCalled();
    expect(mockApp.addLog).not.toHaveBeenCalled();
  });

  it('unchecking a page and checking it again completes it again, but saves once', async () => {
    const recorder = recordingInProgress();
    setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    act(() => mockPager.onPageChange?.(340));
    fireEvent.press(screen.getByLabelText('Unmark current page'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Mark current page as revised'));
    });
    expect(mockApp.addLog).toHaveBeenCalledTimes(1);
    expect(recorder.finish).toHaveBeenCalledTimes(2);
  });
});

// Hidden pages (the recite mode), for testers: the eye covers the page; a verse
// shows when tapped, with Next verse, or after a pause in the reciter's voice.
describe('ActiveRevisionScreen — keep going (revise ahead, #168)', () => {
  const NEXT = [341, 342, 343];
  const today = () => getCurrentRevisionDay(mockApp.user as User);
  const tomorrow = () => {
    const [y, m, d] = today().split('-').map(Number);
    return dateToLocalISODay(new Date(y, m - 1, d + 1));
  };

  // Today's pages, then the next revision day's: a two-day cycle.
  function setupTwoDays(revised: number[]) {
    setup(revised);
    const user = mockApp.user as User;
    user.customPlan = { days: [DAY_PAGES, NEXT], cycleStartDate: today(), direction: 'forward' };
    mockApp.pages = mockApp.pages.map((p: UserPage) =>
      NEXT.includes(p.pageNumber) ? { ...p, status: 'memorized' } : p,
    );
  }

  beforeEach(() => {
    mockRouteParams = undefined;
  });

  it('after the last page, Keep going adds the next day’s pages; leaving saves them as credit for that day', async () => {
    setupTwoDays([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    const { unmount } = render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    expect(screen.getByText('Revision complete')).toBeTruthy();
    expect(screen.getByText(/Next: .* · 3 pages/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('session-end-keep-going'));
    expect(mockPager.pages).toEqual([...DAY_PAGES, ...NEXT]);
    expect(screen.getByText(/^Revising ahead/)).toBeTruthy();

    // One page of the next day, checked, then leave.
    fireEvent.press(screen.getByLabelText('Mark current page as revised'));
    await act(async () => {
      unmount();
    });
    expect(mockApp.addLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagesRevised: [341], ahead: { [tomorrow()]: [341] } }),
    );
  });

  it('at the end of the cycle there is no Keep going', async () => {
    setup(DAY_PAGES.slice(0, 9));
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    expect(screen.getByText('Revision complete')).toBeTruthy();
    expect(screen.queryByTestId('session-end-keep-going')).toBeNull();
  });

  it('swiping off a later day’s page marks it, as a page of today', async () => {
    setupTwoDays(DAY_PAGES);
    mockRouteParams = { aheadDay: tomorrow() };
    const { unmount } = render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onAdvance?.(NEXT[0], NEXT[1]);
    });
    await act(async () => {
      unmount();
    });
    expect(mockApp.addLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagesRevised: [NEXT[0]], ahead: { [tomorrow()]: [NEXT[0]] } }),
    );
  });

  it('a swipe off a page the screen is not showing credits nothing', async () => {
    setupTwoDays(DAY_PAGES);
    mockRouteParams = { aheadDay: tomorrow() };
    const { unmount } = render(<ActiveRevisionScreen />);
    // The screen shows NEXT[0]; a swipe that claims to leave NEXT[2] is a mismatch.
    await act(async () => {
      mockPager.onAdvance?.(NEXT[2], NEXT[0]);
    });
    await act(async () => {
      unmount();
    });
    expect(mockApp.addLog).not.toHaveBeenCalled();
  });

  it('the end card after a later day’s last page marks it, as for today', async () => {
    setupTwoDays(DAY_PAGES);
    mockRouteParams = { aheadDay: tomorrow() };
    const { unmount } = render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(NEXT[2], true);
    });
    await act(async () => {
      unmount();
    });
    expect(mockApp.addLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagesRevised: [NEXT[2]], ahead: { [tomorrow()]: [NEXT[2]] } }),
    );
  });

  it('Home’s “starts at” line opens on that day’s first page, with today’s pages behind it', () => {
    setupTwoDays(DAY_PAGES);
    mockRouteParams = { aheadDay: tomorrow() };
    render(<ActiveRevisionScreen />);
    expect(mockPager.pages).toEqual([...DAY_PAGES, ...NEXT]);
    // The pager starts there (not on today's first page), and the page on
    // screen is tomorrow's: its check reflects tomorrow, not today.
    expect(mockPager.initialPage).toBe(NEXT[0]);
    expect(screen.getByText(/^Revising ahead/)).toBeTruthy();
    expect(screen.getByLabelText('Mark current page as revised')).toBeTruthy();
  });

  it('a day revised ahead earlier opens on its first page already checked', () => {
    setupTwoDays(DAY_PAGES);
    mockApp.logs = [
      ...mockApp.logs,
      {
        id: 'earlier',
        date: today(),
        assignedPages: [],
        pagesRevised: [NEXT[0]],
        pagesSkipped: [],
        weaknessUpdates: [],
        durationMinutes: 5,
        ahead: { [tomorrow()]: [NEXT[0]] },
      },
    ];
    mockRouteParams = { aheadDay: tomorrow() };
    render(<ActiveRevisionScreen />);
    expect(mockPager.initialPage).toBe(NEXT[0]);
    expect(screen.getByLabelText('Unmark current page')).toBeTruthy();
  });

  it('Keep going moves the page on screen to the next day’s first page', async () => {
    setupTwoDays(DAY_PAGES);
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    fireEvent.press(screen.getByTestId('session-end-keep-going'));
    expect(screen.getByLabelText('Mark current page as revised')).toBeTruthy();
    expect(screen.getByText(/^Revising ahead/)).toBeTruthy();
  });
});

describe('ActiveRevisionScreen — hidden pages (testers)', () => {
  const tester = () => {
    setup([]);
    mockApp.user = { ...mockApp.user, previewTester: true };
  };
  const hide = () => fireEvent.press(screen.getByLabelText('Hide the page'));

  it('not a tester: no eye, and nothing listens', () => {
    setup([]);
    render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    expect(screen.queryByLabelText('Hide the page')).toBeNull();
    expect(mockListener.active).toBe(false);
    expect(mockPager.pageOverlay).toBeUndefined();
  });

  it('the eye hides the page: covers over it, the recite panel in the player’s place, listening', () => {
    tester();
    render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    hide();
    expect(mockListener.active).toBe(true);
    expect(screen.getByTestId('recite-panel')).toBeTruthy();
    expect(screen.queryByTestId('player-capsule')).toBeNull();
    // The quiet row (hidden from VoiceOver while the controls are up).
    expect(screen.getByText('Hidden · 0/10', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Pause after a verse to see it', { includeHiddenElements: true })).toBeTruthy();
    render(<>{mockPager.pageOverlay?.(331, 0.5)}</>);
    expect(screen.getAllByTestId('hidden-cover').length).toBeGreaterThan(5);
  });

  it('a tap on a hidden verse shows it (and doesn’t toggle the controls); on shown text it does', () => {
    tester();
    render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    hide();
    const { versesOnPage } = require('../../../lib/ayahBounds');
    const [first] = versesOnPage(331);
    let taken = false;
    act(() => {
      taken = mockPager.onTapVerse!(first);
    });
    expect(taken).toBe(true);
    expect(mockPager.onTapVerse!(first)).toBe(false);
  });

  it('a pause after a verse shows the next one, in order; Next verse too', () => {
    tester();
    render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    hide();
    const { versesOnPage } = require('../../../lib/ayahBounds');
    const [v1, v2, v3] = versesOnPage(331);
    act(() => mockListener.onPause?.());
    // Shown now: a tap on it isn't taken.
    expect(mockPager.onTapVerse!(v1)).toBe(false);
    expect(mockPager.onTapVerse!(v3)).toBe(true);
    fireEvent.press(screen.getByLabelText('Show the next verse'));
    expect(mockPager.onTapVerse!(v2)).toBe(false);
  });

  it('Record while hidden: the listener gives the microphone up first', async () => {
    tester();
    render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    hide();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Record your recitation'));
    });
    expect(mockListener.yieldMic).toHaveBeenCalled();
  });

  it('the mic switches listening off and on', () => {
    tester();
    render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    hide();
    fireEvent.press(screen.getByTestId('recite-mic'));
    expect(mockListener.active).toBe(false);
    fireEvent.press(screen.getByTestId('recite-mic'));
    expect(mockListener.active).toBe(true);
    expect(mockListener.resume).toHaveBeenCalled();
  });

  it('showing the page again: the player is back, nothing listens, and the next hide starts covered', () => {
    tester();
    render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    hide();
    const { versesOnPage } = require('../../../lib/ayahBounds');
    const [v1] = versesOnPage(331);
    act(() => {
      mockPager.onTapVerse!(v1);
    });
    fireEvent.press(screen.getByLabelText('Show the page'));
    expect(mockListener.active).toBe(false);
    expect(screen.getByTestId('player-capsule')).toBeTruthy();
    expect(mockPager.pageOverlay).toBeUndefined();
    hide();
    expect(mockPager.onTapVerse!(v1)).toBe(true);
  });
});

// Word by word: with the speech model on the phone, the reciter is followed on
// the device and each word shows as it is said.
describe('ActiveRevisionScreen — hidden pages, word by word', () => {
  const tester = () => {
    setup([]);
    mockApp.user = { ...mockApp.user, previewTester: true };
  };
  const hide = () => {
    fireEvent.press(screen.getByLabelText('The page'));
    fireEvent.press(screen.getByLabelText('Hide the page'));
  };

  it('with the model: follows word by word (the pause listener steps aside), and says so', () => {
    mockModelState = { status: 'ready', bytes: 59_707_625 };
    tester();
    render(<ActiveRevisionScreen />);
    hide();
    expect(mockFollow.active).toBe(true);
    expect(mockListener.active).toBe(false);
    expect(screen.getByTestId('recite-status')).toHaveTextContent('Start reciting');
    expect(screen.getByText('Recite: each word shows as you say it', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('recite-word-by-word')).toBeNull();
  });

  it('hiding the page again starts a new round (covered again); showing it keeps the round', () => {
    mockModelState = { status: 'ready', bytes: 59_707_625 };
    tester();
    render(<ActiveRevisionScreen />);
    hide();
    const first = mockFollow.round;
    fireEvent.press(screen.getByLabelText('Show the page'));
    expect(mockFollow.active).toBe(false);
    expect(mockFollow.round).toBe(first);
    fireEvent.press(screen.getByLabelText('Hide the page'));
    expect(mockFollow.active).toBe(true);
    expect(mockFollow.round).toBe((first as number) + 1);
  });

  it('a page recited through counts as revised', () => {
    mockModelState = { status: 'ready', bytes: 59_707_625 };
    tester();
    render(<ActiveRevisionScreen />);
    hide();
    act(() => mockFollow.onPageDone?.(331));
    expect(screen.getAllByText(/1\/10/, { includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('without the model: the pause listener, and "Word by word" opens the download', async () => {
    tester();
    render(<ActiveRevisionScreen />);
    hide();
    expect(mockFollow.active).toBe(false);
    expect(mockListener.active).toBe(true);
    fireEvent.press(screen.getByTestId('recite-word-by-word'));
    await act(async () => {});
    expect(screen.getByTestId('speech-model-sheet')).toBeTruthy();
    expect(screen.getByTestId('speech-model-privacy')).toBeTruthy();
  });

  it('downloading: the chip shows the progress', () => {
    mockModelState = { status: 'downloading', progress: 0.42 };
    tester();
    render(<ActiveRevisionScreen />);
    hide();
    expect(screen.getByTestId('recite-word-by-word')).toHaveTextContent('42%');
  });

  it('a binary without the mic module: no chip, phase 1 as before', () => {
    mockFollow.followable = false;
    mockModelState = { status: 'ready', bytes: 1 };
    tester();
    render(<ActiveRevisionScreen />);
    hide();
    expect(mockFollow.active).toBe(false);
    expect(mockListener.active).toBe(true);
    expect(screen.queryByTestId('recite-word-by-word')).toBeNull();
  });
});

// "They have to go find that recording in Activity": the end card offers it.
describe('ActiveRevisionScreen — Listen back on the end card', () => {
  const recording = (day: string, extra: Record<string, unknown> = {}) => ({
    id: 'rec-1',
    kind: 'revision',
    day,
    createdAt: 1,
    durationMs: 60_000,
    pageMarks: [{ atMs: 0, page: 339 }, { atMs: 30_000, page: 340 }],
    uri: '',
    segments: [],
    sizeBytes: 0,
    backedUp: false,
    ...extra,
  });

  it('a recorded session: Listen back opens the recording over its pages', async () => {
    const log = setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    mockRecordings = [recording(log.date)];
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    fireEvent.press(screen.getByTestId('session-end-listen-back'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ListenBack', { recordingId: 'rec-1' });
  });

  it('pages left: offered too', async () => {
    const log = setup([331, 332]);
    mockRecordings = [recording(log.date)];
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    expect(screen.getByText('3 of 10 revised')).toBeTruthy();
    expect(screen.getByTestId('session-end-listen-back')).toBeTruthy();
  });

  it('not recorded (or only another day, or a reading): no button', async () => {
    const log = setup([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    mockRecordings = [recording('2020-01-01'), recording(log.date, { id: 'r2', kind: 'reading' })];
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    expect(screen.getByText('Revision complete')).toBeTruthy();
    expect(screen.queryByTestId('session-end-listen-back')).toBeNull();
  });

  it('while recording: not offered (it would play into the recording)', async () => {
    const log = setup([331, 332]);
    mockRecordings = [recording(log.date)];
    recordingInProgress();
    render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    expect(screen.queryByTestId('session-end-listen-back')).toBeNull();
  });
});

// Variant B: while recording the recorder is the whole capsule.
describe('ActiveRevisionScreen — the recorder in the controls', () => {
  it('recording: the recorder takes the capsule (the player steps aside); paused, the player is back', async () => {
    setup([331, 332]);
    const recorder = recordingInProgress() as unknown as Record<string, unknown>;
    Object.assign(recorder, { baseMs: 5_000, segmentStartedAt: Date.now() });
    const view = render(<ActiveRevisionScreen />);
    fireEvent.press(screen.getByLabelText('The page'));
    expect(screen.getByTestId('record-pill-recording')).toBeTruthy();
    expect(screen.queryByLabelText('Play from this page')).toBeNull();

    Object.assign(recorder, { phase: 'paused', recording: false, paused: true, segmentStartedAt: null });
    view.rerender(<ActiveRevisionScreen />);
    expect(screen.getByTestId('record-pill-paused')).toBeTruthy();
    expect(screen.getByLabelText('Play from this page')).toBeTruthy();
  });
});
