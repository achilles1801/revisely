import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute, NavigatorScreenParams } from '@react-navigation/native';
import DashboardScreen from '../screens/main/DashboardScreen';
import AlgorithmScreen from '../screens/main/AlgorithmScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import MemorizationScreen from '../screens/main/MemorizationScreen';
import PlanEditScreen from '../screens/main/PlanEditScreen';
import PlanDayEditScreen from '../screens/main/PlanDayEditScreen';
import PrayerCalculationScreen from '../screens/prayer/PrayerCalculationScreen';
import PrayerNotificationsScreen from '../screens/prayer/PrayerNotificationsScreen';
import ActiveRevisionScreen from '../screens/revision/ActiveRevisionScreen';
import ReadIndexScreen from '../screens/read/ReadIndexScreen';
import QuranReaderScreen from '../screens/read/QuranReaderScreen';
import QuranSearchScreen from '../screens/read/QuranSearchScreen';
import { RevoHost } from '../components/revo/RevoHost';
import ListenBackScreen from '../screens/activity/ListenBackScreen';
import JournalEntryScreen from '../screens/journal/JournalEntryScreen';
import ActivityScreen from '../screens/activity/ActivityScreen';
import ActivityDayScreen from '../screens/activity/ActivityDayScreen';
import ActivityAllScreen from '../screens/activity/ActivityAllScreen';
import PagesByStrengthScreen from '../screens/activity/PagesByStrengthScreen';
import { activityBlocksEnabled } from '../components/activity/DayBlocks';
import type { ActivityKind } from '../lib/activityItems';
import { ReadingTimerProvider } from '../context/ReadingTimerContext';
import { useAppUsageTracking } from '../lib/appUsage';
import { TabBar, useTabBarHeight } from './TabBar';
import type { PagerTabBarProps } from './PagerTabs';
import { MiniPlayer, MINI_PLAYER_GAP } from '../components/player/MiniPlayer';
import { getRecitation } from '../lib/recitation';
import { openReaderAt } from './openReader';
import { createPagerTabNavigator } from './PagerTabs';
import { insightsTab, mainTabRoutes, swipeableTabCount } from './tabPages';
import { SmartTrackingPreviewScreen } from '../screens/preview/SmartTrackingPreviewScreen';
import { useApp } from '../context/AppContext';
import type { JournalKind } from '../types';
import type { RevoSettingsSection } from '../lib/revo/types';

export type MainTabParamList = {
  // Non-screen code (the timer) opens a day of Activity on the Home stack.
  Home: NavigatorScreenParams<HomeStackParamList> | undefined;
  // Home opens the reader directly for the Friday Al-Kahf card.
  Read: NavigatorScreenParams<ReadStackParamList> | undefined;
  // Only for accounts whose Insights aren't in Activity (navigation/tabPages).
  Insights: undefined;
};

export type HomeStackParamList = {
  Dashboard: undefined;
  // aheadDay: open with that later revision day's pages after today's (Home's "starts at" line).
  ActiveRevision: { aheadDay?: string } | undefined;
  // section: scroll to that section (Revo's openScreen, REVO-31).
  Settings: { section?: RevoSettingsSection } | undefined;
  // edit: open with the pages ready to edit (Home's Memorized line). focusPages: open at those pages
  // (Activity's Memorized → Edit): their surah open and scrolled to, the pages ringed.
  Memorization: { edit?: boolean; focusPages?: number[] } | undefined;
  // editedDay is set by PlanDayEdit when navigating back, so PlanEdit can
  // merge the day-level edit into its in-memory days[] without round-tripping
  // through a context or store.
  PlanEdit: { editedDay?: { index: number; pages: number[] } } | undefined;
  /** `basePages`: the day as saved, when `initialPages` already adds to it ("Add to plan"); `note`: one line under the title. */
  PlanDayEdit: { dayIndex: number; initialPages: number[]; basePages?: number[]; note?: string };
  // Revision sessions, timed sessions and the daily log, day by day.
  Activity: undefined;
  // date is a revision day, YYYY-MM-DD.
  /** focusRecordingId: scroll to that recording and highlight it. focusBlock: scroll to that block
   *  (a row of Overview's picked day, ACT-18). */
  ActivityDay: { date: string; focusRecordingId?: string; focusBlock?: 'revised' | 'memorized' | 'read' | 'notes' };
  // The reader over Activity (a page of a day's strip, a weak spot): back returns to where it was
  // opened (ACT-20), unlike the Read tab's reader.
  QuranReader: { pageNumber: number };
  // A recording played over the pages it was recorded on, from fromMs (ms
  // into it; default the start).
  ListenBack: { recordingId: string; fromMs?: number };
  // Everything done, searchable (new design's "See all"); kind preselects a filter.
  ActivityAll: { kind?: ActivityKind } | undefined;
  // Every revised page by strength (the Insights tab's Browse), from Activity's Weak spots.
  PagesByStrength: undefined;
  // Daily-log editor. date is YYYY-MM-DD; omitted means "today" (fajr-aware
  // revision day).
  JournalEntry: { date?: string; kind?: JournalKind } | undefined;
  // Settings → Prayer (testers).
  PrayerCalculation: undefined;
  PrayerNotifications: undefined;
};

export type ReadStackParamList = {
  ReadIndex: undefined;
  /** `highlight`: a verse found by search, highlighted on its page until the page is turned. */
  QuranReader: { pageNumber: number; source?: 'index' | 'recent' | 'search'; highlight?: { sura: number; ayah: number } };
  /** Search the Qur'an (testers); `listen`: start listening at once (the Read tab's mic). */
  QuranSearch: { listen?: boolean } | undefined;
};

// The tabs are one pager: a sideways swipe on a tab's main screen moves to the
// tab beside it, the incoming tab visible as it slides (navigation/PagerTabs).
const Tab = createPagerTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ReadStack = createNativeStackNavigator<ReadStackParamList>();

// Routes (within any tab's stack) where the tab bar is hidden. These screens
// are full screen or render their own bottom-edge chrome.
const HIDE_TAB_BAR_ON = new Set([
  'PlanEdit',
  'PlanDayEdit',
  'ActiveRevision',
  'Memorization',
  'QuranReader',
  'QuranSearch',
  'JournalEntry',
  'ListenBack',
]);

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
      }}
    >
      <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
      <HomeStack.Screen name="ActiveRevision" component={ActiveRevisionScreen} />
      <HomeStack.Screen name="Settings" component={SettingsScreen} />
      <HomeStack.Screen name="Memorization" component={MemorizationScreen} />
      <HomeStack.Screen name="PlanEdit" component={PlanEditScreen} />
      <HomeStack.Screen name="PlanDayEdit" component={PlanDayEditScreen} />
      <HomeStack.Screen name="PrayerCalculation" component={PrayerCalculationScreen} />
      <HomeStack.Screen name="PrayerNotifications" component={PrayerNotificationsScreen} />
      <HomeStack.Screen name="Activity" component={ActivityScreen} />
      <HomeStack.Screen name="ActivityDay" component={ActivityDayScreen} />
      <HomeStack.Screen name="ListenBack" component={ListenBackScreen} />
      <HomeStack.Screen name="ActivityAll" component={ActivityAllScreen} />
      <HomeStack.Screen name="PagesByStrength" component={PagesByStrengthScreen} />
      <HomeStack.Screen name="JournalEntry" component={JournalEntryScreen} />
      <HomeStack.Screen name="QuranReader" component={QuranReaderScreen} />
    </HomeStack.Navigator>
  );
}

function ReadStackNavigator() {
  return (
    <ReadStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
      }}
    >
      <ReadStack.Screen name="ReadIndex" component={ReadIndexScreen} />
      <ReadStack.Screen name="QuranReader" component={QuranReaderScreen} />
      <ReadStack.Screen name="QuranSearch" component={QuranSearchScreen} />
    </ReadStack.Navigator>
  );
}

/**
 * The mini player above the tab bar, while a recitation goes on somewhere the
 * user isn't looking; › opens the reader at the verse.
 */
function MiniPlayerAboveTabs({ navigation }: { navigation: PagerTabBarProps['navigation'] }) {
  const bottom = useTabBarHeight() + MINI_PLAYER_GAP;
  return (
    <MiniPlayer
      bottom={bottom}
      onOpen={(verse) => openReaderAt(navigation, verse)}
    />
  );
}

export function MainNavigator() {
  const { user } = useApp();
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
          tabBar={(props) => {
            // Hide the tab bar on full-screen "deep" screens: they own the
            // bottom edge (Done buttons, save bars) and would otherwise
            // collide with the bar. The mini player goes with it (the reader
            // and the session show the recitation in their own player bar).
            const tabRoute = props.state.routes[props.state.index];
            const focused = getFocusedRouteNameFromRoute(tabRoute);
            if (focused && HIDE_TAB_BAR_ON.has(focused)) return null;
            return (
              <>
                <MiniPlayerAboveTabs navigation={props.navigation} />
                <TabBar
                  {...props}
                  showInsightsTab={showInsightsTab}
                  onInsightsTabPress={glowInsightsTab ? openPreview : undefined}
                />
              </>
            );
          }}
          swipeableCount={swipeableTabCount(smartTrackingEnabled, insightsInActivity)}
          // Before Smart Tracking is set up, Insights is in the bar but not a
          // page: a swipe past Read opens its preview, as a tap on it does.
          onSwipePastEnd={glowInsightsTab ? openPreview : undefined}
        >
          <Tab.Screen name="Home" component={HomeStackNavigator} />
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
    </ReadingTimerProvider>
  );
}
