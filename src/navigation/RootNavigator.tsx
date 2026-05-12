import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainNavigator } from './MainNavigator';
import AuthScreen from '../screens/auth/AuthScreen';
import { OfflineBanner } from '../components/OfflineBanner';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export function RootNavigator() {
  const { loading, onboardingComplete } = useApp();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { theme, isDark } = useTheme();

  // App-wide gradient gives glass surfaces something to refract. Nav theme bg
  // is transparent so the gradient shows through every screen.
  const gradientColors: readonly [string, string, string] = isDark
    ? ['#0F1410', '#1F4538', '#0F1410']
    : ['#FBF8F3', '#C6DDD3', '#FBF8F3'];

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
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
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
    <View style={styles.root}>
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <NavigationContainer theme={navigationTheme}>
        <View style={{ flex: 1 }}>
          <OfflineBanner />
          {content}
        </View>
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
