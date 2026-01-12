import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/main/DashboardScreen';
import AlgorithmScreen from '../screens/main/AlgorithmScreen';
import ProgressScreen from '../screens/main/ProgressScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import ActiveRevisionScreen from '../screens/revision/ActiveRevisionScreen';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';

export type MainTabParamList = {
  Home: undefined;
  Algorithm: undefined;
  Progress: undefined;
  Settings: undefined;
};

export type HomeStackParamList = {
  Dashboard: undefined;
  ActiveRevision: undefined;
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function HomeStackNavigator() {
  const { theme } = useTheme();
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
      <HomeStack.Screen name="ActiveRevision" component={ActiveRevisionScreen} />
    </HomeStack.Navigator>
  );
}

function SettingsStackNavigator() {
  const { theme } = useTheme();
  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} />
    </SettingsStack.Navigator>
  );
}

// Simple text-based tab icon
function TabIcon({ label, focused, theme }: { label: string; focused: boolean; theme: any }) {
  const getIcon = () => {
    switch (label) {
      case 'HOME':
        return '⌂'; // House
      case 'ALGORITHM':
        return '◈'; // Diamond with center dot - represents algorithm/logic
      case 'PROGRESS':
        return '◎'; // Bullseye
      case 'SETTINGS':
        return '☰'; // Menu lines - cleaner than gear
      default:
        return '•';
    }
  };

  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, { color: focused ? theme.textPrimary : theme.textMuted }]}>
        {getIcon()}
      </Text>
    </View>
  );
}

export function MainNavigator() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.bgAlt,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          height: 70,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          ...typography.label,
          fontSize: 10,
        },
        tabBarActiveTintColor: theme.textPrimary,
        tabBarInactiveTintColor: theme.textMuted,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          tabBarLabel: 'HOME',
          tabBarIcon: ({ focused }) => <TabIcon label="HOME" focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="Algorithm"
        component={AlgorithmScreen}
        options={{
          tabBarLabel: 'INSIGHTS',
          tabBarIcon: ({ focused }) => <TabIcon label="ALGORITHM" focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="Progress"
        component={ProgressScreen}
        options={{
          tabBarLabel: 'PROGRESS',
          tabBarIcon: ({ focused }) => <TabIcon label="PROGRESS" focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStackNavigator}
        options={{
          tabBarLabel: 'SETTINGS',
          tabBarIcon: ({ focused }) => <TabIcon label="SETTINGS" focused={focused} theme={theme} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 20,
  },
});
