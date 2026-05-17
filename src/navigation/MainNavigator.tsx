import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/main/DashboardScreen';
import AlgorithmScreen from '../screens/main/AlgorithmScreen';
import ProgressScreen from '../screens/main/ProgressScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import EditJuzScreen from '../screens/main/EditJuzScreen';
import PlanEditScreen from '../screens/main/PlanEditScreen';
import ActiveRevisionScreen from '../screens/revision/ActiveRevisionScreen';
import { LiquidGlassTabBar } from '../components/LiquidGlassTabBar';
import { SmartTrackingPreviewScreen } from '../screens/preview/SmartTrackingPreviewScreen';
import { useApp } from '../context/AppContext';

export type MainTabParamList = {
  Home: undefined;
  Insights: undefined;
  Progress: undefined;
};

export type HomeStackParamList = {
  Dashboard: undefined;
  ActiveRevision: undefined;
  Settings: undefined;
  EditJuz: undefined;
  PlanEdit: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();

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
      <HomeStack.Screen name="EditJuz" component={EditJuzScreen} />
      <HomeStack.Screen name="PlanEdit" component={PlanEditScreen} />
    </HomeStack.Navigator>
  );
}

export function MainNavigator() {
  const { user } = useApp();
  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;
  const hasSeenPreview = user?.hasSeenSmartTrackingPreview ?? false;

  // Insights tab is visible when Smart Tracking is on, OR when the user
  // hasn't yet been given the chance to preview it (glowing discovery state).
  // It's hidden only when the user has actively dismissed the preview.
  const showInsightsTab = smartTrackingEnabled || !hasSeenPreview;
  // Glow draws attention to the tab as a one-time discovery hook for users
  // who haven't enabled Smart Tracking yet.
  const glowInsightsTab = !smartTrackingEnabled && !hasSeenPreview;

  // Tapping the glowing Insights tab intercepts navigation and opens the
  // sandbox preview tour instead of the real Insights screen.
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <Tab.Navigator
        tabBar={(props) => (
          <LiquidGlassTabBar
            {...props}
            showInsightsTab={showInsightsTab}
            glowInsightsTab={glowInsightsTab}
            onInsightsTabPress={
              glowInsightsTab ? () => setPreviewOpen(true) : undefined
            }
          />
        )}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Home" component={HomeStackNavigator} />
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
