import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import DashboardScreen from '../screens/main/DashboardScreen';
import AlgorithmScreen from '../screens/main/AlgorithmScreen';
import ProgressScreen from '../screens/main/ProgressScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import MemorizationScreen from '../screens/main/MemorizationScreen';
import PlanEditScreen from '../screens/main/PlanEditScreen';
import PlanDayEditScreen from '../screens/main/PlanDayEditScreen';
import ActiveRevisionScreen from '../screens/revision/ActiveRevisionScreen';
import ReadIndexScreen from '../screens/read/ReadIndexScreen';
import QuranReaderScreen from '../screens/read/QuranReaderScreen';
import { LiquidGlassTabBar } from '../components/LiquidGlassTabBar';
import { SmartTrackingPreviewScreen } from '../screens/preview/SmartTrackingPreviewScreen';
import { useApp } from '../context/AppContext';

export type MainTabParamList = {
  Home: undefined;
  Read: undefined;
  Insights: undefined;
  Progress: undefined;
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

  return (
    <>
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
        <Tab.Screen name="Progress" component={ProgressScreen} />
      </Tab.Navigator>
      <SmartTrackingPreviewScreen
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
