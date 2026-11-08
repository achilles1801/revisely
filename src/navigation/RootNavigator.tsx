import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainNavigator } from './MainNavigator';
import { navigationRef } from './navigationRef';
import AuthScreen from '../screens/auth/AuthScreen';
import { ConnectToSetUp } from '../components/offline/ConnectToSetUp';
import { WhatsNewScreen } from '../components/whatsNew/WhatsNewScreen';
import { useWhatsNewDue } from '../components/whatsNew/useWhatsNewDue';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export function RootNavigator() {
  const { loading, onboardingComplete, connectionNeeded } = useApp();
  const { isAuthenticated, isLoading: authLoading, provisionalUid } = useAuth();
  // While Auth checks a saved sign-in on a slow connection, the app opens
  // with that account's copy on the phone (AppProvider).
  const signedIn = isAuthenticated || !!provisionalUid;
  const { theme, isDark, palette } = useTheme();
  // "What's new" opens before Home for an account set up before the release (NEW-1, NEW-4).
  const whatsNew = useWhatsNewDue();

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

  if (connectionNeeded) return <ConnectToSetUp />;

  if (loading || (authLoading && !provisionalUid)) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: palette.bg }]} testID="root-loading">
        {/* A plain grey spinner on the ground, no accent. */}
        <ActivityIndicator size="large" color={palette.secondary} />
      </View>
    );
  }

  const content = !signedIn ? (
    <AuthScreen />
  ) : onboardingComplete ? (
    whatsNew === 'wait' ? (
      // A moment while the phone's copy is read (the card to resume on, the switch).
      <View style={{ flex: 1, backgroundColor: palette.bg }} testID="whats-new-wait" />
    ) : whatsNew ? (
      <WhatsNewScreen mode={whatsNew} />
    ) : (
      <MainNavigator />
    )
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
