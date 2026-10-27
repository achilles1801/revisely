import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { PillButton } from '../../components/v2/PillButton';
import { PressableScale } from '../../components/PressableScale';
import { MushafPager, MushafPagerHandle } from '../../components/MushafPager';
import { useHaptics } from '../../design/haptics';
import { typeV2 } from '../../theme/v2';
import { getReadPalette } from '../../theme/readPalette';
import { BulkActionsModal } from '../../components/BulkActionsModal';
import { WeaknessModal } from '../../components/WeaknessRating';
import { SessionMenuSheet, SessionMenuAction } from '../../components/revision/SessionMenuSheet';
import { UndoToast } from '../../components/revision/UndoToast';
import { useVerseActions } from '../../components/verse/useVerseActions';
import { navigateToActivityDay, navigationRef } from '../../navigation/navigationRef';
import { RecordButton } from '../../components/recordings/RecordButton';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
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
import { radius } from '../../theme/radius';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/v2';
import { generateDailyAssignment, getCurrentRevisionDay } from '../../lib/algorithm';
import {
  getHizbForPage,
  getQuranData,
  getSurahsForPage,
} from '../../lib/quranData';
import { logger } from '../../lib/logger';
import { pagesToUnrevise, removeRevisedPages } from '../../lib/revisionSession';

const AUTO_SAVE_INTERVAL_MS = 5000;
// Under the page, with the controls: the capsule.
const FOOTER_HEIGHT = CAPSULE_HEIGHT + spacing.sm;

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ActiveRevision'>;

export default function ActiveRevisionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, pages, logs, updatePages, addLog, updateLog, loadData, error } = useApp();
  const { theme, isDark } = useTheme();
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

  const assignment = useMemo(() => {
    if (!user || !sessionDay) return null;
    const quranData = getQuranData();
    const [y, m, d] = sessionDay.split('-').map(Number);
    return generateDailyAssignment(pages, quranData, user, new Date(y, m - 1, d));
  }, [user, pages, sessionDay]);

  const alreadyRevisedToday = useMemo(() => {
    if (!assignment) return new Set<number>();
    const assignmentSet = new Set(assignment.pages);
    const revised = new Set<number>();
    for (const log of logs) {
      if (log.date !== sessionDay) continue;
      for (const p of log.pagesRevised) {
        if (assignmentSet.has(p)) revised.add(p);
      }
    }
    return revised;
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
    () => new Set(alreadyRevisedToday),
  );
  const [localRatings, setLocalRatings] = useState<Map<number, number>>(
    () => new Map(ratingsFromTodaysLogs),
  );
  const [currentPageNumber, setCurrentPageNumber] = useState<number | null>(null);
  const [sessionStartTime] = useState(Date.now());
  const [saving, setSaving] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showRating, setShowRating] = useState(false);

  // Hold a verse: highlight, Play (Husary), Translation. Playback stays within
  // this session's pages, and the pages it turns are not marked revised
  // (scrollToPage never reports an advance).
  const pagerRef = useRef<MushafPagerHandle>(null);
  const sessionPages = useMemo(() => assignment?.pages ?? [], [assignment]);
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

  // Reading or revising without touching the screen: don't let it lock.
  const isScreenFocused = useIsFocused();
  useKeepScreenOn(isScreenFocused);

  const verseActions = useVerseActions({
    pages: sessionPages,
    onShowPage: (page) => pagerRef.current?.scrollToPage(page),
    currentPage: currentPageNumber ?? undefined,
  });
  // Reading: nothing but the page (its number, the juz and surah). A tap on
  // the page brings the controls (beside the page, never over it); another
  // tap, or turning the page, puts them away.
  // Every page revised: the controls stay up, with Submit.
  const submitVisible =
    !!assignment && completedPages.size === assignment.pages.length && assignment.pages.length > 0;
  const chrome = useReaderChrome({ locked: submitVisible });
  const tapHint = useTapHint();
  const dismissHint = tapHint.dismiss;
  const toggleChrome = chrome.toggle;
  const onTapPage = useCallback(() => {
    dismissHint();
    toggleChrome();
  }, [dismissHint, toggleChrome]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Arriving on the session's last page, not yet revised: the controls come up
  // (✓ is there; there is no next page to swipe it done).
  const showChrome = chrome.show;
  const lastSessionPage = assignment?.pages[assignment.pages.length - 1];
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPageNumber(page);
      if (page === lastSessionPage && !completedPages.has(page)) showChrome();
    },
    [lastSessionPage, completedPages, showChrome],
  );
  const [undoState, setUndoState] = useState<{
    page: number;
    message: string;
  } | null>(null);

  const silentlySavedRef = useRef<Set<number>>(new Set(alreadyRevisedToday));
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

  const commitPendingPages = useCallback(async (): Promise<void> => {
    if (!user || !assignment || !sessionDay) return;
    const revisionDay = sessionDay;
    const assignedPages = assignment.pages;
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
      await addLog({
        date: revisionDay,
        assignedPages,
        pagesRevised: pending,
        pagesSkipped: [],
        weaknessUpdates,
        durationMinutes,
      });
      pending.forEach((p) => silentlySavedRef.current.add(p));
      lastSaveTimeRef.current = Date.now();
    }

    // Take unchecked pages back out of today's session. updateLog also
    // re-derives each page's last-revised date and count from the logs.
    async function removeUnrevised() {
      const todaysLog = logsRef.current.find(
        (l) => l.date === revisionDay && l.pagesRevised.some((p) => unrevised.includes(p)),
      );
      if (todaysLog) await updateLog(removeRevisedPages(todaysLog, unrevised));
      unrevised.forEach((p) => silentlySavedRef.current.delete(p));
    }
  }, [user, assignment, sessionDay, completedPages, pages, localRatings, updatePages, addLog, updateLog]);

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

  // ===== Timer =====
  // The floating timer is the app's one timer: pages marked revised while it
  // runs are credited to it. It is general, so unlike the old in-bar revision
  // stopwatch, leaving this screen does not pause it and finishing today's
  // pages does not stop it; the user ends it from the timer itself.
  const { noteRevisedPages, timer } = useReadingTimer();
  const prevCompletedRef = useRef(completedPages);
  useEffect(() => {
    const prev = prevCompletedRef.current;
    prevCompletedRef.current = completedPages;
    const added = Array.from(completedPages).filter((p) => !prev.has(p));
    if (added.length > 0) noteRevisedPages(added);
  }, [completedPages, noteRevisedPages]);

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

  const quranData = getQuranData();
  const totalPages = assignment.pages.length;
  const completedCount = completedPages.size;

  const resumePage =
    assignment.pages.find((p) => !alreadyRevisedToday.has(p)) ??
    assignment.pages[0];
  const displayPageNumber = currentPageNumber || resumePage;
  const currentJuz = quranData.find((q) => q.pageNumber === displayPageNumber)?.juzNumber || 1;
  const currentHizb = getHizbForPage(displayPageNumber);
  const firstSurahOnPage = getSurahsForPage(displayPageNumber)[0];

  const isCurrentRevised = completedPages.has(displayPageNumber);

  const scopeLabel = useMemo(() => {
    // Prefer juz scope when the assignment fits one juz; otherwise show count.
    const juzes = new Set(
      assignment.pages
        .map((p) => quranData.find((q) => q.pageNumber === p)?.juzNumber)
        .filter((j): j is number => typeof j === 'number'),
    );
    if (juzes.size === 1) return `Juz ${[...juzes][0]}`;
    return `${assignment.pages.length} pages`;
  }, [assignment.pages, quranData]);

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

  const unmarkRevised = useCallback((pageNumber: number) => {
    setCompletedPages((prev) => {
      if (!prev.has(pageNumber)) return prev;
      const next = new Set(prev);
      next.delete(pageNumber);
      return next;
    });
  }, []);

  const handleToggleCurrent = () => {
    if (isCurrentRevised) unmarkRevised(displayPageNumber);
    else markRevised(displayPageNumber);
  };

  // ===== Swipe-to-credit =====

  const handleAdvance = useCallback(
    (leftPage: number, _currentPage: number) => {
      if (!assignment.pages.includes(leftPage)) return;
      if (completedPages.has(leftPage)) return;
      markRevised(leftPage);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndoState({
        page: leftPage,
        message: `Page ${leftPage} marked as revised`,
      });
    },
    [assignment.pages, completedPages, markRevised],
  );

  const handleUndo = () => {
    if (!undoState) return;
    unmarkRevised(undoState.page);
    setUndoState(null);
  };

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
      const pagesSkipped = assignment.pages.filter(
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
        await addLog({
          date: sessionDay ?? getCurrentRevisionDay(user),
          assignedPages: assignment.pages,
          pagesRevised,
          pagesSkipped,
          weaknessUpdates: weaknessUpdatesArray,
          durationMinutes: durationDelta,
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
    assignment.pages,
    pages,
    updatePages,
    localRatings,
    addLog,
    user,
    navigation,
    finishRecording,
    haptics,
  ]);

  const handleEndSession = () => {
    if (completedCount === 0) {
      Alert.alert(
        'No pages revised',
        "You haven't marked any pages. End the session anyway?",
        [
          { text: 'Continue', style: 'cancel' },
          { text: 'End session', style: 'destructive', onPress: submitSession },
        ],
      );
    } else {
      submitSession();
    }
  };

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

  const handleMarkAllComplete = () => setCompletedPages(new Set(assignment.pages));
  const handleMarkAllIncomplete = () => setCompletedPages(new Set());
  const handleMarkJuzComplete = (juzNumber: number) => {
    const juzPages = assignment.pages.filter((pageNum) => {
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
    {
      key: 'save',
      label: saving ? 'Saving…' : 'Save and exit',
      icon: 'save-outline',
      onPress: handleSaveAndBack,
    },
    {
      key: 'end',
      label: 'End session',
      icon: 'flag-outline',
      destructive: true,
      onPress: handleEndSession,
    },
  ];

  const viewerPages = useMemo(
    () => assignment.pages,
    [assignment.pages],
  );

  // Force re-render of the pager's extraData when revision state of any page
  // changes (so any overlay can update). We don't actually render an overlay
  // per page right now, but keeping this hook in place makes that cheap to
  // add later.
  const extraData = useMemo(
    () => Array.from(completedPages).sort().join(','),
    [completedPages],
  );

  const palette = getReadPalette(isDark);
  const crowded = recorder.phase !== 'idle' || timer != null || submitVisible;
  const compact = width < 430 && crowded;

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
            <Text style={[styles.quietText, { color: palette.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              Juz {currentJuz} · {completedCount}/{totalPages}
            </Text>
            {firstSurahOnPage ? (
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
              <Text style={[styles.title, typeV2.name, { color: palette.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                Revising {scopeLabel}{' '}
                <Text style={{ color: palette.textSecondary, fontWeight: '400' }}>
                  · {completedCount}/{totalPages}
                </Text>
              </Text>
              <Text style={[styles.subtitle, typeV2.meta, { color: palette.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                Page {displayPageNumber} · Juz {currentJuz} · Hizb {currentHizb}
              </Text>
            </View>
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
            <PlayerCapsule
              player={verseActions.player}
              page={displayPageNumber}
              compact={compact}
              surface={{ background: palette.control, border: palette.divider }}
              record={<RecordButton recorder={recorder} />}
              timer={
                <TimerChip
                  compact={compact}
                  onOpenQuran={() => {
                    if (navigationRef.isReady()) navigationRef.navigate('Read');
                  }}
                />
              }
              trailing={
                submitVisible ? (
                  <PressableScale
                    onPress={handleEndSession}

                    style={[styles.submit, { backgroundColor: theme.accent }]}
                    accessibilityRole="button"
                    accessibilityLabel="Submit session"
                  >
                    <Text style={styles.submitText}>Submit</Text>
                  </PressableScale>
                ) : undefined
              }
            />
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
          ref={pagerRef}
          pages={viewerPages}
          initialPage={resumePage}
          onPageChange={handlePageChange}
          onAdvance={handleAdvance}
          onLongPressAyah={verseActions.onLongPressAyah}
          highlightedAyah={verseActions.highlightedAyah}
          onTap={onTapPage}
          onUserSwipe={chrome.hide}
          extraData={extraData}
        />
      </ReaderFrame>

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
    submit: {
      height: 36,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitText: { color: theme.onAccent, fontWeight: '700', fontSize: 14 },
  });
