import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { PillButton } from '../../components/v2/PillButton';
import { MushafPager, MushafPagerHandle } from '../../components/MushafPager';
import { useHaptics } from '../../design/haptics';
import { typeV2 } from '../../theme/v2';
import { getReadPalette } from '../../theme/readPalette';
import { BulkActionsModal } from '../../components/BulkActionsModal';
import { WeaknessModal } from '../../components/WeaknessRating';
import { SessionMenuSheet, SessionMenuAction } from '../../components/revision/SessionMenuSheet';
import { UndoToast } from '../../components/revision/UndoToast';
import { SessionEndCard } from '../../components/revision/SessionEndCard';
import { HiddenPageOverlay } from '../../components/recite/HiddenPageOverlay';
import { RecitePanel } from '../../components/recite/RecitePanel';
import { usePauseListener } from '../../components/recite/usePauseListener';
import { canFollowWords, useReciteFollow } from '../../components/recite/useReciteFollow';
import { reciteModeEnabled } from '../../lib/recite/availability';
import { mushafEdition, useMushafEdition } from '../../lib/mushafEdition';
import { SpeechModelSheet } from '../../components/recite/SpeechModelSheet';
import { followLabel, WordByWordChip } from '../../components/recite/RecitePanel';
import { useSpeechModelState } from '../../lib/recite/speechModelStore';
import {
  NOTHING_REVEALED,
  nextHiddenVerse,
  RevealState,
  revealedOn,
  revealVerse,
  verseKey,
} from '../../lib/recite/hiddenPage';
import type { AyahRef } from '../../lib/ayahBounds';
import { useVerseActions } from '../../components/verse/useVerseActions';
import { navigateToActivityDay, navigationRef } from '../../navigation/navigationRef';
import { RecordButton, recorderTakesCapsule } from '../../components/recordings/RecordButton';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { listRecordings, onRecordingsChanged } from '../../lib/recordings';
import { latestRevisionRecording } from '../../lib/listenBack';
import { useKeepScreenOn } from '../../hooks/useKeepScreenOn';
import { TimerChip } from '../../components/timer/TimerChip';
import { ReaderFrame } from '../../components/reader/ReaderFrame';
import { ReaderActivity } from '../../components/reader/ReaderActivity';
import { CAPSULE_HEIGHT, PlayerCapsule } from '../../components/reader/PlayerCapsule';
import { useReaderChrome } from '../../components/reader/useReaderChrome';
import { useTapHint } from '../../components/reader/useTapHint';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoundButton } from '../../components/reader/RoundButton';
import { useReadingTimer } from '../../context/ReadingTimerContext';
import { typography, fonts } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import type { RevisionLog } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/v2';
import { generateDailyAssignment, getCurrentRevisionDay } from '../../lib/algorithm';
import { catchUpDayOf, ownPagesOf } from '../../lib/carryOver';
import { aheadCreditFor, creditedOnDay, doneOnDay, sessionCredit } from '../../lib/aheadCredit';
import { nextRevisionDayPlan, revisionDayPlan, weekdayLabel, type RevisionDayPlan } from '../../lib/aheadPlan';
import {
  getHizbForPage,
  getQuranData,
  getSurahsForPage,
} from '../../lib/quranData';
import { logger } from '../../lib/logger';
import { pagesToUnrevise, removeRevisedPages } from '../../lib/revisionSession';
import { dismissPresentedRevisionReminders } from '../../lib/reminders/sync';

const NO_PAGES: number[] = [];

/** The pages of a planned day that are already credited to it (revised ahead earlier). */
function creditedPagesOf(logs: RevisionLog[], plan: RevisionDayPlan): number[] {
  const credited = creditedOnDay(logs, plan.day);
  return plan.pages.filter((p) => credited.has(p));
}

const AUTO_SAVE_INTERVAL_MS = 5000;
// Under the page, with the controls: the capsule.
const FOOTER_HEIGHT = CAPSULE_HEIGHT + spacing.sm;

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ActiveRevision'>;

export default function ActiveRevisionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<HomeStackParamList, 'ActiveRevision'>>();
  const { user, pages, logs, updatePages, addLog, updateLog, loadData, error } = useApp();
  const { theme, isDark, palette: v2Palette } = useTheme();
  const haptics = useHaptics();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;

  // The revision day is fixed when the session opens. A session still open when
  // fajr (or midnight) passes keeps its assignment and logs to the day it began
  // on, instead of switching pages underneath the reader.
  const sessionDayRef = useRef<string | null>(null);
  if (sessionDayRef.current == null && user) {
    sessionDayRef.current = getCurrentRevisionDay(user);
  }
  const sessionDay = sessionDayRef.current;

  // Opening a session lifts the revision reminders off the lock screen.
  useEffect(() => {
    dismissPresentedRevisionReminders();
  }, []);

  const assignment = useMemo(() => {
    if (!user || !sessionDay) return null;
    const quranData = getQuranData();
    const [y, m, d] = sessionDay.split('-').map(Number);
    return generateDailyAssignment(pages, quranData, user, new Date(y, m - 1, d));
  }, [user, pages, sessionDay]);

  // Home's "Tomorrow starts at …" (#168) opens on that day's pages alone.
  // Planned here, at mount, when the user is already loaded: the pager then
  // starts on the day's first page with no jump (and no flash of today's).
  // Otherwise the effect below adds the day as soon as the user is there.
  const openAheadDay = route.params?.aheadDay;
  const [openedAhead] = useState<RevisionDayPlan | null>(() => {
    if (!user || !sessionDay || !openAheadDay || openAheadDay <= sessionDay) return null;
    const plan = revisionDayPlan(user, pages, openAheadDay, logs);
    return plan.pages.length > 0 ? plan : null;
  });
  const openedCredited = openedAhead ? creditedPagesOf(logs, openedAhead) : NO_PAGES;

  // Keep going (#168): the revision days after today, each with its pages, in
  // order. The session's pages are today's, then these.
  const [aheadDays, setAheadDays] = useState<RevisionDayPlan[]>(() => (openedAhead ? [openedAhead] : []));
  const sections = useMemo(
    () => [{ day: sessionDay ?? '', pages: assignment?.pages ?? [] }, ...aheadDays],
    [sessionDay, assignment, aheadDays],
  );
  const sessionPages = useMemo(() => sections.flatMap((s) => s.pages), [sections]);
  const pageDays = useMemo(() => {
    const days = new Map<number, string>();
    for (const s of sections) for (const p of s.pages) days.set(p, s.day);
    // A catch-up page is credited to the day it was missed, not to today (SESS-7).
    if (user && sessionDay) {
      for (const p of sessionPages) {
        const d = catchUpDayOf(user, sessionDay, p);
        if (d) days.set(p, d);
      }
    }
    return days;
  }, [sections, sessionPages, user, sessionDay]);
  const lastSectionDay = sections[sections.length - 1].day;
  const lastSectionPages = sections[sections.length - 1].pages;
  // The pager holds one revision day: today's, or once the session has gone
  // ahead (Home's "Tomorrow starts at", Keep going), only that later day's, as
  // if it were that day's own session. Today's pages, done, don't sit behind it
  // (Majd, Nov 5 2026). The session still spans every day it covered: marks,
  // credit and saves go by page, each page's day in pageDays.
  const shownPages = lastSectionPages.length > 0 ? lastSectionPages : NO_PAGES;
  const keepGoingPlan = useMemo(
    () =>
      user && lastSectionDay
        ? nextRevisionDayPlan(user, pages, lastSectionDay, new Set(sessionPages), logs)
        : null,
    [user, pages, lastSectionDay, sessionPages, logs],
  );

  // Today's pages already done: credited to today (revised today, or ahead from an earlier
  // session), or revised in today's sessions for another day: a catch-up page is credited to the
  // day it was missed (SESS-7), and is still done here. (Counting today's credit alone reopened
  // the session on the catch-up pages, unchecked, while Home said to continue after them.)
  const alreadyRevisedToday = useMemo(() => {
    if (!assignment || !sessionDay) return new Set<number>();
    const done = doneOnDay(logs, sessionDay);
    return new Set(assignment.pages.filter((p) => done.has(p)));
  }, [logs, assignment, sessionDay]);

  const ratingsFromTodaysLogs = useMemo(() => {
    const map = new Map<number, number>();
    if (!smartTrackingEnabled) return map;
    for (const log of logs) {
      if (log.date !== sessionDay) continue;
      for (const wu of log.weaknessUpdates) map.set(wu.page, wu.rating);
    }
    return map;
  }, [logs, smartTrackingEnabled, sessionDay]);

  const [completedPages, setCompletedPages] = useState<Set<number>>(
    () => new Set([...alreadyRevisedToday, ...openedCredited]),
  );
  const [localRatings, setLocalRatings] = useState<Map<number, number>>(
    () => new Map(ratingsFromTodaysLogs),
  );
  const [currentPageNumber, setCurrentPageNumber] = useState<number | null>(
    () => openedAhead?.pages[0] ?? null,
  );
  const [sessionStartTime] = useState(Date.now());
  const [saving, setSaving] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showRating, setShowRating] = useState(false);

  // Hold a verse: highlight, Play (Husary), Translation. Playback stays within
  // this session's pages, and the pages it turns are not marked revised
  // (scrollToPage never reports an advance).
  const pagerRef = useRef<MushafPagerHandle>(null);
  // Record yourself reciting; page marks follow the page on screen.
  // After ending a recording: "Recording saved · View" (opens it in Activity).
  const [savedRecording, setSavedRecording] = useState<{ day: string; recordingId: string } | null>(
    null,
  );
  const recorder = useVoiceRecorder({
    kind: 'revision',
    day: sessionDay,
    currentPage:
      currentPageNumber ??
      assignment?.pages.find((p) => !alreadyRevisedToday.has(p)) ??
      assignment?.pages[0] ??
      null,
    onFinished: setSavedRecording,
  });

  // Listen back: the end card offers the day's recording over its pages
  // (ListenBackScreen), unless it is being recorded right now.
  const [dayRecordingId, setDayRecordingId] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionDay) return;
    let live = true;
    const refresh = () => {
      listRecordings()
        .then((all) => {
          if (live) setDayRecordingId(latestRevisionRecording(all, sessionDay)?.id ?? null);
        })
        .catch((err) => logger.warn('Could not list recordings', err));
    };
    refresh();
    const off = onRecordingsChanged(refresh);
    return () => {
      live = false;
      off();
    };
  }, [sessionDay]);
  const listenBackId = recorder.phase === 'idle' || recorder.phase === 'paused' ? dayRecordingId : null;

  // Reading or revising without touching the screen: don't let it lock.
  const isScreenFocused = useIsFocused();
  useKeepScreenOn(isScreenFocused);

  // ===== Hidden pages: recite from memory (testers) =====
  // The eye in the header covers the page line by line (verse markers open);
  // a verse shows again when tapped, with Next verse, or when the reciter
  // pauses after it (usePauseListener). Each hide starts covered again; what
  // was shown on a page stays shown while it lasts.
  // Hidden recite mode needs the lines and words of the print shown (lib/mushafEdition):
  // the 1405 pages only, for now.
  const edition = useMushafEdition();
  const reciteAvailable = reciteModeEnabled(user) && mushafEdition(edition).reciteData;
  const [hidden, setHidden] = useState(false);
  const [reveal, setReveal] = useState<RevealState>(NOTHING_REVEALED);
  const [listenOn, setListenOn] = useState(true);
  const pageOnScreen =
    currentPageNumber ??
    assignment?.pages.find((p) => !alreadyRevisedToday.has(p)) ??
    assignment?.pages[0] ??
    null;
  const pageOnScreenRef = useRef(pageOnScreen);
  pageOnScreenRef.current = pageOnScreen;
  const revealNext = useCallback(() => {
    const page = pageOnScreenRef.current;
    if (page == null) return;
    setReveal((s) => {
      const verse = nextHiddenVerse(s, page);
      return verse ? revealVerse(s, page, verse) : s;
    });
  }, []);
  // Word by word (phase 2): with the speech model on the phone, the reciter is
  // followed on the device and each word shows as it is recited; the page
  // turns when they reach the next, and a page recited through counts as
  // revised. Without the model (or on a binary without the module), the pause
  // listener below; also while recording (it listens through the recording).
  const speechModel = useSpeechModelState();
  const followable = canFollowWords();
  const wordMode = hidden && followable && speechModel.status === 'ready';
  const [modelSheet, setModelSheet] = useState(false);
  // Each hide is a new round: what was followed before is covered again.
  const [hideRound, setHideRound] = useState(0);
  const markRevisedRef = useRef<(page: number) => void>(() => undefined);
  const followPages = shownPages;
  const follow = useReciteFollow({
    active: wordMode && listenOn && isScreenFocused && !recorder.recording,
    round: hideRound,
    pages: followPages,
    currentPage: pageOnScreen ?? followPages[0] ?? 1,
    onShowPage: (page) => pagerRef.current?.scrollToPage(page),
    onPageDone: (page) => markRevisedRef.current(page),
  });
  const listener = usePauseListener({
    active: hidden && listenOn && isScreenFocused && (!wordMode || recorder.recording),
    externalLevel: recorder.level,
    onPause: revealNext,
  });
  // Recording takes the microphone: the listener steps aside first, and then
  // listens through the recording.
  const yieldMic = listener.yieldMic;
  const recordButtonRecorder = {
    ...recorder,
    start: async () => {
      await yieldMic();
      await recorder.start();
    },
    resume: async () => {
      await yieldMic();
      await recorder.resume();
    },
  };
  const onTapVerse = useCallback(
    (ayah: AyahRef) => {
      if (!hidden) return false;
      // A tap on shown text toggles the controls, as usual.
      if (revealedOn(reveal, ayah.page).has(verseKey(ayah))) return false;
      setReveal((s) => revealVerse(s, ayah.page, ayah));
      return true;
    },
    [hidden, reveal],
  );
  const coverColors = useMemo(() => {
    const read = getReadPalette(isDark);
    return { cover: read.pageBg, guide: read.textSecondary, band: v2Palette.accentText };
  }, [isDark, v2Palette]);
  const pageOverlay = useMemo(
    () =>
      hidden
        ? (page: number, scale: number) => (
            <HiddenPageOverlay
              page={page}
              scale={scale}
              revealed={revealedOn(reveal, page)}
              follow={wordMode ? follow.follow : null}
              colors={coverColors}
            />
          )
        : undefined,
    [hidden, reveal, coverColors, wordMode, follow.follow],
  );

  const verseActions = useVerseActions({
    pages: shownPages,
    onShowPage: (page) => pagerRef.current?.scrollToPage(page),
    currentPage: currentPageNumber ?? undefined,
    focused: isScreenFocused,
  });
  const stopPlayback = verseActions.player.onStop;
  const toggleHidden = useCallback(() => {
    if (!hidden) {
      // Covered again from the start; recitation would read it out.
      setReveal(NOTHING_REVEALED);
      setHideRound((r) => r + 1);
      if (verseActions.player.state.status !== 'idle') stopPlayback();
    }
    setHidden(!hidden);
  }, [hidden, stopPlayback, verseActions.player.state.status]);
  // Reading: nothing but the page (its number, the juz and surah). A tap on
  // the page brings the controls (beside the page, never over it); another
  // tap, or turning the page, puts them away.
  // Every page revised: the session is complete, and the controls stay up
  // (Back is the way out; there is no Submit or End session).
  const allDone =
    !!assignment && assignment.pages.length > 0 && assignment.pages.every((p) => completedPages.has(p));
  const chrome = useReaderChrome({ locked: allDone });
  const tapHint = useTapHint();
  const dismissHint = tapHint.dismiss;
  const toggleChrome = chrome.toggle;
  const onTapPage = useCallback(() => {
    dismissHint();
    toggleChrome();
  }, [dismissHint, toggleChrome]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Arriving on a page marks nothing; swiping off it does (the last page: onto
  // the end card after it).
  const handlePageChange = useCallback((page: number) => {
    setCurrentPageNumber(page);
  }, []);
  const [undoState, setUndoState] = useState<{
    page: number;
    message: string;
  } | null>(null);

  const silentlySavedRef = useRef<Set<number>>(new Set([...alreadyRevisedToday, ...openedCredited]));
  const lastSaveTimeRef = useRef<number>(sessionStartTime);
  // The save currently running, so an exit can wait for it and then save
  // again instead of silently skipping (which used to drop late changes).
  const commitPromiseRef = useRef<Promise<void> | null>(null);
  const logsRef = useRef(logs);
  logsRef.current = logs;

  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  /**
   * Every page the day's session holds as revised: the checks on screen, and what today's sessions
   * have saved (pages credited to other days included), less any page unchecked here. A save's
   * merge keeps credit only for these pages (SESS-7). Naming the pages just checked dropped the
   * catch-up and ahead credit saved before them, by the autosave a few seconds earlier or by an
   * earlier session of the day (Nov 2026).
   */
  const heldAsRevised = useCallback(
    (day: string, unchecked: readonly number[] = []): number[] => {
      const saved = logsRef.current
        .filter((l) => l.date === day)
        .flatMap((l) => [...l.pagesRevised, ...Object.values(l.ahead ?? {}).flat()]);
      return [...new Set([...completedPages, ...saved.filter((p) => !unchecked.includes(p))])];
    },
    [completedPages],
  );

  const commitPendingPages = useCallback(async (): Promise<void> => {
    if (!user || !assignment || !sessionDay) return;
    const revisionDay = sessionDay;
    // Today's own pages: the catch-up pages are credited to the days they were missed (SESS-7).
    const assignedPages = ownPagesOf(assignment.pages, user, revisionDay);
    while (commitPromiseRef.current) await commitPromiseRef.current;
    const pending = Array.from(completedPages).filter(
      (p) => !silentlySavedRef.current.has(p),
    );
    // Saved pages that have since been unchecked.
    const unrevised = pagesToUnrevise(completedPages, silentlySavedRef.current);
    if (pending.length === 0 && unrevised.length === 0) return;
    const run = (async () => {
      if (pending.length > 0) await savePending();
      if (unrevised.length > 0) await removeUnrevised();
    })();
    commitPromiseRef.current = run;
    try {
      await run;
    } catch (err) {
      logger.error('Auto-save failed', err);
    } finally {
      commitPromiseRef.current = null;
    }

    async function savePending() {
      const durationMinutes = Math.max(
        1,
        Math.round((Date.now() - lastSaveTimeRef.current) / 60_000),
      );
      const updatedPages = pages.map((p) =>
        pending.includes(p.pageNumber)
          ? {
              ...p,
              lastRevisedDate: new Date().toISOString(),
              totalRevisionCount: p.totalRevisionCount + 1,
              skipCount: 0,
            }
          : p,
      );
      await updatePages(updatedPages, pending);
      const weaknessUpdates = Array.from(localRatings.entries())
        .filter(([page]) => pending.includes(page))
        .map(([page, rating]) => ({ page, rating }));
      const credit = sessionCredit(pending, pageDays, revisionDay);
      await addLog({
        date: revisionDay,
        assignedPages,
        pagesRevised: credit.pagesRevised,
        pagesSkipped: [],
        weaknessUpdates,
        durationMinutes,
        ahead: credit.ahead,
        // Every page held as revised, catch-up pages too: their credit stays while they are checked (SESS-7).
        checked: heldAsRevised(revisionDay, unrevised),
      });
      pending.forEach((p) => silentlySavedRef.current.add(p));
      lastSaveTimeRef.current = Date.now();
    }

    // Take unchecked pages back out of today's session. updateLog also
    // re-derives each page's last-revised date and count from the logs.
    async function removeUnrevised() {
      // A catch-up page is saved under the day's ahead credit, not its pagesRevised (SESS-7).
      const todaysLog = logsRef.current.find(
        (l) =>
          l.date === revisionDay &&
          (l.pagesRevised.some((p) => unrevised.includes(p)) ||
            Object.values(l.ahead ?? {}).some((pages) => pages.some((p) => unrevised.includes(p)))),
      );
      if (todaysLog) await updateLog(removeRevisedPages(todaysLog, unrevised));
      unrevised.forEach((p) => silentlySavedRef.current.delete(p));
    }
  }, [user, assignment, sessionDay, completedPages, pages, localRatings, pageDays, updatePages, addLog, updateLog, heldAsRevised]);

  useEffect(() => {
    const id = setInterval(() => {
      commitPendingPages();
    }, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [commitPendingPages]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        commitPendingPages();
      }
    });
    return () => sub.remove();
  }, [commitPendingPages]);

  // Every way out saves. The Back arrow does, but the iOS edge swipe and
  // Android's back button close the screen without it, and the timer above
  // stops with the screen: a page marked in its last seconds was lost.
  const commitRef = useRef(commitPendingPages);
  commitRef.current = commitPendingPages;
  useEffect(() => () => void commitRef.current(), []);

  // ===== Timer =====
  // The app has one timer (in the controls under the page, and Home's top bar
  // while it runs): pages marked revised while it runs are credited to it.
  // Leaving this screen doesn't pause it and finishing today's pages doesn't
  // stop it; the user ends it from the timer itself.
  const { noteRevisedPages, timer } = useReadingTimer();
  const prevCompletedRef = useRef(completedPages);
  useEffect(() => {
    const prev = prevCompletedRef.current;
    prevCompletedRef.current = completedPages;
    const added = Array.from(completedPages).filter((p) => !prev.has(p));
    if (added.length > 0) noteRevisedPages(added);
  }, [completedPages, noteRevisedPages]);

  // Every hook runs before the loading / error return below: "Try again"
  // after a failed load would otherwise render more hooks than before.
  const quranData = getQuranData();
  // Every page of the session: today's, then any revised ahead.
  const assignedPages = sessionPages.length > 0 ? sessionPages : NO_PAGES;

  const scopeLabel = useMemo(() => {
    // Prefer juz scope when the day's pages fit one juz; otherwise show count.
    const juzes = new Set(
      shownPages
        .map((p) => quranData.find((q) => q.pageNumber === p)?.juzNumber)
        .filter((j): j is number => typeof j === 'number'),
    );
    if (juzes.size === 1) return `Juz ${[...juzes][0]}`;
    return `${shownPages.length} pages`;
  }, [shownPages, quranData]);

  // ===== Mark / unmark =====

  const markRevised = useCallback(
    (pageNumber: number) => {
      // A page done is one of the moments that buzz (and the Haptics setting
      // can turn it off).
      haptics.selection();
      setCompletedPages((prev) => {
        if (prev.has(pageNumber)) return prev;
        const next = new Set(prev);
        next.add(pageNumber);
        return next;
      });
    },
    [haptics],
  );
  markRevisedRef.current = markRevised;

  const unmarkRevised = useCallback((pageNumber: number) => {
    setCompletedPages((prev) => {
      if (!prev.has(pageNumber)) return prev;
      const next = new Set(prev);
      next.delete(pageNumber);
      return next;
    });
  }, []);

  // ===== Swipe-to-credit =====

  const handleAdvance = useCallback(
    (leftPage: number, _currentPage: number) => {
      if (!assignedPages.includes(leftPage)) return;
      if (completedPages.has(leftPage)) return;
      markRevised(leftPage);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndoState({
        page: leftPage,
        message: `Page ${leftPage} marked as revised`,
      });
    },
    [assignedPages, completedPages, markRevised],
  );
  // The pager's swipe: credited only for the page on screen, as the screen
  // knows it (a page the screen doesn't show is never marked).
  const handleSwipeAdvance = useCallback(
    (leftPage: number, newPage: number) => {
      if (currentPageNumber != null && leftPage !== currentPageNumber) return;
      handleAdvance(leftPage, newPage);
    },
    [currentPageNumber, handleAdvance],
  );

  // ===== The end card, after the last page =====
  // Swiping off the last page onto it marks that page done, as for any page.
  // When that finishes the session: a success buzz, confetti on the card, and
  // the session saved at once. A jump there, or a page already done, marks
  // nothing (so coming back to it later doesn't celebrate again).
  const [celebrate, setCelebrate] = useState(0);
  const handleReachEnd = useCallback(
    (lastPage: number, bySwipe: boolean) => {
      // The header names the page just left, not where the session would resume.
      setCurrentPageNumber(lastPage);
      if (!bySwipe || !assignedPages.includes(lastPage) || completedPages.has(lastPage)) return;
      // The day the page belongs to: finishing it is what the card celebrates.
      const dayPages = sections.find((s) => s.pages.includes(lastPage))?.pages ?? [];
      const finishes = dayPages.every((p) => p === lastPage || completedPages.has(p));
      if (!finishes) {
        handleAdvance(lastPage, lastPage);
        return;
      }
      setCompletedPages((prev) => new Set(prev).add(lastPage));
      setUndoState(null);
      haptics.success();
      setCelebrate((c) => c + 1);
      AccessibilityInfo.announceForAccessibility(
        `Revision complete. ${dayPages.length} ${dayPages.length === 1 ? 'page' : 'pages'} revised.`,
      );
    },
    [assignedPages, completedPages, handleAdvance, haptics, sections],
  );
  // ===== The session completes =====
  // When the last page is marked (a swipe onto the end card, the check, Jump or
  // mark in bulk, or recited through), the session is complete: saved at once,
  // and its recording finished ("Recording saved · View"), as Submit did. A
  // Record after that carries on the day's recording; Back before the end
  // leaves it paused for when the session is reopened. Only a mark completes
  // it: a day already done when the screen opens finishes nothing.
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const prevMarksRef = useRef(completedPages);
  useEffect(() => {
    const prev = prevMarksRef.current;
    prevMarksRef.current = completedPages;
    // Today's pages: a session revised on past them (Keep going) completes once.
    const todays = assignment?.pages ?? [];
    if (prev === completedPages || todays.length === 0) return;
    const doneWith = (marks: Set<number>) => todays.every((p) => marks.has(p));
    if (doneWith(prev) || !doneWith(completedPages)) return;
    void commitRef.current();
    // Only a recording in progress (idle, finish would wait for the next one).
    if (recorderRef.current.phase !== 'idle') void recorderRef.current.finish();
  }, [completedPages, assignment]);


  // ===== Keep going (#168) =====
  // Adds the next revision day after the last section. The pager then holds
  // that day alone (it is keyed by day), opening on its first page.
  const addSection = useCallback(
    (plan: RevisionDayPlan) => {
      if (plan.pages.length === 0) return;
      const credited = creditedOnDay(logs, plan.day);
      const already = plan.pages.filter((p) => credited.has(p));
      // The header names the page the pager opens on, the day's first.
      setCurrentPageNumber(plan.pages[0]);
      // Pages already credited to that day are done, as on the day itself.
      setCompletedPages((prev) => new Set([...prev, ...already]));
      already.forEach((p) => silentlySavedRef.current.add(p));
      setAheadDays((prev) => [...prev, plan]);
    },
    [logs],
  );
  const keepGoing = useCallback(() => {
    if (!keepGoingPlan) return;
    addSection(keepGoingPlan);
    haptics.selection();
  }, [keepGoingPlan, addSection, haptics]);

  // Home's "Tomorrow starts at …" (#168) when the user wasn't loaded at mount:
  // the day is added once they are (planned at mount otherwise, above).
  const openedAheadRef = useRef(openedAhead != null);
  useEffect(() => {
    if (openedAheadRef.current || !user || !sessionDay || !openAheadDay) return;
    if (openAheadDay <= sessionDay) return;
    openedAheadRef.current = true;
    addSection(revisionDayPlan(user, pages, openAheadDay, logs));
  }, [openAheadDay, user, pages, logs, sessionDay, addSection]);
  // Saved as soon as the last page is in (the render after the swipe).
  useEffect(() => {
    if (celebrate > 0) commitPendingPages();
    // Only when a swipe finishes the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

  // ===== End session =====

  const finishRecording = recorder.finish;
  const submittingRef = useRef(false);
  const submitSession = useCallback(async () => {
    // Once: a second tap while this runs would log twice and go back twice.
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      // Ending the session ends its recording (leaving without ending keeps it,
      // paused, for when the session is reopened).
      await finishRecording();
      await commitPendingPages();
      const pagesRevised = Array.from(completedPages).filter(
        (p) => !silentlySavedRef.current.has(p),
      );
      // Only today's pages can be skipped; ahead pages not done are simply not revised.
      const pagesSkipped = (assignment?.pages ?? []).filter(
        (p) => !completedPages.has(p) && !silentlySavedRef.current.has(p),
      );
      const changedPageNumbers = [...pagesRevised, ...pagesSkipped];

      const updatedPages = pages.map((p) => {
        if (pagesRevised.includes(p.pageNumber)) {
          return {
            ...p,
            lastRevisedDate: new Date().toISOString(),
            totalRevisionCount: p.totalRevisionCount + 1,
            skipCount: 0,
          };
        }
        if (pagesSkipped.includes(p.pageNumber)) {
          return { ...p, skipCount: p.skipCount + 1 };
        }
        return p;
      });

      if (changedPageNumbers.length > 0) {
        await updatePages(updatedPages, changedPageNumbers);
      }

      if (pagesRevised.length > 0) {
        const durationDelta = Math.max(
          0,
          Math.round((Date.now() - lastSaveTimeRef.current) / 60_000),
        );
        const weaknessUpdatesArray = Array.from(localRatings.entries()).map(
          ([page, rating]) => ({ page, rating }),
        );
        const revisionDay = sessionDay ?? getCurrentRevisionDay(user!);
        await addLog({
          date: revisionDay,
          assignedPages: ownPagesOf(assignment?.pages ?? [], user!, revisionDay),
          pagesRevised: sessionCredit(pagesRevised, pageDays, revisionDay).pagesRevised,
          pagesSkipped,
          weaknessUpdates: weaknessUpdatesArray,
          durationMinutes: durationDelta,
          ahead: sessionCredit(pagesRevised, pageDays, revisionDay).ahead,
          checked: heldAsRevised(revisionDay),
        });
        pagesRevised.forEach((p) => silentlySavedRef.current.add(p));
        lastSaveTimeRef.current = Date.now();
        haptics.success();
      }

      navigation.goBack();
    } finally {
      submittingRef.current = false;
    }
  }, [
    commitPendingPages,
    completedPages,
    assignedPages,
    assignment,
    pageDays,
    sessionDay,
    pages,
    updatePages,
    localRatings,
    addLog,
    user,
    navigation,
    finishRecording,
    haptics,
    heldAsRevised,
  ]);

  const viewerPages = shownPages;

  // Force re-render of the pager's extraData when revision state of any page
  // changes (so any overlay can update). We don't actually render an overlay
  // per page right now, but keeping this hook in place makes that cheap to
  // add later.
  const extraData = useMemo(
    () => Array.from(completedPages).sort().join(','),
    [completedPages],
  );

  if (!user || !assignment) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          {error ? (
            <>
              <Text style={styles.errorTitle}>Couldn't load your session</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <PillButton
                title="Try again"
                onPress={loadData}
                style={styles.retryButton}
              />
            </>
          ) : (
            <Text style={styles.loadingText}>Loading…</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const todaysPages = assignment.pages;

  // A later day (Home's "Tomorrow starts at …", Keep going): its first page,
  // the first not yet done (its plan leaves out the ones done). Today: the
  // first of today's not yet revised.
  const resumePage =
    lastSectionDay !== sessionDay
      ? lastSectionPages[0]
      : (assignment.pages.find((p) => !alreadyRevisedToday.has(p)) ?? assignment.pages[0]);
  const displayPageNumber = currentPageNumber || resumePage;
  // The day of the page on screen: its own pages and count (the header says
  // "Revising ahead" for a day revised ahead).
  const viewDay = pageDays.get(displayPageNumber) ?? sessionDay ?? '';
  const viewPages = sections.find((s) => s.day === viewDay)?.pages ?? todaysPages;
  const viewDone = viewPages.filter((p) => completedPages.has(p)).length;
  const totalPages = viewPages.length;
  const aheadView = viewDay !== sessionDay;
  const currentJuz = quranData.find((q) => q.pageNumber === displayPageNumber)?.juzNumber || 1;
  const currentHizb = getHizbForPage(displayPageNumber);
  const firstSurahOnPage = getSurahsForPage(displayPageNumber)[0];

  const isCurrentRevised = completedPages.has(displayPageNumber);

  const handleToggleCurrent = () => {
    if (isCurrentRevised) unmarkRevised(displayPageNumber);
    else markRevised(displayPageNumber);
  };

  const handleUndo = () => {
    if (!undoState) return;
    unmarkRevised(undoState.page);
    setUndoState(null);
  };

  // ===== Back =====
  // Saves and leaves; reopening the session resumes at the first page not yet
  // revised. Leaving any other way saves too (above).
  const handleSaveAndBack = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await commitPendingPages();
      haptics.success();
    } finally {
      setSaving(false);
      navigation.goBack();
    }
  };

  // ===== Bulk-action handlers (used inside BulkActionsModal) =====

  // In bulk: the day on screen (today's, or the later day the session is on).
  const handleMarkAllComplete = () => setCompletedPages((prev) => new Set([...prev, ...viewerPages]));
  const handleMarkAllIncomplete = () =>
    setCompletedPages((prev) => new Set([...prev].filter((p) => !viewerPages.includes(p))));
  const handleMarkJuzComplete = (juzNumber: number) => {
    const juzPages = viewerPages.filter((pageNum) => {
      const quranPage = quranData.find((q) => q.pageNumber === pageNum);
      return quranPage?.juzNumber === juzNumber;
    });
    setCompletedPages((prev) => {
      const next = new Set(prev);
      const allDone = juzPages.every((p) => next.has(p));
      juzPages.forEach((p) => (allDone ? next.delete(p) : next.add(p)));
      return next;
    });
  };
  const handleTogglePage = (pageNumber: number) => {
    if (completedPages.has(pageNumber)) unmarkRevised(pageNumber);
    else markRevised(pageNumber);
  };

  // ===== Menu actions =====

  const menuActions: SessionMenuAction[] = [
    ...(smartTrackingEnabled
      ? [
          {
            key: 'rate',
            label: 'Rate page strength',
            icon: 'fitness-outline' as const,
            onPress: () => setShowRating(true),
          },
        ]
      : []),
    {
      key: 'bulk',
      label: 'Jump or mark in bulk',
      icon: 'list-outline',
      onPress: () => setShowBulkActions(true),
    },
  ];

  const palette = getReadPalette(isDark);
  const crowded = recorder.phase !== 'idle' || timer != null;
  // Recording: the recorder is the whole capsule, the timer beside it (compact).
  const recordingLive = recorderTakesCapsule(recorder);
  const compact = (width < 430 && crowded) || (recordingLive && timer != null);
  const recordButton = <RecordButton recorder={recordButtonRecorder} crowded={timer != null} />;
  const timerChip = (
    <TimerChip
      compact={compact}
      onOpenQuran={() => {
        if (navigationRef.isReady()) navigationRef.navigate('Read');
      }}
    />
  );

  // Pages put in front by "Revise these first tomorrow" (Insights), labelled as such.
  const fromInsights = user?.carryOver?.source === 'insights' && user.carryOver.day === sessionDay;
  return (
    <View style={[styles.container, { backgroundColor: palette.pageBg }]}>
      <ReaderFrame
        chromeVisible={chrome.visible}
        active={isScreenFocused}
        onBackgroundPress={onTapPage}
        background={palette.pageBg}
        isDark={isDark}
        quietHeader={
          <View style={styles.quietHeader}>
            <Text
              style={[styles.quietText, { color: palette.textSecondary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              testID="session-quiet-count"
            >
              {hidden ? 'Hidden' : `Juz ${currentJuz}`} · {viewDone}/{totalPages}
            </Text>
            {fromInsights ? (
              <Text
                style={[styles.quietText, { color: palette.textSecondary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                testID="session-from-insights"
              >
                From Insights: the weak pages first
              </Text>
            ) : null}
            {hidden ? (
              <Text
                style={[styles.quietText, { color: palette.textSecondary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                testID="recite-hint"
              >
                {wordMode && listenOn
                  ? 'Recite: each word shows as you say it'
                  : listener.status === 'listening'
                    ? 'Pause after a verse to see it'
                    : 'Tap a verse to see it'}
              </Text>
            ) : firstSurahOnPage ? (
              <View style={styles.crumbRight}>
                <Text style={[styles.quietText, { color: palette.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {firstSurahOnPage.name}
                </Text>
                {firstSurahOnPage.nameArabic ? (
                  <Text style={[styles.crumbArabic, { color: palette.textSecondary, fontSize: 13 }]}>
                    {firstSurahOnPage.nameArabic}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        header={
          <View style={styles.header}>
            <RoundButton icon="chevron-back" label="Back" onPress={handleSaveAndBack} palette={palette} />
            <View style={styles.titleCol}>
              <Text
                style={[styles.title, typeV2.name, { color: palette.textPrimary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                testID="session-title"
              >
                {aheadView ? `Revising ahead · ${weekdayLabel(viewDay)}` : `Revising ${scopeLabel}`}{' '}
                <Text style={{ color: palette.textSecondary, fontWeight: '400' }}>
                  · {viewDone}/{totalPages}
                </Text>
              </Text>
              <Text
                style={[styles.subtitle, typeV2.meta, { color: palette.textSecondary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                testID="session-page"
              >
                Page {displayPageNumber} · Juz {currentJuz} · Hizb {currentHizb}
              </Text>
            </View>
            {reciteAvailable ? (
              <RoundButton
                icon={hidden ? 'eye-outline' : 'eye-off-outline'}
                label={hidden ? 'Show the page' : 'Hide the page'}
                onPress={toggleHidden}
                palette={palette}
                active={hidden}
              />
            ) : null}
            <RoundButton
              icon={isCurrentRevised ? 'checkmark' : 'checkmark-outline'}
              label={isCurrentRevised ? 'Unmark current page' : 'Mark current page as revised'}
              onPress={handleToggleCurrent}
              palette={palette}
              active={isCurrentRevised}
            />
            <RoundButton icon="ellipsis-horizontal" label="Session menu" onPress={() => setMenuOpen(true)} palette={palette} />
          </View>
        }
        footer={
          <View style={styles.footer}>
            {hidden ? (
              <RecitePanel
                status={listener.status}
                hearing={wordMode && !recorder.recording ? follow.status === 'following' : listener.hearing}
                {...(wordMode && !recorder.recording
                  ? {
                      label: listenOn ? followLabel(follow.status) : 'Mic off',
                      on: listenOn && ['starting', 'finding', 'following'].includes(follow.status),
                    }
                  : {})}
                accessory={
                  followable && speechModel.status !== 'ready' ? (
                    <WordByWordChip
                      progress={speechModel.status === 'downloading' ? speechModel.progress : null}
                      onPress={() => setModelSheet(true)}
                    />
                  ) : null
                }
                onToggleListening={() => {
                  const paused = wordMode ? follow.status === 'paused' : listener.status === 'paused';
                  if (listenOn && !paused) setListenOn(false);
                  else {
                    setListenOn(true);
                    listener.resume();
                    follow.resume();
                  }
                }}
                onNextVerse={revealNext}
                nextDisabled={nextHiddenVerse(reveal, displayPageNumber) == null}
                compact={compact}
                surface={{ background: palette.control, border: palette.divider }}
                record={<RecordButton recorder={recordButtonRecorder} layout="inline" />}
                timer={timerChip}
              />
            ) : (
              <PlayerCapsule
                recording={recordingLive}
                player={verseActions.player}
                page={displayPageNumber}
                compact={compact}
                surface={{ background: palette.control, border: palette.divider }}
                record={recordButton}
                timer={timerChip}
              />
            )}
          </View>
        }
        footerHeight={FOOTER_HEIGHT}
        pageLabel={
          <View style={styles.pageLabel}>
            <Text style={[styles.pageNum, { color: palette.textPrimary }]} maxFontSizeMultiplier={1.3}>
              {displayPageNumber}
            </Text>
            {isCurrentRevised && <Ionicons name="checkmark" size={12} color={palette.textSecondary} />}
          </View>
        }
        activity={
          <ReaderActivity recorder={recorder} playback={verseActions.player.state} onPress={chrome.show} />
        }
        hint={
          tapHint.shown ? (
            <Text style={[styles.quietText, { color: palette.textSecondary }]} maxFontSizeMultiplier={1.3}>
              Tap the page for the controls
            </Text>
          ) : null
        }
      >
        <MushafPager
          // One pager per revision day: a later day opens fresh on its first page.
          key={lastSectionDay}
          ref={pagerRef}
          pages={viewerPages}
          initialPage={resumePage}
          onPageChange={handlePageChange}
          onAdvance={handleSwipeAdvance}
          onLongPressAyah={verseActions.onLongPressAyah}
          highlightedAyah={verseActions.highlightedAyah}
          onTap={onTapPage}
          onUserSwipe={chrome.hide}
          extraData={extraData}
          pageOverlay={pageOverlay}
          onTapVerse={hidden ? onTapVerse : undefined}
          endCard={
            <SessionEndCard
              total={lastSectionPages.length}
              done={lastSectionPages.filter((p) => completedPages.has(p)).length}
              celebrate={celebrate}
              dayLabel={lastSectionDay === sessionDay ? 'today' : `for ${weekdayLabel(lastSectionDay)}`}
              next={
                keepGoingPlan
                  ? { label: weekdayLabel(keepGoingPlan.day), pages: keepGoingPlan.pages.length }
                  : null
              }
              onKeepGoing={keepGoing}
              onListenBack={
                listenBackId ? () => navigation.navigate('ListenBack', { recordingId: listenBackId }) : undefined
              }
            />
          }
          onReachEnd={handleReachEnd}
        />
      </ReaderFrame>

      <SpeechModelSheet visible={modelSheet} onClose={() => setModelSheet(false)} onReady={() => setModelSheet(false)} />
      <UndoToast
        visible={!!savedRecording}
        message="Recording saved"
        actionLabel="View"
        duration={6000}
        onUndo={() => {
          const saved = savedRecording;
          setSavedRecording(null);
          if (saved) navigateToActivityDay(saved.day, saved.recordingId);
        }}
        onDismiss={() => setSavedRecording(null)}
        bottomInset={insets.bottom - spacing.sm}
      />

      <UndoToast
        visible={!!undoState}
        message={undoState?.message ?? ''}
        onUndo={handleUndo}
        onDismiss={() => setUndoState(null)}
        bottomInset={insets.bottom - spacing.sm}
      />

      <SessionMenuSheet
        visible={menuOpen}
        actions={menuActions}
        onClose={() => setMenuOpen(false)}
      />

      <BulkActionsModal
        visible={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        pages={viewerPages.map((pageNum) => ({
          pageNumber: pageNum,
          isCompleted: completedPages.has(pageNum),
          weaknessRating: localRatings.get(pageNum) ?? 4,
        }))}
        quranData={quranData}
        onMarkAllComplete={handleMarkAllComplete}
        onMarkAllIncomplete={handleMarkAllIncomplete}
        onMarkJuzComplete={handleMarkJuzComplete}
        onTogglePage={handleTogglePage}
      />

      {verseActions.overlay}

      {smartTrackingEnabled && showRating && (
        <WeaknessModal
          pageNumber={displayPageNumber}
          surahName={
            quranData.find((q) => q.pageNumber === displayPageNumber)?.surahName ||
            ''
          }
          currentRating={
            localRatings.has(displayPageNumber)
              ? localRatings.get(displayPageNumber)
              : pages.find((p) => p.pageNumber === displayPageNumber)?.weaknessRating
          }
          onSave={(rating, applyToJuz) => {
            const next = new Map(localRatings);
            if (applyToJuz) {
              const pageJuz = quranData.find(
                (q) => q.pageNumber === displayPageNumber,
              )?.juzNumber;
              if (pageJuz) {
                quranData
                  .filter((q) => q.juzNumber === pageJuz)
                  .forEach((q) => next.set(q.pageNumber, rating));
              }
            } else {
              next.set(displayPageNumber, rating);
            }
            setLocalRatings(next);
          }}
          onClose={() => setShowRating(false)}
        />
      )}
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    loadingText: { ...typography.bodyMedium, color: theme.textSecondary },
    errorTitle: {
      ...typography.titleLarge,
      color: theme.textPrimary,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    errorMessage: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      marginBottom: spacing.xl,
      textAlign: 'center',
    },
    retryButton: { minWidth: 160 },
    quietHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      gap: spacing.md,
    },
    quietText: { ...typography.caption },
    crumbRight: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.xs,
      flexShrink: 1,
    },
    crumbArabic: {
      fontFamily: fonts.arabic,
      fontSize: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      gap: spacing.sm,
    },
    titleCol: { flex: 1, alignItems: 'center' },
    title: { ...typography.titleSmall },
    subtitle: { ...typography.caption },
    footer: {
      flex: 1,
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
      justifyContent: 'flex-end',
    },
    pageLabel: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    pageNum: {
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
    },
  });
