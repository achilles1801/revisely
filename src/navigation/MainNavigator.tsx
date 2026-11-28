import React, { useCallback, useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute, NavigatorScreenParams } from '@react-navigation/native';
import DashboardScreen from '../screens/main/DashboardScreen';
import AlgorithmScreen from '../screens/main/AlgorithmScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import MemorizationScreen from '../screens/main/MemorizationScreen';
import YourSurahsScreen from '../screens/main/YourSurahsScreen';
import LearnSurahScreen from '../screens/main/LearnSurahScreen';
import PlanEditScreen from '../screens/main/PlanEditScreen';
import PlanDayEditScreen from '../screens/main/PlanDayEditScreen';
import PrayerCalculationScreen from '../screens/prayer/PrayerCalculationScreen';
import PrayerNotificationsScreen from '../screens/prayer/PrayerNotificationsScreen';
import AthanVoiceScreen from '../screens/prayer/AthanVoiceScreen';
import OnDeviceBenchScreen from '../screens/main/OnDeviceBenchScreen';
import OnboardingPreviewScreen from '../screens/onboarding/OnboardingPreviewScreen';
import ActiveRevisionScreen from '../screens/revision/ActiveRevisionScreen';
import ReadIndexScreen from '../screens/read/ReadIndexScreen';
import QuranReaderScreen from '../screens/read/QuranReaderScreen';
import QuranSearchScreen from '../screens/read/QuranSearchScreen';
import { RevoHost } from '../components/revo/RevoHost';
import type { ScheduleDraft } from '../lib/revo/scheduleDraft';
import { ReportProblemHost } from '../components/report/ReportProblemHost';
import ListenBackScreen from '../screens/activity/ListenBackScreen';
import ActivityScreen from '../screens/activity/ActivityScreen';
import ActivityDayScreen from '../screens/activity/ActivityDayScreen';
import ActivityAllScreen from '../screens/activity/ActivityAllScreen';
import PagesByStrengthScreen from '../screens/activity/PagesByStrengthScreen';
import LastRevisedScreen from '../screens/activity/LastRevisedScreen';
import ActivitySectionScreen from '../screens/activity/ActivitySectionScreen';
import ActivityMonthScreen from '../screens/activity/ActivityMonthScreen';
import ActivityRamadanScreen from '../screens/activity/ActivityRamadanScreen';
import type { InsightsSection } from '../lib/activitySections';
import { activityBlocksEnabled } from '../components/activity/DayBlocks';
import type { ActivityKind } from '../lib/activityItems';
import { ReadingTimerProvider } from '../context/ReadingTimerContext';
import { useAppUsageTracking } from '../lib/appUsage';
import { useWarmCheckerOnFront } from '../components/reciteLive/useKeepCheckerWarm';
import { reciteLiveForAccount } from '../lib/reciteLive/availability';
import { reciteCheckOff } from '../lib/reciteLive/off';
import { TabBar, useTabBarHeight } from './TabBar';
import type { PagerTabBarProps } from './PagerTabs';
import { MiniPlayer, MINI_PLAYER_GAP } from '../components/player/MiniPlayer';
import { getRecitation } from '../lib/recitation';
import { openReaderAt } from './openReader';
import { fade, front, revealListeners, useReveal, type Front } from './tabReveal';
import { revealScreenLayout } from './RevealLayout';
import { createPagerTabNavigator } from './PagerTabs';
import { insightsTab, mainTabRoutes, swipeableTabCount } from './tabPages';
import { SmartTrackingPreviewScreen } from '../screens/preview/SmartTrackingPreviewScreen';
import { useApp } from '../context/AppContext';
import type { RevoSettingsSection } from '../lib/revo/types';
import type { SettingsPage } from '../lib/settingsPages';

export type MainTabParamList = {
  // Non-screen code (the timer) opens a day of Activity on the Home stack.
  Home: NavigatorScreenParams<HomeStackParamList> | undefined;
  // Activity's tab (TAB-2): Activity first, then what it opens.
  ActivityTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  // Home opens the reader directly for the Friday Al-Kahf card.
  Read: NavigatorScreenParams<ReadStackParamList> | undefined;
  // Only for accounts whose Insights aren't in Activity (navigation/tabPages).
  Insights: undefined;
};

export type HomeStackParamList = {
  Dashboard: undefined;
  // aheadDay: open with that later revision day's pages after today's (Home's "starts at" line).
  // round: that day repeats today's pages (the cycle has come round, AHEAD-3): it opens alone, a new round.
  ActiveRevision: { aheadDay?: string; round?: boolean } | undefined;
  // section: scroll to that section (Revo's openScreen, REVO-31).
  /** `page`: one of Settings' pages (SET-1); `section`: a Settings section (Revo's openScreen), opened as its page. */
  Settings: { section?: RevoSettingsSection; page?: SettingsPage } | undefined;
  // edit: open with the pages ready to edit (Home's Memorized line). focusPages: open at those pages
  // (Activity's Memorized → Edit): their surah open and scrolled to, the pages ringed.
  Memorization: { edit?: boolean; focusPages?: number[] } | undefined;
  /** A beginner's surahs to tick (BEGIN-5, Revisely Dev), from their Home. */
  YourSurahs: undefined;
  /** Learn a surah on the beginner path (BEGIN-7, Revisely Dev), from a beginner's Home. */
  LearnSurah: { sura: number };
  // editedDay is set by PlanDayEdit when navigating back, so PlanEdit can
  // merge the day-level edit into its in-memory days[] without round-tripping
  // through a context or store.
  /** `draft`: a schedule Revo drafted (REVO-43), shown filled in and not saved. */
  PlanEdit: { editedDay?: { index: number; pages: number[] }; draft?: ScheduleDraft } | undefined;
  /** `basePages`: the day as saved, when `initialPages` already adds to it ("Add to plan"); `note`: one line under the title. */
  PlanDayEdit: { dayIndex: number; initialPages: number[]; basePages?: number[]; note?: string };
  // Revision sessions, timed sessions and the daily log, day by day.
  Activity: undefined;
  // The one Activity tab's full calendar (ACT-35, Revisely Dev); calendarAt: a section's page opening it at a month, a gap
  // marked (ACT-23, ACT-28).
  ActivityMonth: { calendarAt?: { month: string; gap?: { from: string; to: string; cue: string } } } | undefined;
  // One section of the one Activity tab on a page of its own (ACT-35, Revisely Dev).
  ActivitySection: { section: InsightsSection };
  /** The Ramadan row's own page (THEME-6). */
  ActivityRamadan: undefined;
  // date is a revision day, YYYY-MM-DD.
  /** focusRecordingId: scroll to that recording and highlight it. focusBlock: scroll to that block
   *  (a row of Overview's picked day, ACT-18). */
  ActivityDay: { date: string; focusRecordingId?: string; focusBlock?: 'revised' | 'memorized' | 'read' | 'notes' | 'recited'; addNote?: boolean };
  // The reader over Activity (a page of a day's strip, a weak spot): back returns to where it was
  // opened (ACT-20), unlike the Read tab's reader.
  // `highlight`: ayahs highlighted until the page is turned (Insights' Recitation rows, RINS-2), as the Read tab's.
  // `showTake`: a past recitation take (Recite's memory, Revisely Dev) shown on its page with its marks.
  QuranReader: { pageNumber: number; highlight?: { sura: number; ayah: number; last?: { sura: number; ayah: number } }; showTake?: string };
  // A recording played over the pages it was recorded on, from fromMs (ms
  // into it; default the start).
  ListenBack: { recordingId: string; fromMs?: number };
  // Everything done, searchable (new design's "See all"); kind preselects a filter.
  ActivityAll: { kind?: ActivityKind | 'recitation' } | undefined;
  // Every revised page by strength (the Insights tab's Browse), from Activity's Weak spots.
  PagesByStrength: undefined;
  // When each surah, juz, hizb or page was last revised (ACT-30), from Insights' Gaps.
  LastRevised: { sort?: 'recent' | 'waiting' | 'mushaf' } | undefined;
  // Settings → Prayer (testers).
  PrayerCalculation: undefined;
  PrayerNotifications: undefined;
  /** The athan voice for every prayer, or (prayer) for one. Revisely Dev, iPhone. */
  AthanVoice: { prayer?: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' } | undefined;
  /** Settings → Testing → On-device model: Recite's model timed on this phone (Revisely Dev, ONDEV-1). */
  OnDeviceBench: undefined;
  /** Revisely Dev: the onboarding screens, saving nothing (ONBOARD-5). */
  OnboardingPreview: undefined;
};

export type ReadStackParamList = {
  ReadIndex: undefined;
  /** Settings over the reader (Test me's "Test settings", RECITE-8): Back comes back to the reader. */
  Settings: HomeStackParamList['Settings'];
  /** `highlight`: a verse found by search, highlighted on its page until the page is turned; with
   *  `last`, the verses from it to `last` (a match that runs on into the next ayah). `recite`: a voice
   *  search's one result (Revisely Dev's live check): a take starts there as the reader opens. */
  QuranReader: {
    pageNumber: number;
    source?: 'index' | 'recent' | 'search';
    highlight?: { sura: number; ayah: number; last?: { sura: number; ayah: number } };
    /** A past recitation take (Recite's memory, Revisely Dev) shown on its page with its marks. */
    showTake?: string;
  };
  /** Search the Qur'an (testers); `listen`: start listening at once (the Read tab's mic). */
  QuranSearch: { listen?: boolean } | undefined;
};

// The tabs are one pager: a sideways swipe on a tab's main screen moves to the
// tab beside it, the incoming tab visible as it slides (navigation/PagerTabs).
const Tab = createPagerTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ReadStack = createNativeStackNavigator<ReadStackParamList>();

// E2E builds log each stack screen's focus and transitions (lib/e2e/screens); every other build
// drops this (the bundler inlines the variable).
const e2eScreenListeners =
  process.env.EXPO_PUBLIC_E2E === '1'
    ? (require('../lib/e2e/screens') as typeof import('../lib/e2e/screens')).screenListeners
    : undefined;

type ListenerArgs = Parameters<typeof revealListeners>[0] & { route: { key: string; name: string } };
type TransitionEvent = { data?: { closing?: boolean } };

/**
 * Every stack's screen listeners: a back swipe revealing the screen beneath (navigation/tabReveal, TAB-3), and in E2E
 * builds each screen's focus and transitions.
 */
function stackListeners(args: ListenerArgs) {
  const reveal = revealListeners(args);
  if (!e2eScreenListeners) return reveal;
  const e2e = e2eScreenListeners(args);
  return {
    ...e2e,
    transitionStart: (e: TransitionEvent) => {
      e2e.transitionStart(e);
      reveal.transitionStart(e);
    },
    transitionEnd: (e: TransitionEvent) => {
      e2e.transitionEnd(e);
      reveal.transitionEnd(e);
    },
    gestureCancel: reveal.gestureCancel,
  };
}

// Routes (within any tab's stack) where the tab bar is hidden. These screens
// are full screen or render their own bottom-edge chrome.
const HIDE_TAB_BAR_ON = new Set([
  'PlanEdit',
  'PlanDayEdit',
  'ActiveRevision',
  'Memorization', // i18n-ignore (route names)
  'YourSurahs', // i18n-ignore (route names)
  'LearnSurah', // i18n-ignore (route names)
  'QuranReader',
  'QuranSearch',
  'ListenBack',
  'OnboardingPreview', // i18n-ignore (route names)
]);

const STACK_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
  animation: 'slide_from_right',
} as const;

/** What Home and Activity open, in either tab's stack: each tab pushes them over its own first screen. */
function sharedScreens() {
  return (
    <>
      <HomeStack.Screen name="ActiveRevision" component={ActiveRevisionScreen} />
      <HomeStack.Screen name="Settings" component={SettingsScreen} />
      <HomeStack.Screen name="Memorization" component={MemorizationScreen} />
      <HomeStack.Screen name="YourSurahs" component={YourSurahsScreen} />
      <HomeStack.Screen name="LearnSurah" component={LearnSurahScreen} />
      <HomeStack.Screen name="PlanEdit" component={PlanEditScreen} />
      <HomeStack.Screen name="PlanDayEdit" component={PlanDayEditScreen} />
      <HomeStack.Screen name="PrayerCalculation" component={PrayerCalculationScreen} />
      <HomeStack.Screen name="PrayerNotifications" component={PrayerNotificationsScreen} />
      <HomeStack.Screen name="AthanVoice" component={AthanVoiceScreen} />
      <HomeStack.Screen name="OnDeviceBench" component={OnDeviceBenchScreen} />
      <HomeStack.Screen name="OnboardingPreview" component={OnboardingPreviewScreen} options={{ animation: 'slide_from_bottom' }} />
      <HomeStack.Screen name="ActivityDay" component={ActivityDayScreen} />
      <HomeStack.Screen name="ListenBack" component={ListenBackScreen} />
      <HomeStack.Screen name="ActivityAll" component={ActivityAllScreen} />
      <HomeStack.Screen name="PagesByStrength" component={PagesByStrengthScreen} />
      <HomeStack.Screen name="LastRevised" component={LastRevisedScreen} />
      <HomeStack.Screen name="ActivitySection" component={ActivitySectionScreen} />
      <HomeStack.Screen name="ActivityMonth" component={ActivityMonthScreen} />
      <HomeStack.Screen name="ActivityRamadan" component={ActivityRamadanScreen} />
      <HomeStack.Screen name="QuranReader" component={QuranReaderScreen} />
    </>
  );
}

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenListeners={stackListeners} screenLayout={revealScreenLayout} screenOptions={STACK_OPTIONS}>
      <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
      {sharedScreens()}
    </HomeStack.Navigator>
  );
}

/**
 * Activity's tab (TAB-2; Majd, Nov 23 2026: "let's make that official"): Activity at the bottom, and what it opens (a
 * day, See all, the reader, the daily log, Settings) pushed in this tab, so Back comes back to it. Activity is a screen
 * of this tab only: everything that opens it (Settings, Revo, a day's link) goes to the tab.
 */
function ActivityStackNavigator() {
  return (
    <HomeStack.Navigator screenListeners={stackListeners} screenLayout={revealScreenLayout} screenOptions={STACK_OPTIONS}>
      <HomeStack.Screen name="Activity" component={ActivityScreen} />
      {sharedScreens()}
    </HomeStack.Navigator>
  );
}

function ReadStackNavigator() {
  return (
    <ReadStack.Navigator
      screenListeners={stackListeners}
      screenLayout={revealScreenLayout}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
      }}
    >
      <ReadStack.Screen name="ReadIndex" component={ReadIndexScreen} />
      <ReadStack.Screen name="QuranReader" component={QuranReaderScreen} />
      <ReadStack.Screen name="QuranSearch" component={QuranSearchScreen} />
      <ReadStack.Screen name="Settings" component={SettingsScreen} />
    </ReadStack.Navigator>
  );
}

/**
 * The mini player above the tab bar, while a recitation goes on somewhere the
 * user isn't looking; › opens the reader at the verse.
 */
function MiniPlayerAboveTabs({ navigation, revealing }: { navigation: PagerTabBarProps['navigation']; revealing: boolean }) {
  const bottom = useTabBarHeight() + MINI_PLAYER_GAP;
  return (
    <MiniPlayer
      bottom={bottom}
      revealing={revealing}
      onOpen={(verse) => openReaderAt(navigation, verse)}
    />
  );
}

const showsTabBar = (name: string) => !HIDE_TAB_BAR_ON.has(name);

/** A tab's front screen, as navigation's state has it (its stack's top; the screen it opens on before it has a state). */
function tabFront(tabRoute: PagerTabBarProps['state']['routes'][number]): Front | null {
  const name = getFocusedRouteNameFromRoute(tabRoute);
  if (!name) return null;
  const stack = tabRoute.state;
  const top = stack ? stack.routes[stack.index ?? stack.routes.length - 1] : undefined;
  return { name, key: (top && top.name === name ? top.key : undefined) ?? '' };
}

/**
 * The tab bar and the mini player above it. Hidden on full-screen "deep" screens: they own the bottom edge (Done
 * buttons, save bars) and would otherwise collide with the bar, and the reader and the session show the recitation in
 * their own player bar. Back on the screen beneath from the first moment it shows: as a back swipe starts, fading in with
 * that screen as the swipe reveals it, before navigation's state has caught up (navigation/tabReveal, TAB-3).
 */
function TabBarArea({
  bar,
  showInsightsTab,
  onInsightsTabPress,
}: {
  bar: PagerTabBarProps;
  showInsightsTab: boolean;
  onInsightsTabPress?: () => void;
}) {
  const reveal = useReveal();
  const stack = tabFront(bar.state.routes[bar.state.index]);
  const at = front(stack, reveal);
  if (at && !showsTabBar(at.name)) return null;
  const fading = fade(stack, reveal, showsTabBar);
  return (
    <Animated.View
      pointerEvents={fading ? 'none' : 'box-none'}
      style={[StyleSheet.absoluteFill, fading ? { opacity: fading } : null]}
      testID="tab-bar-area"
    >
      <MiniPlayerAboveTabs navigation={bar.navigation} revealing={at !== stack} />
      <TabBar {...bar} showInsightsTab={showInsightsTab} onInsightsTabPress={onInsightsTabPress} />
    </Animated.View>
  );
}

export function MainNavigator() {
  const { user } = useApp();
  // The recitation checker, woken as the app comes to the front, so a take begun soon after doesn't meet a cold start.
  useWarmCheckerOnFront(!reciteCheckOff() && reciteLiveForAccount(user));
  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;
  const hasSeenPreview = user?.hasSeenSmartTrackingPreview ?? false;
  // Accounts on the new Activity have Insights there: the tab bar is Home and Read (ACT-12).
  const insightsInActivity = activityBlocksEnabled(user);

  const { shown: showInsightsTab, opensPreview: glowInsightsTab } = insightsTab(
    smartTrackingEnabled,
    hasSeenPreview,
    insightsInActivity,
  );

  const [previewOpen, setPreviewOpen] = useState(false);
  const openPreview = useCallback(() => setPreviewOpen(true), []);
  useAppUsageTracking();
  // Signing out leaves the app's screens: the recitation stops with them.
  useEffect(() => () => getRecitation().stop(), []);

  return (
    <ReadingTimerProvider>
      <View style={{ flex: 1 }}>
        <Tab.Navigator
          tabBar={(props) => (
            <TabBarArea bar={props} showInsightsTab={showInsightsTab} onInsightsTabPress={glowInsightsTab ? openPreview : undefined} />
          )}
          swipeableCount={swipeableTabCount(smartTrackingEnabled, insightsInActivity)}
          // Before Smart Tracking is set up, Insights is in the bar but not a
          // page: a swipe past Read opens its preview, as a tap on it does.
          onSwipePastEnd={glowInsightsTab ? openPreview : undefined}
        >
          <Tab.Screen name="Home" component={HomeStackNavigator} />
          <Tab.Screen name="ActivityTab" component={ActivityStackNavigator} />
          <Tab.Screen name="Read" component={ReadStackNavigator} />
          {mainTabRoutes(insightsInActivity).includes('Insights') ? (
            <Tab.Screen name="Insights" component={AlgorithmScreen} />
          ) : null}
        </Tab.Navigator>
      </View>
      <SmartTrackingPreviewScreen
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
      {/* Revo (previewTester accounts): its button over the main screens, and its sheet. */}
      <RevoHost />
      {/* Settings → Report a problem: its form, and the bar that captures a screen for it. */}
      <ReportProblemHost />
    </ReadingTimerProvider>
  );
}
