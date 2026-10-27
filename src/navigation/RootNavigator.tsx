import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useDesign } from '../design/DesignContext';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainNavigator } from './MainNavigator';
import { navigationRef } from './navigationRef';
import AuthScreen from '../screens/auth/AuthScreen';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export function RootNavigator() {
  const { loading, onboardingComplete } = useApp();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { theme, isDark, palette } = useTheme();
  const { isNew } = useDesign();

  // Classic only: an app-wide gradient gives glass surfaces something to
  // refract (these colours go with the classic design). Nav theme bg is
  // transparent so the gradient, or the new design's flat ground, shows
  // through every screen.
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
      <View
        style={[styles.loadingContainer, { backgroundColor: isNew ? palette.bg : theme.bg }]}
        testID="root-loading"
      >
        {/* The new design: a plain grey spinner on the ground, no accent. */}
        <ActivityIndicator size="large" color={isNew ? palette.secondary : theme.accent} />
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
    // The new design: a flat white or black ground, no gradient.
    <View style={[styles.root, isNew && { backgroundColor: palette.bg }]}>
      {!isNew && (
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
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
