// Regression: unchecking pages that were already saved must take them back
// out of today's session (it used to only ever add, so 7/10 stayed 7/10).
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import ActiveRevisionScreen from '../ActiveRevisionScreen';
import { BulkActionsModal } from '../../../components/BulkActionsModal';
import { getCurrentRevisionDay } from '../../../lib/algorithm';
import { dateToLocalISODay } from '../../../lib/schedulePlans';
import type { RevisionLog, User, UserPage } from '../../../types';
import { navigateToActivityDay } from '../../../navigation/navigationRef';

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
  /** Pages the screen turned to (scrollToPage, a take's turns): never a swipe, so never onAdvance. */
  scrolled: number[];
} = { scrolled: [] };
// The session's route params (Home's "starts at" line opens a later day).
let mockRouteParams: { aheadDay?: string; round?: boolean } | undefined;
jest.mock('../../../components/MushafPager', () => {
  const { Pressable, View } = require('react-native');
  const React = require('react');
  return {
    MushafPager: React.forwardRef(
      (
        props: {
          pages?: number[];
          initialPage?: number;
          onTap?: () => void;
          onUserSwipe?: () => void;
          onPageChange?: (p: number) => void;
          onAdvance?: (leftPage: number, currentPage: number) => void;
          onReachEnd?: (lastPage: number, bySwipe: boolean) => void;
          endCard?: React.ReactNode;
          pageUnderlay?: (page: number, scale: number) => React.ReactNode;
        },
        ref: React.Ref<{ scrollToPage: (p: number) => boolean }>,
      ) => {
        mockPager.pages = props.pages;
        mockPager.initialPage = props.initialPage;
        mockPager.onAdvance = props.onAdvance;
        mockPager.onUserSwipe = props.onUserSwipe;
        mockPager.onPageChange = props.onPageChange;
        mockPager.onReachEnd = props.onReachEnd;
        React.useImperativeHandle(ref, () => ({
          scrollToPage: (p: number) => {
            if (!props.pages?.includes(p)) return false;
            mockPager.scrolled.push(p);
            props.onPageChange?.(p);
            return true;
          },
        }));
        return (
          <View>
            <Pressable accessibilityLabel="The page" onPress={props.onTap} />
            {props.pageUnderlay?.(props.initialPage ?? 0, 0.38)}
            {props.endCard}
          </View>
        );
      },
    ),
  };
});
let mockReduceMotion = false;
jest.mock('../../../design/motion', () => ({ useReduceMotion: () => mockReduceMotion }));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(async () => ({ type: 'wifi' })) }));

// Recite (Revisely Dev): the gate's Dev app and microphone stream, the checker (the test sends its events), Premium.
const mockRecite = { dev: false };
jest.mock('../../../lib/variant', () => ({ ...jest.requireActual('../../../lib/variant'), isDevVariant: () => mockRecite.dev }));
jest.mock('../../../lib/recite/micSource', () => ({
  isMicStreamAvailable: () => true,
  startMicStream: jest.fn(async () => ({ stop: jest.fn(async () => undefined) })),
}));
jest.mock('../../../lib/recite/quranWords', () => {
  const actual = jest.requireActual('../../../lib/recite/quranWords');
  const fixture = () => require('../../../lib/recite/__fixtures__/quranWords').quranWords();
  return { ...actual, loadQuranWords: async () => fixture(), getQuranWords: () => null };
});
const mockLive: { start?: Record<string, unknown>; onEvent?: (e: import('../../../lib/reciteLive/contract').LiveEvent) => void } = {};
jest.mock('../../../lib/reciteCheck/service', () => ({
  ...jest.requireActual('../../../lib/reciteCheck/service'),
  warmUpReciteCheck: jest.fn(),
  sendLabel: jest.fn(async () => true),
}));
jest.mock('../../../lib/reciteLive/socket', () => ({
  socketFeed: () => (start: Record<string, unknown>, handlers: { onEvent: (e: unknown) => void }) => {
    mockLive.start = start;
    mockLive.onEvent = handlers.onEvent as never;
    return { sendAudio: () => undefined, send: () => undefined, close: jest.fn(), audioClip: () => new Int16Array(0) };
  },
}));
jest.mock('../../../lib/premium', () => ({
  usePremium: () => ({ has: true, known: true, grant: null }),
  setDevPremium: jest.fn(async () => true),
  supportLinkUrl: jest.fn(async () => 'https://dev.revisely.app/apply/'),
  premiumErrorText: () => 'Something went wrong. Try again.',
}));

// The recorder: the real hook, unless a test gives one (a recording in progress).
let mockRecorder: Record<string, unknown> | null = null;
// What the screen gave the hook: how a test says a recording was saved, as the hook does.
let mockRecorderOpts: {
  onFinished?: (info: { day: string; recordingId: string; undo?: import('../../../lib/recordings').RecordingUndo }) => void;
} | null = null;
jest.mock('../../../hooks/useVoiceRecorder', () => {
  const actual = jest.requireActual('../../../hooks/useVoiceRecorder');
  return {
    ...actual,
    useVoiceRecorder: (opts: typeof mockRecorderOpts) => {
      mockRecorderOpts = opts;
      return mockRecorder ?? actual.useVoiceRecorder(opts);
    },
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
  mockPager.scrolled = [];
  mockRecite.dev = false;
  mockLive.start = undefined;
  mockLive.onEvent = undefined;
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

// SESS-1: a held-up JavaScript thread gets two swipes at once. The pager credits each page they
// left (MushafPager) before the screen hears of the page between them (E2E 04 on iOS CI, run
// 42746203992: page 584 went uncounted and the session ended on 9 of 10).
describe('ActiveRevisionScreen — swipes that arrive together (SESS-1)', () => {
  it('marks every page they left', () => {
    setup([331, 332]);
    render(<ActiveRevisionScreen />);
    act(() => mockPager.onPageChange?.(333));
    act(() => {
      mockPager.onAdvance?.(333, 335);
      mockPager.onAdvance?.(334, 335);
      mockPager.onPageChange?.(335);
    });
    expect(screen.getAllByText(/4\/10/).length).toBeGreaterThan(0);
  });

  it('marks nothing at or past the page the pager landed on', () => {
    setup([331, 332]);
    render(<ActiveRevisionScreen />);
    act(() => mockPager.onPageChange?.(333));
    act(() => {
      mockPager.onAdvance?.(335, 335);
      mockPager.onAdvance?.(336, 335);
    });
    expect(screen.getAllByText(/2\/10/).length).toBeGreaterThan(0);
  });

  it('onto the end card: the page before the last and the last, and the session is complete', async () => {
    setup([331, 332, 333, 334, 335, 336, 337, 338]);
    render(<ActiveRevisionScreen />);
    act(() => mockPager.onPageChange?.(339));
    await act(async () => {
      mockPager.onAdvance?.(339, 340);
      mockPager.onReachEnd?.(340, true);
    });
    expect(screen.getAllByText(/10\/10/).length).toBeGreaterThan(0);
    expect(screen.getByText('Revision complete')).toBeTruthy();
    expect(screen.getByTestId('confetti', { includeHiddenElements: true })).toBeTruthy();
    expect(mockApp.addLog).toHaveBeenCalledWith(expect.objectContaining({ pagesRevised: [339, 340] }));
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
    // What was revised, by surah (never page numbers).
    expect(screen.getByTestId('session-end-what')).toHaveTextContent(/^Al.Anbiya.102 to Al.Hajj.72$/);
    expect(screen.getByTestId('confetti', { includeHiddenElements: true })).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(mockApp.addLog).toHaveBeenCalledWith(expect.objectContaining({ pagesRevised: [340] }));
    // No "marked as revised · Undo" for the page that finished it.
    expect(screen.queryByText(/marked as revised$/)).toBeNull();
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
    // The page by what it holds, never its number (surahs and juz first, CLAUDE.md).
    expect(screen.getByText('Al\u2011Hajj\u00A065–72 marked as revised')).toBeTruthy();
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
    expect(screen.getByText(/^Al.Hajj.65–72 · Juz 17 · Hizb \d+$/)).toBeTruthy();
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
// shows with Next verse or after a pause in the reciter's voice, never on a tap.
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

  it('after the last page, Keep going opens the next day alone; leaving saves its pages as credit for that day', async () => {
    setupTwoDays([331, 332, 333, 334, 335, 336, 337, 338, 339]);
    const { unmount } = render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    expect(screen.getByText('Revision complete')).toBeTruthy();
    expect(screen.getByText(/Next: .* · 3 pages/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('session-end-keep-going'));
    // Only that day's pages: today's, done, are not behind them (Majd, Nov 5 2026).
    expect(mockPager.pages).toEqual(NEXT);
    expect(mockPager.initialPage).toBe(NEXT[0]);
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

  // AHEAD-3 (Majd, Nov 9 2026): "my next revise ahead would just be restarting the cycle". A one-day
  // cycle: tomorrow repeats today's pages, so Keep going starts a new round.
  it('at the end of the cycle, Keep going starts the next: its pages alone and unchecked, today’s left done', async () => {
    setup(DAY_PAGES.slice(0, 9));
    const { unmount } = render(<ActiveRevisionScreen />);
    await act(async () => {
      mockPager.onReachEnd?.(340, true);
    });
    expect(screen.getByText('Revision complete')).toBeTruthy();
    // Tomorrow is the plan's first day again.
    expect(screen.getByText(/^Next cycle · .+ · 10 pages$/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('session-end-keep-going'));
    });
    expect(mockPager.pages).toEqual(DAY_PAGES);
    expect(mockPager.initialPage).toBe(DAY_PAGES[0]);
    expect(screen.getByText(/^Revising ahead/)).toBeTruthy();
    // The same pages, to revise again: none is checked.
    expect(screen.getByLabelText('Mark current page as revised')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Mark current page as revised'));
    await act(async () => {
      unmount();
    });
    // Credited to tomorrow; nothing of today's is skipped or taken back.
    expect(mockApp.addLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagesRevised: [331], pagesSkipped: [], ahead: { [tomorrow()]: [331] } }),
    );
    expect(mockApp.updateLog).not.toHaveBeenCalled();
  });

  it('Home’s new round opens that day alone, unchecked, though its pages are today’s', async () => {
    setup(DAY_PAGES);
    mockRouteParams = { aheadDay: tomorrow(), round: true };
    const { unmount } = render(<ActiveRevisionScreen />);
    expect(mockPager.pages).toEqual(DAY_PAGES);
    expect(screen.getByLabelText('Mark current page as revised')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Mark current page as revised'));
    await act(async () => {
      unmount();
    });
    expect(mockApp.addLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagesRevised: [331], pagesSkipped: [], ahead: { [tomorrow()]: [331] } }),
    );
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

  it('Home’s “starts at” line opens on that day’s pages alone, on its first page', () => {
    setupTwoDays(DAY_PAGES);
    mockRouteParams = { aheadDay: tomorrow() };
    render(<ActiveRevisionScreen />);
    // As if it were that day's session: today's pages are not behind it.
    expect(mockPager.pages).toEqual(NEXT);
    // The pager starts there (not on today's first page), and the page on
    // screen is tomorrow's: its check reflects tomorrow, not today.
    expect(mockPager.initialPage).toBe(NEXT[0]);
    expect(screen.getByText(/^Revising ahead/)).toBeTruthy();
    expect(screen.getByLabelText('Mark current page as revised')).toBeTruthy();
  });

  it('in a later day’s session, mark in bulk works on that day’s pages and leaves today’s as they were', async () => {
    setupTwoDays(DAY_PAGES);
    mockRouteParams = { aheadDay: tomorrow() };
    const { unmount } = render(<ActiveRevisionScreen />);
    const bulk = () => screen.UNSAFE_getByType(BulkActionsModal);
    expect(bulk().props.pages.map((p: { pageNumber: number }) => p.pageNumber)).toEqual(NEXT);
    act(() => {
      bulk().props.onMarkAllComplete();
    });
    await act(async () => {
      unmount();
    });
    // That day's pages saved as its credit; today's, done before, untouched.
    expect(mockApp.addLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagesRevised: NEXT, ahead: { [tomorrow()]: NEXT } }),
    );
    expect(mockApp.updateLog).not.toHaveBeenCalled();
  });

  it('a day partly revised ahead earlier opens on its first page not yet done', () => {
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
    // The done page is not in the session: it opens on the next one, unchecked.
    expect(mockPager.initialPage).toBe(NEXT[1]);
    expect(screen.getByLabelText('Mark current page as revised')).toBeTruthy();
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

// Recite (Revisely Dev, Majd, Nov 17 2026): the reader's mic in a session (components/reciteLive/useReciteLayer; the
// reader's tests cover a take itself). The old hidden page (the eye at the top, testers) is gone.
describe('ActiveRevisionScreen — Recite (Revisely Dev)', () => {
  const words = require('../../../lib/recite/__fixtures__/quranWords').quranWords();
  // An-Naml 23 opens page 379; the session holds 379 and 380.
  const A23 = words.verseFirstWord(27, 23);
  const flush = () => act(async () => {});
  const event = (e: import('../../../lib/reciteLive/contract').LiveEvent) => act(async () => mockLive.onEvent?.(e));
  const live = async (dayPages: number[] = [379, 380]) => {
    mockRecite.dev = true;
    setup([], dayPages);
    mockApp.user = { ...mockApp.user, previewTester: true };
    const { setReciteCheckSettings, resetReciteCheckSettingsForTests } = require('../../../lib/reciteCheck/settings');
    resetReciteCheckSettingsForTests();
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: false });
    jest.requireMock('expo-audio').getRecordingPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
    render(<ActiveRevisionScreen />);
    await flush();
    await flush();
    fireEvent.press(screen.getByLabelText('The page'));
  };

  it('not Revisely Dev (or not a tester): the record button, as before, and no eye at the top', async () => {
    setup([]);
    mockApp.user = { ...mockApp.user, previewTester: true };
    render(<ActiveRevisionScreen />);
    await flush();
    fireEvent.press(screen.getByLabelText('The page'));
    expect(screen.getByLabelText('Record your recitation')).toBeTruthy();
    expect(screen.queryByTestId('recite-mic')).toBeNull();
    expect(screen.queryByTestId('reader-eye')).toBeNull();
    expect(screen.queryByLabelText('Hide the page')).toBeNull();
  });

  it('[RECITE-9] a tester in Revisely Dev: the reader’s eye and mic in the player, the header as it was', async () => {
    await live();
    expect(screen.getByTestId('recite-mic')).toBeTruthy();
    expect(screen.getByTestId('reader-eye')).toBeTruthy();
    expect(screen.queryByLabelText('Record your recitation')).toBeNull();
    // One eye: the bar's (the header keeps Back, the title, ✓ and ⋯).
    expect(screen.getAllByLabelText('Hide the page')).toHaveLength(1);
    expect(screen.getByLabelText('Mark current page as revised')).toBeTruthy();
  });

  it('[RECITE-9] holding the mic: Record, Recite and Mark mistakes, but no Test me (the reader’s)', async () => {
    await live();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    expect(screen.getByTestId('recite-mode-menu')).toBeTruthy();
    expect(screen.getByText('The page follows you')).toBeTruthy();
    expect(screen.queryByText('Test me')).toBeNull();
  });

  it('[RECITE-9] a take turns the session’s pages but marks none; a page the session doesn’t hold isn’t turned to', async () => {
    await live();
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    await flush();
    expect(mockLive.start).toBeTruthy();
    await event({ type: 'ready', take: 't1', protocol: 6 });
    await event({ type: 'locked', w: A23, s: 27, a: 23 });
    // The bar is the take's, in the player's place.
    expect(screen.getByTestId('recite-stop')).toBeTruthy();
    const on380 = words.pageRange(380)[0] + 3;
    await event({ type: 'at', w: on380 });
    expect(mockPager.scrolled).toEqual([380]);
    // Past the session's last page: the page stays.
    await event({ type: 'at', w: words.pageRange(381)[0] + 3 });
    expect(mockPager.scrolled).toEqual([380]);
    // Nothing marked revised: page 380 isn't checked, and Back saves nothing (SESS-3).
    expect(screen.getByLabelText('Mark current page as revised')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });
    expect(mockApp.addLog).not.toHaveBeenCalled();
    expect(mockApp.updatePages).not.toHaveBeenCalled();
  });
});

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

  // E2E flow 07 finds the recording through Activity (a note lasts 6 s; .maestro/README.md, Notes).
  it('a recording ended: "Recording saved · View" opens its day at the recording', async () => {
    setup([331, 332]);
    recordingInProgress();
    render(<ActiveRevisionScreen />);
    act(() => mockRecorderOpts?.onFinished?.({ day: '2026-11-03', recordingId: 'r1' }));
    expect(screen.getByText('Recording saved')).toBeTruthy();
    fireEvent.press(screen.getByText('View'));
    expect(navigateToActivityDay).toHaveBeenCalledWith('2026-11-03', 'r1');
  });

  it('"Recording saved · Undo" takes back what this go recorded, not the day’s whole recording', async () => {
    const recordings = jest.requireMock('../../../lib/recordings');
    const undo = jest.spyOn(recordings, 'undoRecording').mockResolvedValue('dropped');
    setup([331, 332]);
    recordingInProgress();
    render(<ActiveRevisionScreen />);
    const go = { created: false, segments: ['r1-2.m4a'], fromMs: 60_000 };
    act(() => mockRecorderOpts?.onFinished?.({ day: '2026-11-03', recordingId: 'r1', undo: go }));
    fireEvent.press(screen.getByTestId('recording-saved-undo'));
    await act(async () => {});
    expect(undo).toHaveBeenCalledWith('r1', go);
    expect(screen.queryByText('Recording saved')).toBeNull();
    expect(navigateToActivityDay).not.toHaveBeenCalled();
    undo.mockRestore();
  });
});
