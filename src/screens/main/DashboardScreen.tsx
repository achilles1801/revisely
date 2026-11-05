import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
// Gesture Handler's, so a sideways swipe on it can move to the next tab
// (navigation/PagerTabs): over React Native's own, the swipe never started.
import { ScrollView } from 'react-native-gesture-handler';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { PillButton } from '../../components/v2/PillButton';
import { EditSessionModal } from '../../components/EditSessionModal';
import { greetingName } from '../../lib/displayName';
import { setHomePrefs, useHomePrefs } from '../../lib/homePrefs';
import { isKahfDay, kahfCardState, kahfPages, kahfReadingSession, kahfReadOn } from '../../lib/kahf';
import * as firestoreService from '../../services/firestoreService';
import { queueChange, withPendingReadings } from '../../lib/offline/queue';
import { OfflineNote } from '../../components/offline/OfflineNote';
import { UpdateReadySheet } from '../../components/updates/UpdateReadySheet';
import { StoreUpdateSheet } from '../../components/updates/StoreUpdateSheet';
import { autoId } from '../../lib/offline/apply';
import { logger } from '../../lib/logger';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/v2';
import { generateDailyAssignment, scheduleStartingByToday } from '../../lib/algorithm';
import { getQuranData } from '../../lib/quranData';
import { registerForPushNotificationsAsync } from '../../lib/notifications';
import { ReadingSession, RevisionLog } from '../../types';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { TodayPost, memorizedText } from '../../components/home/feed/TodayPost';
import { SessionPost } from '../../components/home/feed/SessionPost';
import { KahfPost } from '../../components/home/feed/KahfPost';
import { RecentSection } from '../../components/activity/ActivityItemRow';
import { RunningTimerChip } from '../../components/timer/RunningTimerChip';
import { HeroGlow } from '../../components/v2/HeroGlow';
import { QiblaSheet } from '../../components/qibla/QiblaSheet';
import { PrayerSheet, PrayerTab } from '../../components/prayer/PrayerSheet';
import { NextPrayerLine } from '../../components/prayer/NextPrayerLine';
import { usePrayerTimes } from '../../components/prayer/usePrayerTimes';
import { prayerTimesEnabled } from '../../lib/prayer/status';
import { usePrayerPrefs } from '../../lib/prayer/prefs';
import { onPrayerSheetRequest } from '../../lib/widgets/links';
import { IconButton, TopBar } from '../../components/v2/TopBar';
import { arabicV2, layoutV2 } from '../../theme/v2';
import { avatarInitial } from '../../lib/displayName';
import { prefetchPages } from '../../lib/pageCache';
import { catchUpLine } from '../../lib/todayLines';
import { applyCarryOver, leftoversFor, type Leftovers } from '../../lib/carryOver';
import { creditedOnDay, doneOnDay, reviewPagesInOrder } from '../../lib/aheadCredit';
import { daysDoneAhead, nextRevisionDayPlan, revisionDayAfter, weekdayLabel } from '../../lib/aheadPlan';
import { JumpSheet } from '../../components/home/JumpSheet';
import { UndoToast } from '../../components/revision/UndoToast';
import { describeStart, jumpTo, undoJump, type JumpTarget } from '../../lib/jump';
import type { User } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Dashboard'>;

const COMPACT_SESSION_LIMIT = 3;

/** Each side of Home's top bar: three icons. */
const TOP_BAR_SIDE = 120;
/** السلام عليكم at 20pt, measured ink (Amiri draws past its box). */
const SALAM_INK_WIDTH = 76;

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme, palette } = useTheme();
  // The greeting grows like the icons beside it (1.4), but always keeps 12pt
  // from them: on an iPhone SE's narrower bar that is about 1.05.
  // (React Native ignores a cap under 1, so 1 is the floor.)
  const { width: screenWidth } = useWindowDimensions();
  const salamRoom = screenWidth - 2 * layoutV2.gutter - 2 * TOP_BAR_SIDE - 2 * 12;
  const salamScale = Math.max(1, Math.min(1.4, salamRoom / SALAM_INK_WIDTH));
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const { user, pages, logs, addLog, updateLog, deleteLog, loadData, error, saveUser } = useApp();
  const { firebaseUser } = useAuth();
  const { day: revisionDay, date: revisionDate } = useRevisionDay(user);

  const homePrefs = useHomePrefs();
  const tabFootprint = useTabBarFootprint();
  const [carrying, setCarrying] = useState(false);
  // "Jump to…": the sheet, and the toast after a jump (with what to put back).
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumped, setJumped] = useState<{ message: string; before: User } | null>(null);

  // A schedule that starts after today (an older version's "back a day" on a
  // schedule that started that day) leaves today with nothing: start it today.
  const repairingStartRef = useRef(false);
  useEffect(() => {
    if (!user || repairingStartRef.current) return;
    const repaired = scheduleStartingByToday(user, revisionDate);
    if (!repaired) return;
    repairingStartRef.current = true;
    saveUser(repaired)
      .catch((err) => logger.warn('Could not move the schedule start to today', err))
      .finally(() => {
        repairingStartRef.current = false;
      });
  }, [user, revisionDate, saveUser]);
  const carryingRef = useRef(false);
  // Tapping the Home tab while on Home scrolls back to the top (and from a
  // pushed screen, the stack pops back here first).
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const [selectedLog, setSelectedLog] = useState<RevisionLog | null>(null);
  const [qiblaOpen, setQiblaOpen] = useState(false);
  // Prayer times (testers): one sheet, Times | Qibla; the compass opens it on
  // Qibla, the next-prayer line on Times.
  const [prayerTab, setPrayerTab] = useState<PrayerTab>('qibla');
  const prayerEnabled = prayerTimesEnabled(user);
  const prayerPrefs = usePrayerPrefs();
  const prayerTimes = usePrayerTimes(user);
  const openPrayer = (tab: PrayerTab) => {
    setPrayerTab(tab);
    setQiblaOpen(true);
  };
  // The widgets' taps open it here on their tab, also from a cold start: Qibla
  // (revisely://qibla) and prayer times (revisely://prayer). Without prayer
  // times there is only the Qibla sheet, so the prayer widget just shows Home.
  const prayerEnabledRef = useRef(prayerEnabled);
  prayerEnabledRef.current = prayerEnabled;
  useEffect(
    () =>
      onPrayerSheetRequest((tab) => {
        if (tab === 'times' && !prayerEnabledRef.current) return;
        setPrayerTab(tab);
        setQiblaOpen(true);
      }),
    [],
  );
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSessionPages, setSelectedSessionPages] = useState<number[]>([]);
  const { refreshing, onRefresh } = usePullToRefresh(loadData);

  const quranData = getQuranData();

  const assignment = useMemo(() => {
    if (!user) return null;
    return generateDailyAssignment(pages, quranData, user, revisionDate);
  }, [user, pages, revisionDate]);

  // Download today's pages ahead of time so the session opens on cached pages.
  useEffect(() => {
    if (assignment && assignment.pages.length > 0) prefetchPages(assignment.pages);
  }, [assignment]);

  const todayStatus = useMemo(() => {
    // Today's pages credited to today: revised today, or ahead from an earlier
    // session (a day done ahead is done).
    const credited = creditedOnDay(logs, revisionDay);
    const totalAssigned = assignment?.totalPages || 0;
    const completed = (assignment?.pages ?? []).filter((p) => credited.has(p)).length;
    // If the user revised pages today and the assignment later shrank
    // (custom-plan edit, un-memorized surah), treat that as completed
    // rather than letting `remaining` go negative downstream.
    if (completed > 0 && completed >= totalAssigned) {
      return { status: 'completed' as const, pagesCompleted: completed };
    }
    if (completed > 0)
      return { status: 'partial' as const, pagesCompleted: completed };
    return { status: 'not_started' as const, pagesCompleted: 0 };
  }, [logs, assignment, revisionDay]);

  // Done today: the next revision day, which Home's quiet line opens (#168).
  const aheadNext = useMemo(() => {
    if (!user || !assignment || todayStatus.status !== 'completed' || assignment.pages.length === 0) return null;
    const plan = nextRevisionDayPlan(user, pages, revisionDay, new Set(assignment.pages), logs);
    if (!plan || plan.pages.length === 0) return null;
    const lead = plan.day === revisionDayAfter(revisionDay) ? 'Tomorrow' : weekdayLabel(plan.day);
    return { plan, lead };
  }, [user, pages, logs, assignment, revisionDay, todayStatus.status]);

  // Pages from the last few revision days that were never revised (a day with
  // no session at all counts as missed), offered as "Add to today". Empty once
  // they are in today's assignment.
  const leftovers = useMemo<Leftovers>(() => {
    if (!user || !assignment) return { pages: [], days: [] };
    return leftoversFor(user, logs, revisionDay, assignment.pages, pages.filter((p) => p.status === 'memorized'));
  }, [logs, revisionDay, assignment, pages, user]);

  // How many of today's pages came from yesterday (they come first: "4 from yesterday first").
  const carriedToday = useMemo(() => {
    const carry = user?.carryOver;
    if (!assignment || !carry || carry.day !== revisionDay) return 0;
    const carried = new Set(carry.pages);
    return assignment.pages.filter((p) => carried.has(p)).length;
  }, [user, assignment, revisionDay]);

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  const calculatedStreak = useMemo(() => {
    if (logs.length === 0) return 0;
    // Log dates are revision days ('YYYY-MM-DD'), so count back from the
    // revision day, parsing them as local dates: `new Date('YYYY-MM-DD')` is
    // UTC midnight, the previous evening west of Greenwich.
    const localDay = (s: string) => {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d).getTime();
    };
    // A day whose pages were all revised ahead is a day done, so it keeps the streak.
    const days = new Set<string>(logs.map((l) => l.date));
    if (user) for (const day of daysDoneAhead(user, pages, logs)) days.add(day);
    const sortedDays = [...days].map(localDay).sort((a, b) => b - a);
    let streak = 0;
    for (const logDay of sortedDays) {
      const expectedDate = new Date(revisionDate);
      expectedDate.setDate(revisionDate.getDate() - streak);
      if (logDay === expectedDate.getTime()) {
        streak++;
      } else if (logDay < expectedDate.getTime()) {
        break;
      }
    }
    return streak;
  }, [logs, revisionDate, user, pages]);

  // Sessions
  const sessionLogs = useMemo(
    () =>
      logs
        .filter((l) => l.pagesRevised.length > 0)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [logs],
  );

  // Pages revised today: the Today post's page chips fill in as they're done.
  // Includes pages revised ahead for today (lib/aheadCredit).
  // Also the pages today's sessions revised ahead, so "Done" counts the whole day.
  const donePagesToday = useMemo(() => doneOnDay(logs, revisionDay), [logs, revisionDay]);

  const userName = greetingName(user?.name, firebaseUser?.displayName);

  // Friday: suggest Surah Al-Kahf. Today's reading sessions tell whether it
  // was already read; they are only fetched on Fridays with the card on.
  const kahfDay = isKahfDay(revisionDay);
  const kahfEnabled = homePrefs.fridayKahfReminder;
  const [readingSessions, setReadingSessions] = useState<ReadingSession[]>([]);
  const [sessionsLoadedFor, setSessionsLoadedFor] = useState<string | null>(null);
  const [kahfSaving, setKahfSaving] = useState(false);
  const kahfSavingRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!kahfDay || !kahfEnabled) return;
      let live = true;
      firestoreService
        .getReadingSessions(20)
        .then((s) => {
          if (live) setReadingSessions(withPendingReadings(s));
        })
        .catch((err) => logger.warn('Failed to load reading sessions for Al-Kahf', err))
        .finally(() => {
          if (live) setSessionsLoadedFor(revisionDay);
        });
      return () => {
        live = false;
      };
    }, [kahfDay, kahfEnabled, revisionDay]),
  );
  const kahfDone = useMemo(
    () => kahfReadOn(revisionDay, readingSessions, logs),
    [revisionDay, readingSessions, logs],
  );
  const kahfState = kahfCardState({
    enabled: kahfEnabled,
    today: revisionDay,
    dismissedDay: homePrefs.kahfDismissedDay,
    done: kahfDone,
  });
  // Until today's sessions are in, a prompt might be about to turn into
  // "Read ✓"; wait rather than flash it.
  const showKahfCard =
    kahfState === 'done' || (kahfState === 'prompt' && sessionsLoadedFor === revisionDay);

  if (!user || !assignment) {
    return (
      <TopSafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          {error ? (
            <>
              <Text style={styles.errorTitle}>Couldn't load your data</Text>
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
      </TopSafeAreaView>
    );
  }

  const handleEditSession = (log: RevisionLog, reviewPages?: number[]) => {
    // Prefer the day's actual assignedPages so the edit modal shows the
    // whole session, not just what the user marked. Fall back to
    // revised+skipped for legacy logs without the assignedPages field.
    const sessionPages =
      reviewPages ??
      (log.assignedPages && log.assignedPages.length > 0
        ? [...log.assignedPages].sort((a, b) => a - b)
        : [...log.pagesRevised, ...log.pagesSkipped].sort((a, b) => a - b));
    setSelectedLog(log);
    setSelectedSessionPages(sessionPages);
    setShowEditModal(true);
  };

  const handleSaveSession = async (updatedLog: RevisionLog) => {
    if (updatedLog.id) {
      await updateLog(updatedLog);
    } else {
      // A review of a day with no session yet (see handleCtaPress) is saved as its first session.
      await addLog({
        date: updatedLog.date,
        assignedPages: updatedLog.assignedPages,
        pagesRevised: updatedLog.pagesRevised,
        pagesSkipped: updatedLog.pagesSkipped,
        weaknessUpdates: updatedLog.weaknessUpdates,
        durationMinutes: updatedLog.durationMinutes,
      });
    }
    setShowEditModal(false);
    setSelectedLog(null);
    setSelectedSessionPages([]);
  };

  const handleDeleteSession = async () => {
    if (selectedLog) {
      // A review with no session yet has nothing to delete.
      if (selectedLog.id) await deleteLog(selectedLog.id);
      setShowEditModal(false);
      setSelectedLog(null);
      setSelectedSessionPages([]);
    }
  };

  const handleCtaPress = () => {
    if (todayStatus.status === 'completed') {
      // The review is the day's done pages, the same set Home counts as Done:
      // today's first, then the pages revised ahead today (reviewPagesInOrder).
      const done = reviewPagesInOrder(logs, revisionDay, assignment.pages);
      const todayLog = logs.find((log) => log.date === revisionDay);
      // Done only by pages revised ahead from an earlier session: no session of
      // today yet, so the review opens as a new one, with those pages checked.
      const draft: RevisionLog = {
        id: '',
        date: revisionDay,
        assignedPages: assignment.pages,
        pagesRevised: done,
        pagesSkipped: [],
        weaknessUpdates: [],
        durationMinutes: 0,
      };
      handleEditSession(todayLog ?? draft, done);
    } else if (assignment.totalPages === 0) {
      navigation.navigate('Memorization', { edit: true });
    } else {
      navigation.navigate('ActiveRevision');
    }
  };

  const openKahf = () => {
    navigation.getParent()?.navigate('Read', {
      screen: 'QuranReader',
      params: { pageNumber: kahfPages()[0] },
      // Keep the surah index beneath it, so back lands on the Read tab's root.
      initial: false,
    });
  };

  const markKahfRead = async (minutes: number) => {
    // The ref stops a second tap before the state update re-renders.
    if (kahfSavingRef.current) return;
    kahfSavingRef.current = true;
    setKahfSaving(true);
    const session = kahfReadingSession(revisionDay, minutes, Date.now());
    try {
      // Saved on the phone at once; it reaches the server when it can.
      const id = autoId();
      await queueChange({ kind: 'reading.add', id, session });
      setReadingSessions((prev) => [{ ...session, id }, ...prev]);
    } catch (err) {
      logger.error('Failed to save Al-Kahf reading session', err);
      Alert.alert("Couldn't save", 'Please try again.');
    } finally {
      kahfSavingRef.current = false;
      setKahfSaving(false);
    }
  };

  const handleCarryOver = async () => {
    // The ref stops a double tap before the state update re-renders.
    if (!user || carryingRef.current || leftovers.pages.length === 0) return;
    carryingRef.current = true;
    setCarrying(true);
    try {
      const memorized = pages.filter((p) => p.status === 'memorized');
      await saveUser(applyCarryOver(user, memorized, leftovers.pages, revisionDate));
    } catch {
      Alert.alert("Couldn't update today's session", 'Please try again.');
    } finally {
      carryingRef.current = false;
      setCarrying(false);
    }
  };

  // Today starts at another juz, surah or page; the days after carry on from it.
  const handleJump = async (target: JumpTarget) => {
    setJumpOpen(false);
    if (!user) return;
    const memorized = pages.filter((p) => p.status === 'memorized');
    const result = jumpTo(user, target, { revisionDate, memorized, logs });
    if (!result) {
      Alert.alert("Couldn't start there", "That part isn't in your schedule.");
      return;
    }
    try {
      await saveUser(result.user);
      const where = describeStart(target, result.startPage);
      setJumped({ message: result.today ? `Today now starts at ${where}` : `Your next revision starts at ${where}`, before: user });
    } catch {
      Alert.alert("Couldn't update your schedule", 'Please try again.');
    }
  };

  const handleUndoJump = async () => {
    const last = jumped;
    setJumped(null);
    if (!user || !last) return;
    try {
      await saveUser(undoJump(user, last.before));
    } catch {
      Alert.alert("Couldn't undo", 'Please try again.');
    }
  };

  const editModal = selectedLog && (
    <EditSessionModal
      visible={showEditModal}
      onClose={() => {
        setShowEditModal(false);
        setSelectedLog(null);
        setSelectedSessionPages([]);
      }}
      log={selectedLog}
      quranData={quranData}
      sessionPages={selectedSessionPages}
      onSave={handleSaveSession}
      onDelete={handleDeleteSession}
    />
  );

  // A feed: Today in one post (its pages, the action, how much is memorized),
  // Friday's Al-Kahf, then the last few sessions; the rest is behind "See
  // all", searchable. A running timer shows in the top bar.
  const recent = sessionLogs.slice(0, COMPACT_SESSION_LIMIT);
  // How much of the Quran is memorized: everyone sees it (no setting).
  const memorized = memorizedText(pages);

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <HeroGlow />
      <TopBar
        left={<RunningTimerChip onOpenQuran={() => navigation.getParent()?.navigate('Read')} />}
        center={
          <Text
            style={[arabicV2(20), { color: palette.text }]}
            accessibilityLanguage="ar"
            // At the largest sizes it ran into the icons (or wrapped, on an SE).
            maxFontSizeMultiplier={salamScale}
            testID="salam"
          >
            السلام عليكم
          </Text>
        }
        right={
          <>
            <IconButton icon="compass-outline" label="Find the Qibla" onPress={() => openPrayer('qibla')} testID="open-qibla" />
            <IconButton icon="pulse-outline" label="Open activity" onPress={() => navigation.navigate('Activity')} testID="open-activity" />
            <IconButton icon="settings-outline" label="Open settings" onPress={() => navigation.navigate('Settings')} testID="open-settings" />
          </>
        }
        // Three icons on the right: both sides widen so the salam stays centred.
        sideWidth={TOP_BAR_SIDE}
      />
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
        refreshControl={
          // Transparent: an opaque pull area cut Home's glow off in a hard line.
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.secondary} style={{ backgroundColor: 'transparent' }} />
        }
        testID="home-v2"
      >
        {/* No line under the header: one across the glow ended it in a hard
            edge, at rest and while pulling (it read as a box). */}
        <OfflineNote />
        {prayerEnabled && prayerPrefs.homeLine && prayerTimes.next ? (
          <NextPrayerLine times={prayerTimes} onPress={() => openPrayer('times')} />
        ) : null}
        <TodayPost
          name={userName}
          initial={avatarInitial(userName, firebaseUser?.email)}
          status={todayStatus.status}
          pages={assignment.pages}
          done={donePagesToday}
          carried={carriedToday}
          streak={calculatedStreak}
          memorized={memorized}
          onPrimary={handleCtaPress}
          onEditSchedule={() => navigation.navigate('PlanEdit')}
          onMemorization={() => navigation.navigate('Memorization', { edit: true })}
          onJump={() => setJumpOpen(true)}
          catchUp={catchUpLine(leftovers)}
          onCarryOver={handleCarryOver}
          carrying={carrying}
          ahead={aheadNext ? { lead: aheadNext.lead, first: aheadNext.plan.pages[0] } : null}
          onAhead={() => aheadNext && navigation.navigate('ActiveRevision', { aheadDay: aheadNext.plan.day })}
        />

        {showKahfCard && (
          <KahfPost
            state={kahfState === 'done' ? 'done' : 'prompt'}
            saving={kahfSaving}
            onRead={openKahf}
            onMarkRead={markKahfRead}
            onDismiss={() => setHomePrefs({ kahfDismissedDay: revisionDay })}
          />
        )}

        <RecentSection
          title="Recent sessions"
          count={recent.length}
          emptyText="No sessions yet. Start your first revision above."
          onSeeAll={() => navigation.navigate('ActivityAll', { kind: 'revision' })}
          testID="home-recent"
        >
          {recent.map((log, i) => (
            <SessionPost
              key={log.id}
              log={log}
              today={revisionDay}
              onEdit={() => handleEditSession(log)}
              onDelete={() => deleteLog(log.id)}
              separator={i < recent.length - 1}
            />
          ))}
        </RecentSection>
      </ScrollView>
      {editModal}
      <UpdateReadySheet />
      <StoreUpdateSheet />
      <JumpSheet
        visible={jumpOpen}
        onClose={() => setJumpOpen(false)}
        user={user}
        memorized={pages.filter((p) => p.status === 'memorized')}
        revisionDate={revisionDate}
        onJump={handleJump}
      />
      <UndoToast
        visible={!!jumped}
        message={jumped?.message ?? ''}
        onUndo={handleUndoJump}
        onDismiss={() => setJumped(null)}
        duration={6000}
        bottomInset={tabFootprint}
      />
      {prayerEnabled ? (
        <PrayerSheet
          visible={qiblaOpen}
          tab={prayerTab}
          onTab={setPrayerTab}
          onClose={() => setQiblaOpen(false)}
          onOpenCalculation={() => {
            setQiblaOpen(false);
            navigation.navigate('PrayerCalculation');
          }}
        />
      ) : (
        <QiblaSheet visible={qiblaOpen} onClose={() => setQiblaOpen(false)} />
      )}
    </TopSafeAreaView>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    scrollView: { flex: 1 },
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
  });
