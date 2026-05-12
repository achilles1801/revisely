import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../components/GlassCard';
import DashboardScreen from '../screens/main/DashboardScreen';
import AlgorithmScreen from '../screens/main/AlgorithmScreen';
import ProgressScreen from '../screens/main/ProgressScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import EditJuzScreen from '../screens/main/EditJuzScreen';
import ActiveRevisionScreen from '../screens/revision/ActiveRevisionScreen';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

export type MainTabParamList = {
  Home: undefined;
  Algorithm: undefined;
  Progress: undefined;
};

export type HomeStackParamList = {
  Dashboard: undefined;
  ActiveRevision: undefined;
  Settings: undefined;
  EditJuz: undefined;
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
    </HomeStack.Navigator>
  );
}

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<keyof MainTabParamList, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Algorithm: { active: 'analytics', inactive: 'analytics-outline' },
  Progress: { active: 'bookmarks', inactive: 'bookmarks-outline' },
};

export function MainNavigator() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarBackground: () => (
          <GlassCard style={StyleSheet.absoluteFillObject} />
        ),
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.border,
          height: 76,
          paddingBottom: spacing.sm,
          paddingTop: spacing.xs,
          elevation: 0,
        },
        tabBarLabelStyle: {
          ...typography.label,
          fontSize: 10,
          letterSpacing: 0.8,
          marginTop: 2,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name as keyof MainTabParamList];
          return (
            <Ionicons
              name={focused ? icons.active : icons.inactive}
              size={22}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Algorithm" component={AlgorithmScreen} options={{ tabBarLabel: 'Insights' }} />
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ tabBarLabel: 'Progress' }} />
    </Tab.Navigator>
  );
}
