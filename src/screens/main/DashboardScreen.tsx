import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  Alert,
} from 'react-native';
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
import { logger } from '../../lib/logger';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/v2';
import {
  generateDailyAssignment,
  shiftScheduleAnchor,
  canPushScheduleBack,
  scheduleStartingByToday,
} from '../../lib/algorithm';
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
import { IconButton, TopBar } from '../../components/v2/TopBar';
import { arabicV2, layoutV2 } from '../../theme/v2';
import { avatarInitial } from '../../lib/displayName';
import { prefetchPages } from '../../lib/pageCache';
import { applyCarryOver, findLeftoverPages, hasCarriedOver } from '../../lib/carryOver';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Dashboard'>;

const COMPACT_SESSION_LIMIT = 3;

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme, palette } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const { user, pages, logs, updateLog, deleteLog, loadData, error, saveUser } = useApp();
  const { firebaseUser } = useAuth();
  const { day: revisionDay, date: revisionDate } = useRevisionDay(user);

  const homePrefs = useHomePrefs();
  const tabFootprint = useTabBarFootprint();
  const [shifting, setShifting] = useState(false);
  const [carrying, setCarrying] = useState(false);

  // A schedule that starts after today (an earlier "back a day" on a schedule
  // that started today) leaves today with nothing to revise: start it today.
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
    const todayLogs = logs.filter((log) => log.date === revisionDay);
    if (todayLogs.length === 0)
      return { status: 'not_started' as const, pagesCompleted: 0 };

    const pagesRevisedToday = new Set<number>();
    todayLogs.forEach((log) =>
      log.pagesRevised.forEach((p) => pagesRevisedToday.add(p)),
    );
    const totalAssigned = assignment?.totalPages || 0;
    const completed = pagesRevisedToday.size;
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

  // Pages from yesterday's session that were never revised, offered as
  // "Add to today". Empty once they are in today's assignment.
  const leftovers = useMemo(() => {
    // Once a day: after carrying over, today's leftovers are part of today.
    if (!assignment || hasCarriedOver(user, revisionDay)) return [];
    const memorized = new Set(
      pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber),
    );
    return findLeftoverPages(logs, revisionDay, assignment.pages, memorized);
  }, [logs, revisionDay, assignment, pages, user]);

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
    const sortedDays = logs.map((l) => localDay(l.date)).sort((a, b) => b - a);
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
  }, [logs, revisionDate]);

  // Sessions
  const sessionLogs = useMemo(
    () =>
      logs
        .filter((l) => l.pagesRevised.length > 0)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [logs],
  );

  // Pages revised today: the Today post's page chips fill in as they're done.
  const donePagesToday = useMemo(() => {
    const done = new Set<number>();
    logs.filter((log) => log.date === revisionDay).forEach((log) => log.pagesRevised.forEach((p) => done.add(p)));
    return done;
  }, [logs, revisionDay]);

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
          if (live) setReadingSessions(s);
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
      <SafeAreaView style={styles.container}>
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
      </SafeAreaView>
    );
  }

  const handleEditSession = (log: RevisionLog) => {
    // Prefer the day's actual assignedPages so the edit modal shows the
    // whole session, not just what the user marked. Fall back to
    // revised+skipped for legacy logs without the assignedPages field.
    const sessionPages =
      log.assignedPages && log.assignedPages.length > 0
        ? [...log.assignedPages].sort((a, b) => a - b)
        : [...log.pagesRevised, ...log.pagesSkipped].sort((a, b) => a - b);
    setSelectedLog(log);
    setSelectedSessionPages(sessionPages);
    setShowEditModal(true);
  };

  const handleSaveSession = async (updatedLog: RevisionLog) => {
    await updateLog(updatedLog);
    setShowEditModal(false);
    setSelectedLog(null);
    setSelectedSessionPages([]);
  };

  const handleDeleteSession = async () => {
    if (selectedLog) {
      await deleteLog(selectedLog.id);
      setShowEditModal(false);
      setSelectedLog(null);
      setSelectedSessionPages([]);
    }
  };

  const handleCtaPress = () => {
    if (todayStatus.status === 'completed') {
      const todayLog = logs.find(
        (log) => log.date === revisionDay,
      );
      if (todayLog) handleEditSession(todayLog);
    } else if (assignment.totalPages === 0) {
      navigation.navigate('Memorization');
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
    const write = firestoreService.addReadingSession(session);
    try {
      // Offline, the write is queued and only settles when the server acks
      // (as with the reading timer): show it as read after a few seconds.
      const id = await Promise.race([
        write,
        new Promise<string>((resolve) => setTimeout(() => resolve(`pending-${session.startedAt}`), 6000)),
      ]);
      setReadingSessions((prev) => [{ ...session, id }, ...prev]);
    } catch (err) {
      logger.error('Failed to save Al-Kahf reading session', err);
      Alert.alert("Couldn't save", 'Please try again.');
    } finally {
      kahfSavingRef.current = false;
      setKahfSaving(false);
    }
    write.catch((err) => logger.error('Al-Kahf reading session write failed', err));
  };

  const handleCarryOver = async () => {
    // The ref stops a double tap before the state update re-renders.
    if (!user || carryingRef.current || leftovers.length === 0) return;
    carryingRef.current = true;
    setCarrying(true);
    try {
      const memorized = pages.filter((p) => p.status === 'memorized');
      await saveUser(applyCarryOver(user, memorized, leftovers, revisionDate));
    } catch {
      Alert.alert("Couldn't update today's session", 'Please try again.');
    } finally {
      carryingRef.current = false;
      setCarrying(false);
    }
  };

  // Fell behind? Slide the whole schedule a day later so today reverts to the
  // review you missed instead of marching on. Pure anchor nudge — no per-day
  // edits — applied immediately so the Today post updates in place.
  const handlePushBack = async () => {
    if (!user || shifting || !canPushScheduleBack(user, revisionDate)) return;
    setShifting(true);
    try {
      await saveUser(shiftScheduleAnchor(user, 1));
    } catch {
      Alert.alert("Couldn't update your schedule", 'Please try again.');
    } finally {
      setShifting(false);
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
  const progress =
    homePrefs.showProgressCard && pages.some((p) => p.status === 'memorized')
      ? memorizedText(pages, homePrefs.metrics)
      : null;
  const memorized = progress?.body ?? null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <HeroGlow />
      <TopBar
        left={<RunningTimerChip onOpenQuran={() => navigation.getParent()?.navigate('Read')} />}
        center={
          <Text style={[arabicV2(20), { color: palette.text }]} accessibilityLanguage="ar" testID="salam">
            السلام عليكم
          </Text>
        }
        right={
          <>
            <IconButton icon="pulse-outline" label="Open activity" onPress={() => navigation.navigate('Activity')} />
            <IconButton icon="settings-outline" label="Open settings" onPress={() => navigation.navigate('Settings')} />
          </>
        }
      />
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
        refreshControl={
          // Transparent: an opaque pull area cut Home's glow off in a hard line.
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.secondary} style={{ backgroundColor: 'transparent' }} />
        }
        testID="home-v2"
      >
        <View style={{ height: layoutV2.hairline, backgroundColor: palette.separator }} />
        <TodayPost
          name={userName}
          initial={avatarInitial(userName, firebaseUser?.email)}
          status={todayStatus.status}
          pages={assignment.pages}
          juzBreakdown={assignment.juzBreakdown}
          done={donePagesToday}
          streak={calculatedStreak}
          memorized={memorized}
          memorizedFraction={progress?.fraction}
          memorizedJuz={progress?.juz}
          progressStyle={homePrefs.progressStyle}
          onPrimary={handleCtaPress}
          onEditSchedule={() => navigation.navigate('PlanEdit')}
          onMemorization={() => navigation.navigate('Memorization')}
          leftovers={leftovers.length}
          onCarryOver={handleCarryOver}
          carrying={carrying}
          onPushBack={handlePushBack}
          canPushBack={canPushScheduleBack(user, revisionDate)}
          shifting={shifting}
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
    </SafeAreaView>
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
