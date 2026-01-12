import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainNavigator } from './MainNavigator';
import AuthScreen from '../screens/auth/AuthScreen';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export function RootNavigator() {
  const { loading, onboardingComplete } = useApp();
  const { isAuthenticated, isLoading: authLoading, isOfflineMode } = useAuth();
  const { theme, isDark } = useTheme();

  // Debug logging
  console.log('[RootNavigator] Render - loading:', loading, 'authLoading:', authLoading, 'onboardingComplete:', onboardingComplete, 'isAuthenticated:', isAuthenticated, 'isOfflineMode:', isOfflineMode);

  // Create custom navigation theme based on app theme
  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.bg,
      card: theme.bgAlt,
      text: theme.textPrimary,
      border: theme.border,
      primary: theme.accent,
    },
  };

  // Show loading while checking auth and app state
  if (loading || authLoading) {
    console.log('[RootNavigator] SHOWING LOADING SCREEN - this will reset navigation!');
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  // If not authenticated and not in offline mode, show auth screen
  if (!isAuthenticated && !isOfflineMode) {
    return (
      <NavigationContainer theme={navigationTheme}>
        <AuthScreen />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {onboardingComplete ? <MainNavigator /> : <OnboardingNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
