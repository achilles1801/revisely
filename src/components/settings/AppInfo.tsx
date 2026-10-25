import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { currentRelease, diagnosticLines, ReleaseInfo } from '../../lib/releaseInfo';
import { sendTestError, triggerTestNativeCrash } from '../../lib/sentry';
import { logger } from '../../lib/logger';

export type UpdateCheckResult = 'up-to-date' | 'downloaded' | 'unavailable' | 'error';

/**
 * Check for an update now and download it if there is one. Updates run from the
 * next start; "downloaded" means one is waiting.
 */
export async function checkForUpdateNow(): Promise<{ result: UpdateCheckResult; error?: string }> {
  if (__DEV__ || !Updates.isEnabled) return { result: 'unavailable' };
  try {
    const check = await Updates.checkForUpdateAsync();
    // A roll back to the built-in version counts as an update waiting too.
    if (!check.isAvailable && !check.isRollBackToEmbedded) return { result: 'up-to-date' };
    const fetched = await Updates.fetchUpdateAsync();
    return { result: fetched.isNew || fetched.isRollBackToEmbedded ? 'downloaded' : 'up-to-date' };
  } catch (err) {
    logger.warn('Manual update check failed', err);
    return { result: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** One line summary for the row: "1.0.2 (19) · preview · update 84b0091f". */
export function appInfoSummary(r: ReleaseInfo): string {
  const js = r.isEmbeddedLaunch ? 'built-in' : `update ${r.updateShort ?? (r.updateId ?? '').slice(0, 8)}`;
  return [r.versionLabel, r.channel ?? undefined, js].filter(Boolean).join(' · ');
}

/** Test actions are for builds that aren't on the App Store's channel. */
export function showsTestActions(r: ReleaseInfo): boolean {
  return r.isDev || (r.channel != null && r.channel !== 'production');
}

/**
 * Settings → About → App info: which build and update this is (what support
 * needs to know). Tap to see the details and share them; long-press to check for
 * an update now. Preview and development builds also get test-crash actions.
 */
export function AppInfo({ release = currentRelease() }: { release?: ReleaseInfo }) {
  const { theme } = useTheme();
  const { lastCheckForUpdateTimeSinceRestart } = Updates.useUpdates();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const lines = diagnosticLines(release, lastCheckForUpdateTimeSinceRestart ?? null);

  const check = async () => {
    setChecking(true);
    const { result, error } = await checkForUpdateNow();
    setChecking(false);
    if (result === 'downloaded') {
      Alert.alert('Update downloaded', 'It runs the next time Revisely starts.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart now', onPress: () => Updates.reloadAsync().catch(() => undefined) },
      ]);
    } else if (result === 'up-to-date') {
      Alert.alert('Up to date', 'This is the latest version for this build.');
    } else if (result === 'unavailable') {
      Alert.alert('Not available', 'Updates are off in this build.');
    } else {
      Alert.alert('Couldn’t check for updates', error ?? 'Please try again.');
    }
  };

  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        onLongPress={check}
        delayLongPress={450}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`App info: ${appInfoSummary(release)}`}
        accessibilityHint="Double tap for details. Long press to check for an update."
      >
        <View style={[styles.icon, { backgroundColor: theme.accent + '20' }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.accent} />
        </View>
        <View style={styles.text}>
          <Text style={[typography.bodyMedium, { color: theme.textPrimary }]}>App info</Text>
          <Text style={[typography.caption, { color: theme.textSecondary }]} numberOfLines={1}>
            {appInfoSummary(release)}
          </Text>
        </View>
        {checking ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
        )}
      </Pressable>
      {release.isEmergencyLaunch && (
        <Text style={[typography.caption, styles.warning, { color: theme.error }]}>
          The last update couldn’t start, so the built-in version is running.
        </Text>
      )}
      {open && (
        <View style={styles.details}>
          {lines.map((l) => (
            <Text key={l} selectable style={[typography.caption, { color: theme.textSecondary }]}>
              {l}
            </Text>
          ))}
          <View style={styles.actions}>
            <Action label="Check for updates" onPress={check} />
            <Action label="Share" onPress={() => Share.share({ message: lines.join('\n') }).catch(() => undefined)} />
          </View>
          {showsTestActions(release) && (
            <View style={styles.actions}>
              <Action label="Send test error" onPress={() => { sendTestError(); Alert.alert('Sent', 'A test error went to Sentry.'); }} />
              <Action
                label="Test native crash"
                onPress={() =>
                  Alert.alert('Crash the app?', 'Revisely closes at once; reopen it to send the crash report.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Crash', style: 'destructive', onPress: triggerTestNativeCrash },
                  ])
                }
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[styles.action, { borderColor: theme.border, backgroundColor: theme.glass }]}
      accessibilityRole="button"
    >
      <Text style={[typography.caption, { color: theme.textPrimary, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Matches the Settings rows.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 52 },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  warning: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  details: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  action: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
