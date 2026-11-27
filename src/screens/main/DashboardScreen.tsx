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
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { PillButton } from '../../components/v2/PillButton';
import { EditSessionModal } from '../../components/EditSessionModal';
import { greetingName } from '../../lib/displayName';
import { setHomePrefs, useHomePrefs } from '../../lib/homePrefs';
import { kahfCardState, kahfPages, kahfReadingSession, kahfReadOn } from '../../lib/kahf';
import { useKahfFriday } from '../../hooks/useKahfFriday';
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
import { ensureNotificationsPermission } from '../../lib/notifications';
import { ReadingSession, RevisionLog } from '../../types';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import { HEADER_MAX_SCALE, TodayPost, memorizedText } from '../../components/home/feed/TodayPost';
import { SessionPost } from '../../components/home/feed/SessionPost';
import { KahfPost } from '../../components/home/feed/KahfPost';
import { RecentSection } from '../../components/activity/ActivityItemRow';
import { useHomeV3 } from '../../lib/release/homeV3';
import { RunningTimerChip } from '../../components/timer/RunningTimerChip';
import { HeroGlow } from '../../components/v2/HeroGlow';
import { HomeGround } from '../../components/home/HomeGround';
import { HomeAyah } from '../../components/home/feed/HomeAyah';
import { useHomeBackground } from '../../lib/homeBackground';
import { RamadanHome, WithCrescent } from '../../components/ramadan';
import { RamadanIntro } from '../../components/ramadan/RamadanIntro';
import { useRamadanTheme } from '../../lib/ramadanTheme';
import { QiblaSheet } from '../../components/qibla/QiblaSheet';
import { PrayerSheet, PrayerTab } from '../../components/prayer/PrayerSheet';
import { NextPrayerLine } from '../../components/prayer/NextPrayerLine';
import { usePrayerTimes } from '../../components/prayer/usePrayerTimes';
import { prayerTimesEnabled } from '../../lib/prayer/status';
import { usePrayerPrefs } from '../../lib/prayer/prefs';
import { onPrayerSheetRequest } from '../../lib/widgets/links';
import { onJumpSheetRequest } from '../../lib/revo/screens';
import { IconButton, TopBar } from '../../components/v2/TopBar';
import { arabicV2, layoutV2 } from '../../theme/v2';
import { avatarInitial } from '../../lib/displayName';
import { prefetchPages } from '../../lib/pageCache';
import { catchUpLine } from '../../lib/todayLines';
import { applyCarryOver, leftoversFor, type Leftovers } from '../../lib/carryOver';
import { heldElsewhere, reviewPagesInOrder, takeBackCredit } from '../../lib/aheadCredit';
import { ownRevised } from '../../lib/activityItems';
import { aheadLead, nextRevisionDayPlan } from '../../lib/aheadPlan';
import type { HistoryItem } from '../../lib/streakFromItems';
import { handLogsOf, loadActivityHistory, sameHistory, shareActivityHistory, withPendingHandLogs } from '../../lib/activityHistory';
import { accountDesignEnabled } from '../../lib/release/accountDesign';
import { useAccountJourney } from '../../lib/accountJourney';
import { latestMilestone } from '../../lib/badges';
import { useNewBadge } from '../../lib/badgeSeen';
import { usePremium } from '../../lib/premium';
import { reciteLiveForAccount } from '../../lib/reciteLive/availability';
import { ProfilePicture } from '../../components/account/ProfilePicture';
import { useAccountPhoto } from '../../lib/accountPicture';
import { pendingEntries } from '../../lib/offline/outbox';
import { todaySnapshot } from '../../lib/todaySnapshot';
import { JumpSheet } from '../../components/home/JumpSheet';
import { UndoToast } from '../../components/revision/UndoToast';
import { HelpButton } from '../../components/help/HelpButton';
import { HelpToast } from '../../components/help/HelpToast';
import { describeStart, jumpTo, undoJump, type JumpTarget } from '../../lib/jump';
import type { User } from '../../types';
import { partlyMemorizedAyahs, revisablePages } from '../../lib/memorizedAyahs';
import { t } from '../../i18n';

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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const salamRoom = screenWidth - 2 * layoutV2.gutter - 2 * TOP_BAR_SIDE - 2 * 12;
  const salamScale = Math.max(1, Math.min(1.4, salamRoom / SALAM_INK_WIDTH));
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Revisely Dev's Ramadan theme (THEME-1): decorations only.
  const ramadan = useRamadanTheme();

  const { user, pages, logs, addLog, updateLog, deleteLog, loadData, error, saveUser, pendingChanges } = useApp();
  const { firebaseUser } = useAuth();
  const { day: revisionDay, date: revisionDate } = useRevisionDay(user);
  // Home, version 3 (Revisely Dev): today alone, one solid button (HOME-4, HOME-5).
  const homeV3 = useHomeV3();

  const homePrefs = useHomePrefs();
  // Room for the tab bar (and the mini player) and for Revo's button.
  const tabBar = useTabBarFootprint();
  const tabFootprint = tabBar + useRevoFootprint();
  // Home's ground with Home v3 (HOME-6): Glow, Two glows, or Glow and an ayah (the default), kept on this phone.
  const background = useHomeBackground();
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
  // Revo's "Open Jump to" (REVO-31) opens Jump to… here.
  useEffect(() => onJumpSheetRequest(() => setJumpOpen(true)), []);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSessionPages, setSelectedSessionPages] = useState<number[]>([]);
  // The review's pages done for its day that other sessions hold (SESS-4): checked there, kept where they are.
  const [selectedHeld, setSelectedHeld] = useState<number[]>([]);
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

  // The streak's history: the Activity items of the last 400 days (C5), read when the day or the
  // number of sessions changes, and shared with Revo (lib/activityHistory), which builds from it too.
  // Also each time Home comes back into view: pages added by hand in Activity change no session, and
  // the streak didn't move until the next session (ACT-15, Nov 2026).
  // Coming back reads it again without rendering Home first, and a history that came back the same renders
  // nothing: every swipe back from Read rendered all of Home twice, as the pager settled (Android froze it).
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const reloadHistory = useRef<() => void>(() => undefined);
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reloadHistory.current();
      focusedOnce.current = true;
    }, []),
  );
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let latestRead = 0;
    const to = revisionDay;
    const uid = user.id;
    const load = () => {
      const read = ++latestRead;
      loadActivityHistory(to)
        .then((items) => {
          if (cancelled || read !== latestRead) return;
          setHistory((had) => (had && sameHistory(had, items) ? had : items));
          shareActivityHistory(uid, to, items);
        })
        .catch(() => undefined);
    };
    reloadHistory.current = load;
    load();
    return () => {
      cancelled = true;
      reloadHistory.current = () => undefined;
    };
  }, [user, revisionDay, logs.length]);

  // Today as Home shows it (lib/todaySnapshot): its pages, how far they've got, done or not, and the
  // streak. Revo's context is built from the same function, so the two never disagree.
  // With the pages logged by hand that are still waiting on this phone (offline, or not sent yet).
  const counted = useMemo(
    () => withPendingHandLogs(history, user ? pendingEntries(user.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, user, pendingChanges],
  );
  const snapshot = useMemo(
    () =>
      user && assignment
        ? todaySnapshot({ user, pages, logs, day: revisionDay, assignment: assignment.pages, history: counted, now: Date.now() })
        : null,
    [user, pages, logs, revisionDay, assignment, counted],
  );
  const todayStatus = { status: snapshot?.status ?? ('not_started' as const) };

  // The account's picture and latest badge on the Today post (ACCOUNT-7; the Account page's new look). Home reads the
  // history itself, so the journey waits for it. Home is where an account is first read: its badges so far count as
  // seen there (lib/badgeSeen), so only badges won from now on arrive as new.
  const accountV2 = accountDesignEnabled();
  const journey = useAccountJourney({ enabled: accountV2, load: false });
  const latestBadge = accountV2 && journey ? latestMilestone(journey.pagesRevised) : undefined;
  useNewBadge(accountV2 ? user?.id : null, latestBadge);
  const premiumNow = usePremium(user?.id, accountV2 && reciteLiveForAccount(user));
  const photoUrl = useAccountPhoto(firebaseUser);

  // Done today: the next revision day, which Home's quiet line opens (#168). It goes on past the cycle's
  // end (AHEAD-3): a day that repeats today's pages opens as a new round, and one that begins the plan
  // again reads "Next cycle starts at …".
  const aheadNext = useMemo(() => {
    if (!user || !assignment || todayStatus.status !== 'completed' || assignment.pages.length === 0) return null;
    const plan = nextRevisionDayPlan(user, pages, revisionDay, new Set(assignment.pages), logs);
    if (!plan || plan.pages.length === 0) return null;
    return { plan, lead: aheadLead(user, pages, revisionDay, plan) };
  }, [user, pages, logs, assignment, revisionDay, todayStatus.status]);

  // Pages from the last few revision days that were never revised (a day with
  // no session at all counts as missed), offered as "Add to today". Empty once
  // they are in today's assignment.
  const leftovers = useMemo<Leftovers>(() => {
    if (!user || !assignment) return { pages: [], from: {}, days: [] };
    // Pages logged by hand for a day aren't left over from it (ACT-15).
    return leftoversFor(user, [...logs, ...handLogsOf(counted)], revisionDay, assignment.pages, revisablePages(pages));
  }, [logs, counted, revisionDay, assignment, pages, user]);

  // Today's pages that came from earlier days (they come first: "4 from yesterday first").
  const carriedToday = snapshot?.carried.length ?? 0;

  // Reminders on, and this phone never asked (signed in on a new phone, or a reinstall): ask once (REMIND-4). With
  // reminders off nothing asks, and iOS never asks twice.
  const remindersOn = user?.notificationsEnabled === true;
  useEffect(() => {
    if (remindersOn) void ensureNotificationsPermission().catch(() => undefined);
  }, [remindersOn]);

  // The streak (lib/streak): the same rule and the same answer as the widget.
  const streakNow = snapshot?.streak.reading ?? null;
  const calculatedStreak = streakNow?.streak ?? 0;

  // Sessions
  const sessionLogs = useMemo(
    () =>
      logs
        // A day Keep daily amount filled with catch-up pages revised them alone (ownRevised).
        .filter((l) => l.pagesRevised.length > 0 || ownRevised(l).length > 0)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [logs],
  );

  // Pages revised today: the Today post's page chips fill in as they're done.
  // Includes pages revised ahead for today (lib/aheadCredit).
  // Also the pages today's sessions revised ahead, so "Done" counts the whole day.
  const donePagesToday = useMemo(() => snapshot?.done ?? new Set<number>(), [snapshot]);
  // Partly memorized pages are named by their memorized ayahs (MEM-4).
  const partial = useMemo(() => partlyMemorizedAyahs(pages), [pages]);
  // Carried pages still to revise: once today's own pages are done, the button goes on to them.
  const carriedLeft = snapshot?.carriedLeft ?? 0;

  const userName = greetingName(user?.name, firebaseUser?.displayName);

  // The Islamic Friday (Thursday's maghrib to Friday's, KAHF-1): suggest Surah
  // Al-Kahf. The latest reading sessions tell whether it was already read inside
  // that window; they are only fetched then, with the card on.
  const kahf = useKahfFriday(user);
  const kahfFriday = kahf?.day ?? null;
  const kahfEnabled = homePrefs.fridayKahfReminder;
  const [readingSessions, setReadingSessions] = useState<ReadingSession[]>([]);
  const [sessionsLoadedFor, setSessionsLoadedFor] = useState<string | null>(null);
  const [kahfSaving, setKahfSaving] = useState(false);
  const kahfSavingRef = useRef(false);
  // Read once Auth has a user: on a slow start Home opens on the account's copy before Auth has checked the saved
  // sign-in, and a read then fails ("User not authenticated") and showed the card unread (KAHF-2).
  const authUid = firebaseUser?.uid ?? null;
  useFocusEffect(
    useCallback(() => {
      if (!kahfFriday || !kahfEnabled || !authUid) return;
      let live = true;
      firestoreService
        .getReadingSessions(20)
        .then((s) => {
          if (live) setReadingSessions(withPendingReadings(s));
        })
        .catch((err) => logger.warn('Failed to load reading sessions for Al-Kahf', err))
        .finally(() => {
          if (live) setSessionsLoadedFor(kahfFriday);
        });
      return () => {
        live = false;
      };
    }, [kahfFriday, kahfEnabled, authUid]),
  );
  const kahfDone = useMemo(
    () => (kahf ? kahfReadOn(kahf, readingSessions, logs) : false),
    [kahf, readingSessions, logs],
  );
  const kahfState = kahfCardState({
    enabled: kahfEnabled,
    friday: kahfFriday,
    dismissedDay: homePrefs.kahfDismissedDay,
    done: kahfDone,
  });
  // Until the sessions are in, a prompt might be about to turn into
  // "Done ✓"; wait rather than flash it.
  const showKahfCard =
    kahfState === 'done' || (kahfState === 'prompt' && sessionsLoadedFor === kahfFriday);

  if (!user || !assignment) {
    return (
      <TopSafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          {error ? (
            <>
              <Text style={styles.errorTitle}>{t('home.screen.loadFailed')}</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <PillButton
                title={t('common.tryAgain')}
                onPress={loadData}
                style={styles.retryButton}
              />
            </>
          ) : (
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          )}
        </View>
      </TopSafeAreaView>
    );
  }

  const handleEditSession = (log: RevisionLog, reviewPages?: number[], held: number[] = []) => {
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
    setSelectedHeld(held);
    setShowEditModal(true);
  };

  const closeReview = () => {
    setShowEditModal(false);
    setSelectedLog(null);
    setSelectedSessionPages([]);
    setSelectedHeld([]);
  };

  const handleSaveSession = async (updatedLog: RevisionLog, released: number[]) => {
    // Pages another session holds that were unchecked: their credit to the day is taken back there (SESS-4);
    // that session keeps its revision of them (AHEAD-6).
    for (const changed of takeBackCredit(logs, updatedLog.date, released, updatedLog.id)) await updateLog(changed);
    if (updatedLog.id) {
      await updateLog(updatedLog);
    } else if (updatedLog.pagesRevised.length > 0 || updatedLog.weaknessUpdates.length > 0) {
      // A review of a day with no session yet (see handleCtaPress) becomes its first session only when it holds
      // something of its own: the pages other sessions revised stay theirs.
      await addLog({
        date: updatedLog.date,
        assignedPages: updatedLog.assignedPages,
        pagesRevised: updatedLog.pagesRevised,
        pagesSkipped: updatedLog.pagesSkipped,
        weaknessUpdates: updatedLog.weaknessUpdates,
        durationMinutes: updatedLog.durationMinutes,
      });
    }
    closeReview();
  };

  const handleDeleteSession = async () => {
    if (selectedLog) {
      // A review with no session yet has nothing to delete.
      if (selectedLog.id) await deleteLog(selectedLog.id);
      closeReview();
    }
  };

  const handleCtaPress = () => {
    if (todayStatus.status === 'completed' && carriedLeft > 0) {
      // Today is done, and pages added from earlier days are left: the session holds them.
      navigation.navigate('ActiveRevision');
    } else if (todayStatus.status === 'completed') {
      // The review is the day's done pages, the same set Home counts as Done:
      // today's first, then the pages revised ahead today (reviewPagesInOrder).
      const done = reviewPagesInOrder(logs, revisionDay, assignment.pages);
      const todayLog = logs.find((log) => log.date === revisionDay);
      // Done only by pages revised ahead from an earlier session: no session of
      // today yet, so the review opens as a new one, holding none of them itself.
      const draft: RevisionLog = {
        id: '',
        date: revisionDay,
        assignedPages: assignment.pages,
        pagesRevised: [],
        pagesSkipped: [],
        weaknessUpdates: [],
        durationMinutes: 0,
      };
      const log = todayLog ?? draft;
      // Every done page starts checked, the ones other sessions hold too (SESS-4).
      handleEditSession(log, done, heldElsewhere(logs, revisionDay, log));
    } else if (assignment.totalPages === 0) {
      navigation.navigate('Memorization', { edit: true });
    } else {
      navigation.navigate('ActiveRevision');
    }
  };

  // Today's ayah and Al-Kahf open the reader over Home, in Home's own stack, so back comes back to Home (HOME-7, KAHF-2;
  // Majd, Nov 26 2026). The Read tab's reader would leave back on the Read tab's surah list.
  const openAyah = (page: number) => {
    navigation.navigate('QuranReader', { pageNumber: page });
  };

  const openKahf = () => {
    navigation.navigate('QuranReader', { pageNumber: kahfPages()[0] });
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
      Alert.alert(t('home.screen.saveFailed'), t('common.pleaseTryAgain'));
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
      const memorized = revisablePages(pages);
      await saveUser(applyCarryOver(user, memorized, leftovers.pages, revisionDate, leftovers.from));
    } catch {
      Alert.alert(t('home.screen.carryFailed'), t('common.pleaseTryAgain'));
    } finally {
      carryingRef.current = false;
      setCarrying(false);
    }
  };

  // Today starts at another juz, surah or page; the days after carry on from it.
  const handleJump = async (target: JumpTarget) => {
    setJumpOpen(false);
    if (!user) return;
    const memorized = revisablePages(pages);
    const result = jumpTo(user, target, { revisionDate, memorized, logs });
    if (!result) {
      Alert.alert(t('home.screen.jumpRefused'), t('home.screen.jumpRefusedBody'));
      return;
    }
    try {
      await saveUser(result.user);
      const where = describeStart(target, result.startPage);
      setJumped({
        message: result.today ? t('home.screen.todayStartsAt', { where }) : t('home.screen.nextStartsAt', { where }),
        before: user,
      });
    } catch {
      Alert.alert(t('home.screen.jumpFailed'), t('common.pleaseTryAgain'));
    }
  };

  const handleUndoJump = async () => {
    const last = jumped;
    setJumped(null);
    if (!user || !last) return;
    try {
      await saveUser(undoJump(user, last.before));
    } catch {
      Alert.alert(t('home.screen.undoFailed'), t('common.pleaseTryAgain'));
    }
  };

  const editModal = selectedLog && (
    <EditSessionModal
      visible={showEditModal}
      onClose={closeReview}
      log={selectedLog}
      quranData={quranData}
      sessionPages={selectedSessionPages}
      held={selectedHeld}
      onSave={handleSaveSession}
      onDelete={handleDeleteSession}
    />
  );

  // A feed: Today in one post (its pages, the action, how much is memorized),
  // Friday's Al-Kahf, then the last few sessions; the rest is behind "See
  // all", searchable. In Revisely Dev, no sessions: they are in Activity
  // (HOME-4). A running timer shows in the top bar.
  const recent = sessionLogs.slice(0, COMPACT_SESSION_LIMIT);
  // How much of the Quran is memorized: everyone sees it (no setting).
  const memorized = memorizedText(pages);

  const salam = (
    <Text
      style={[arabicV2(20), { color: palette.text }]}
      accessibilityLanguage="ar"
      // At the largest sizes it ran into the icons (or wrapped, on an SE).
      maxFontSizeMultiplier={salamScale}
      testID="salam"
    >
      السلام عليكم
    </Text>
  );

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      {homeV3 ? <HomeGround background={background} ramadan={ramadan} bottom={tabBar} /> : <HeroGlow />}
      {/* With Home v3 the light falls the whole way down to the tab bar, as the ground does (HOME-6). */}
      {ramadan ? <RamadanHome fall={homeV3 ? screenHeight - tabBar : undefined} /> : null}
      {/* The theme's one card, the first time it shows on this phone (THEME-7). */}
      {ramadan ? <RamadanIntro /> : null}
      <TopBar
        left={<RunningTimerChip onOpenQuran={() => navigation.getParent()?.navigate('Read')} />}
        center={ramadan ? <WithCrescent>{salam}</WithCrescent> : salam}
        right={
          <>
            {/* Settings alone (Majd, Nov 23 2026): Activity is a tab (TAB-2), and the prayer line opens the Prayer sheet,
                Qibla beside the times (HOME-1). */}
            <IconButton icon="settings-outline" label={t('home.screen.settings')} onPress={() => navigation.navigate('Settings')} testID="open-settings" />
          </>
        }
        // Three icons on the right: both sides widen so the salam stays centred.
        sideWidth={TOP_BAR_SIDE}
      />
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad, flexGrow: homeV3 ? 1 : undefined }}
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
          picture={
            accountV2 ? (
              <ProfilePicture
                size={premiumNow.has ? 35 : 40}
                photoUrl={photoUrl}
                initial={avatarInitial(userName, firebaseUser?.email)}
                premium={premiumNow.has}
                badge={latestBadge ?? null}
                testID="today-picture-mark"
              />
            ) : undefined
          }
          onPicture={() => navigation.navigate('Settings', { page: 'account' })}
          status={todayStatus.status}
          pages={assignment.pages}
          partial={partial}
          done={donePagesToday}
          carried={carriedToday}
          carriedInsights={snapshot?.carriedInsights ?? 0}
          carriedLeft={carriedLeft}
          streak={calculatedStreak}
          streakGrace={streakNow?.grace ?? null}
          memorized={memorized}
          onPrimary={handleCtaPress}
          onMemorization={() => navigation.navigate('Memorization', { edit: true })}
          onJump={() => setJumpOpen(true)}
          catchUp={catchUpLine(leftovers, partial, { quiet: homeV3 })}
          onCarryOver={handleCarryOver}
          carrying={carrying}
          quietCatchUp={homeV3}
          // Home v3: the hairline only when a post follows (Al-Kahf); with nothing under Today, the ground runs on.
          separator={!homeV3 || showKahfCard}
          ahead={aheadNext ? { lead: aheadNext.lead, first: aheadNext.plan.pages[0] } : null}
          onAhead={() =>
            aheadNext &&
            navigation.navigate('ActiveRevision', { aheadDay: aheadNext.plan.day, ...(aheadNext.plan.round ? { round: true } : {}) })
          }
          help={<HelpButton screen="home" size={20} color={palette.secondary} maxFontSizeMultiplier={HEADER_MAX_SCALE} />}
        />

        {showKahfCard && (
          <KahfPost
            state={kahfState === 'done' ? 'done' : 'prompt'}
            eve={revisionDay !== kahfFriday}
            saving={kahfSaving}
            quietRead={homeV3}
            onRead={openKahf}
            onMarkRead={markKahfRead}
            onDismiss={() => setHomePrefs({ kahfDismissedDay: kahfFriday })}
          />
        )}

        {homeV3 ? null : (
          <RecentSection
            title={t('home.screen.recent')}
            count={recent.length}
            emptyText={t('home.screen.noSessions')}
            onSeeAll={() => navigation.navigate('ActivityAll', { kind: 'revision' })}
            testID="home-recent"
          >
            {recent.map((log, i) => (
              <SessionPost
                key={log.id}
                log={log}
                today={revisionDay}
                juzPlan={user?.scheduleMode === 'juz'}
                onEdit={() => handleEditSession(log)}
                onDelete={() => deleteLog(log.id)}
                separator={i < recent.length - 1}
              />
            ))}
          </RecentSection>
        )}
        {homeV3 && background === 'ayah' ? (
          // Today's ayah (HOME-7): after the posts, pushed to the foot of the screen when there is room, so it never
          // sits over them.
          <>
            <View style={styles.grow} />
            <HomeAyah day={revisionDay} onOpen={openAyah} />
          </>
        ) : null}
      </ScrollView>
      {editModal}
      <UpdateReadySheet />
      <StoreUpdateSheet />
      <JumpSheet
        visible={jumpOpen}
        onClose={() => setJumpOpen(false)}
        user={user}
        memorized={revisablePages(pages)}
        revisionDate={revisionDate}
        onJump={handleJump}
      />
      <HelpToast screen="home" bottomInset={tabFootprint} />
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
          onOpenVoice={(prayer) => {
            setQiblaOpen(false);
            navigation.navigate('AthanVoice', { prayer });
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
    // Takes the room left under the posts, so today's ayah sits at the foot of the screen (HOME-7).
    grow: { flexGrow: 1 },
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
