import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

/**
 * Persistent thin banner shown at the top when the device loses connectivity.
 * Hidden when online. Renders nothing (zero footprint) when not needed.
 */
export function OfflineBanner() {
  const { theme } = useTheme();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      // isInternetReachable is null briefly on startup — treat null as online
      // (avoids flashing the banner before NetInfo has settled).
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return unsub;
  }, []);

  if (!isOffline) return null;

  return (
    <View style={[styles.banner, { backgroundColor: theme.warningBg }]}>
      <Text style={[typography.bodySmall, { color: theme.warningText, fontWeight: '600' }]}>
        You're offline. Changes will sync when you're back online.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? spacing.xs + 4 : spacing.xs,
  },
});
