import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainNavigator } from './MainNavigator';
import { navigationRef } from './navigationRef';
import AuthScreen from '../screens/auth/AuthScreen';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export function RootNavigator() {
  const { loading, onboardingComplete } = useApp();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { theme, isDark, palette } = useTheme();

  // Nav theme bg is transparent so the flat ground shows through every screen.
  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: 'transparent',
      card: 'transparent',
      text: theme.textPrimary,
      border: theme.border,
      primary: theme.accent,
    },
  };

  if (loading || authLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: palette.bg }]} testID="root-loading">
        {/* A plain grey spinner on the ground, no accent. */}
        <ActivityIndicator size="large" color={palette.secondary} />
      </View>
    );
  }

  const content = !isAuthenticated ? (
    <AuthScreen />
  ) : onboardingComplete ? (
    <MainNavigator />
  ) : (
    <OnboardingNavigator />
  );

  return (
    // A flat white or black ground.
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
        <View style={{ flex: 1 }}>{content}</View>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
