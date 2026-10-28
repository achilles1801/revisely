import React, { useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
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

/** Test actions check that TestFlight (preview) builds report to Sentry. Not on
 *  the App Store's channel, and not where nothing reports (development, simulators). */
export function showsTestActions(r: ReleaseInfo): boolean {
  return r.sentryEnabled && r.channel === 'preview';
}

/**
 * Settings → About → App info: which build and update this is (what support
 * needs to know). Tap to see the details and share them; long-press to check for
 * an update now. TestFlight (preview) builds also get test-crash actions.
 */
export function AppInfo({ release = currentRelease() }: { release?: ReleaseInfo }) {
  const { palette } = useTheme();
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

  const testActions = showsTestActions(release) ? (
    <>
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
    </>
  ) : null;
  const share = () => Share.share({ message: lines.join('\n') }).catch(() => undefined);

  // A Settings row (a 24pt glyph, the label, its summary under it); the
  // details open under it, lined up with the label, the actions as pills.
  return (
    <View testID="app-info-v2">
      <Tap
        onPress={() => setOpen((o) => !o)}
        onLongPress={check}
        delayLongPress={450}
        style={v2.row}
        accessibilityRole="button"
        accessibilityLabel={`App info: ${appInfoSummary(release)}`}
        accessibilityHint="Double tap for details. Long press to check for an update."
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name="information-circle-outline" size={24} color={palette.text} />
        <View style={styles.text}>
          <Text style={[typeV2.body, { color: palette.text }]}>App info</Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1}>
            {appInfoSummary(release)}
          </Text>
        </View>
        {checking ? (
          <ActivityIndicator size="small" color={palette.secondary} />
        ) : (
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={palette.secondary} />
        )}
      </Tap>
      {release.isEmergencyLaunch && (
        <Text style={[typeV2.meta, v2.indented, v2.warning, { color: palette.red }]}>
          The last update couldn’t start, so the built-in version is running.
        </Text>
      )}
      {open && (
        <View style={[v2.indented, v2.details]} testID="app-info-details">
          {lines.map((l) => (
            <Text key={l} selectable style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}>
              {l}
            </Text>
          ))}
          <View style={styles.actions}>
            <Action label="Check for updates" onPress={check} />
            <Action label="Share" onPress={share} />
          </View>
          {testActions && <View style={styles.actions}>{testActions}</View>}
        </View>
      )}
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return <PillButton title={label} onPress={onPress} variant="outline" size="sm" />;
}

const styles = StyleSheet.create({
  text: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});

// The new design: the Settings rows' metrics (16pt gutter, a 24pt glyph, 16pt to the label).
const v2 = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
  },
  // Under the label: the gutter, the glyph and its 16pt.
  indented: { paddingLeft: layoutV2.gutter + 40, paddingRight: layoutV2.gutter },
  warning: { paddingBottom: 12 },
  details: { paddingBottom: 16, gap: 2 },
});
