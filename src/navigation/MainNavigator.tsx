import React, { useState } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute, NavigatorScreenParams } from '@react-navigation/native';
import DashboardScreen from '../screens/main/DashboardScreen';
import AlgorithmScreen from '../screens/main/AlgorithmScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import MemorizationScreen from '../screens/main/MemorizationScreen';
import PlanEditScreen from '../screens/main/PlanEditScreen';
import PlanDayEditScreen from '../screens/main/PlanDayEditScreen';
import ActiveRevisionScreen from '../screens/revision/ActiveRevisionScreen';
import ReadIndexScreen from '../screens/read/ReadIndexScreen';
import QuranReaderScreen from '../screens/read/QuranReaderScreen';
import JournalEntryScreen from '../screens/journal/JournalEntryScreen';
import ActivityScreen from '../screens/activity/ActivityScreen';
import ActivityDayScreen from '../screens/activity/ActivityDayScreen';
import { ReadingTimerProvider } from '../context/ReadingTimerContext';
import { FloatingTimer } from '../components/timer/FloatingTimer';
import { FloatingTimerProvider } from '../components/timer/floatingTimerOffset';
import { useAppUsageTracking } from '../lib/appUsage';
import { LiquidGlassTabBar } from '../components/LiquidGlassTabBar';
import { SmartTrackingPreviewScreen } from '../screens/preview/SmartTrackingPreviewScreen';
import { useApp } from '../context/AppContext';

export type MainTabParamList = {
  // Non-screen code (the timer) opens a day of Activity on the Home stack.
  Home: NavigatorScreenParams<HomeStackParamList> | undefined;
  // Home opens the reader directly for the Friday Al-Kahf card.
  Read: NavigatorScreenParams<ReadStackParamList> | undefined;
  Insights: undefined;
};

export type HomeStackParamList = {
  Dashboard: undefined;
  ActiveRevision: undefined;
  Settings: undefined;
  Memorization: undefined;
  // editedDay is set by PlanDayEdit when navigating back, so PlanEdit can
  // merge the day-level edit into its in-memory days[] without round-tripping
  // through a context or store.
  PlanEdit: { editedDay?: { index: number; pages: number[] } } | undefined;
  PlanDayEdit: { dayIndex: number; initialPages: number[] };
  // Revision sessions, timed sessions and the daily log, day by day.
  Activity: undefined;
  // date is a revision day, YYYY-MM-DD.
  /** focusRecordingId: scroll to that recording and highlight it. */
  ActivityDay: { date: string; focusRecordingId?: string };
  // Daily-log editor. date is YYYY-MM-DD; omitted means "today" (fajr-aware
  // revision day).
  JournalEntry: { date?: string } | undefined;
};

export type ReadStackParamList = {
  ReadIndex: undefined;
  QuranReader: { pageNumber: number; source?: 'index' | 'recent' };
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ReadStack = createNativeStackNavigator<ReadStackParamList>();

// Routes (within any tab's stack) where the floating glass tab bar should be
// suppressed. These screens render their own bottom-edge chrome.
const HIDE_TAB_BAR_ON = new Set([
  'PlanEdit',
  'PlanDayEdit',
  'ActiveRevision',
  'QuranReader',
  'JournalEntry',
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
      <HomeStack.Screen name="Activity" component={ActivityScreen} />
      <HomeStack.Screen name="ActivityDay" component={ActivityDayScreen} />
      <HomeStack.Screen name="JournalEntry" component={JournalEntryScreen} />
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
    </ReadStack.Navigator>
  );
}

export function MainNavigator() {
  const { user } = useApp();
  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;
  const hasSeenPreview = user?.hasSeenSmartTrackingPreview ?? false;

  const showInsightsTab = smartTrackingEnabled || !hasSeenPreview;
  const glowInsightsTab = !smartTrackingEnabled && !hasSeenPreview;

  const [previewOpen, setPreviewOpen] = useState(false);
  useAppUsageTracking();

  return (
    <ReadingTimerProvider>
      <FloatingTimerProvider>
        <View style={{ flex: 1 }}>
          <Tab.Navigator
            tabBar={(props) => {
              // Hide the tab bar on full-screen "deep" screens — they own the
              // bottom edge (Done buttons, save bars, FABs) and would otherwise
              // collide with the floating glass bar.
              const tabRoute = props.state.routes[props.state.index];
              const focused = getFocusedRouteNameFromRoute(tabRoute);
              if (focused && HIDE_TAB_BAR_ON.has(focused)) return null;
              return (
                <LiquidGlassTabBar
                  {...props}
                  showInsightsTab={showInsightsTab}
                  glowInsightsTab={glowInsightsTab}
                  onInsightsTabPress={
                    glowInsightsTab ? () => setPreviewOpen(true) : undefined
                  }
                />
              );
            }}
            screenOptions={{ headerShown: false }}
          >
            <Tab.Screen name="Home" component={HomeStackNavigator} />
            <Tab.Screen name="Read" component={ReadStackNavigator} />
            <Tab.Screen name="Insights" component={AlgorithmScreen} />
          </Tab.Navigator>
          {/* The one timer entry point, over every tab (same state everywhere). */}
          <FloatingTimer />
        </View>
      </FloatingTimerProvider>
      <SmartTrackingPreviewScreen
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </ReadingTimerProvider>
  );
}
