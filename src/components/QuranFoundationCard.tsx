import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { PressableScale } from './PressableScale';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { useQFAuth } from '../services/quranFoundation/useQFAuth';
import {
  getCurrentStreak,
  isQFConfigured,
  CurrentStreak,
} from '../services/quranFoundation';

/**
 * Settings card for connecting the user's Quran.com account. Drives the
 * hackathon's User API integration: once connected, the app can read the
 * user's QF-side streak and (later) write activity back.
 */
export function QuranFoundationCard() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { connected, inFlight, error, signIn, signOut } = useQFAuth();
  const [streak, setStreak] = useState<CurrentStreak | null>(null);
  const [loadingStreak, setLoadingStreak] = useState(false);

  useEffect(() => {
    if (!connected) {
      setStreak(null);
      return;
    }
    setLoadingStreak(true);
    getCurrentStreak()
      .then(setStreak)
      .finally(() => setLoadingStreak(false));
  }, [connected]);

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Quran.com?',
      'Your local progress stays. You can reconnect any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: signOut },
      ],
    );
  };

  if (!isQFConfigured()) {
    return null;
  }

  return (
    <View style={styles.container}>
      <GlassCard style={StyleSheet.absoluteFillObject} />
      <View style={styles.header}>
        <View style={[styles.iconBubble, { backgroundColor: theme.accent + '20' }]}>
          <Ionicons name="book-outline" size={18} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyMedium, { color: theme.textPrimary, fontWeight: '600' }]}>
            Quran.com account
          </Text>
          <Text style={[typography.bodySmall, { color: theme.textSecondary }]}>
            {connected
              ? 'Syncing your streak across the Quran ecosystem.'
              : 'Sign in to bring your streak and activity across.'}
          </Text>
        </View>
      </View>

      {connected && (
        <View style={styles.streakRow}>
          <Ionicons name="flame-outline" size={14} color={theme.textMuted} />
          <Text style={[typography.bodySmall, { color: theme.textSecondary }]}>
            {loadingStreak
              ? 'Loading streak…'
              : streak && streak.days > 0
                ? `${streak.days}-day streak on Quran.com`
                : 'Connected · streak will appear once you have activity on Quran.com'}
          </Text>
        </View>
      )}

      {error && (
        <Text style={[typography.bodySmall, { color: theme.error, marginTop: spacing.xs }]}>
          {error}
        </Text>
      )}

      <View style={styles.actions}>
        {connected ? (
          <PressableScale
            onPress={handleDisconnect}
            haptic="light"
            style={[styles.btnSecondary, { borderColor: theme.border }]}
          >
            <Text style={[typography.bodySmall, { color: theme.textPrimary, fontWeight: '600' }]}>
              Disconnect
            </Text>
          </PressableScale>
        ) : (
          <PressableScale
            onPress={signIn}
            haptic="medium"
            disabled={inFlight}
            style={[styles.btnPrimary, { backgroundColor: theme.accent }]}
          >
            <Text style={[typography.bodySmall, { color: theme.textInverse, fontWeight: '600' }]}>
              {inFlight ? 'Signing in…' : 'Sign in with Quran.com'}
            </Text>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      borderRadius: radius.md,
      padding: spacing.md,
      overflow: 'hidden',
      gap: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    iconBubble: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    streakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      paddingTop: spacing.sm,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: spacing.xs,
    },
    btnPrimary: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
    },
    btnSecondary: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
    },
  });
