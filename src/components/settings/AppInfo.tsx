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
import { applyUpdate, checkForUpdateNow, useUpdateOffer } from '../../lib/updates/ota';
import { t } from '../../i18n';

export { checkForUpdateNow };

/** The alert after "Check for updates" found one: it has downloaded, so the only step left is the restart. */
export function offerRestart(): void {
  Alert.alert(t('settings.appInfo.updateReady'), t('settings.appInfo.restartToUse'), [
    { text: t('settings.appInfo.later'), style: 'cancel' },
    { text: t('settings.appInfo.restartToUpdate'), style: 'default', onPress: () => void applyUpdate() },
  ]);
}

/** One line summary for the row: "1.0.2 (19) · preview · update 84b0091f". */
export function appInfoSummary(r: ReleaseInfo): string {
  const js = r.isEmbeddedLaunch
    ? t('settings.appInfo.builtIn')
    : t('settings.appInfo.update', { id: r.updateShort ?? (r.updateId ?? '').slice(0, 8) });
  return [r.versionLabel, r.channel ?? undefined, js].filter(Boolean).join(' · ');
}

/** Test actions check that TestFlight (preview) builds report to Sentry. Not on
 *  the App Store's channel, and not where nothing reports (development, simulators). */
export function showsTestActions(r: ReleaseInfo): boolean {
  return r.sentryEnabled && r.channel === 'preview';
}

/**
 * Settings → About. For testers (`tools`, lib/updates/testerTools): App info,
 * which build and update this is; tap to see the details and share them,
 * long-press to check for an update now; preview builds also get test-crash
 * actions. Everyone else: the version, nothing more (updates come by themselves).
 */
export function AppInfo({ release = currentRelease(), tools = false }: { release?: ReleaseInfo; tools?: boolean }) {
  return tools ? <AppInfoTools release={release} /> : <VersionRow release={release} />;
}

function VersionRow({ release }: { release: ReleaseInfo }) {
  const { palette } = useTheme();
  return (
    <View style={v2.row} accessible accessibilityLabel={t('settings.appInfo.versionLabel', { version: release.versionLabel })} testID="app-version">
      <Ionicons name="information-circle-outline" size={24} color={palette.text} />
      <Text style={[typeV2.body, styles.text, { color: palette.text }]}>{t('settings.appInfo.version')}</Text>
      <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}>{release.versionLabel}</Text>
    </View>
  );
}

function AppInfoTools({ release }: { release: ReleaseInfo }) {
  const { palette } = useTheme();
  const { lastCheckForUpdateTimeSinceRestart } = Updates.useUpdates();
  // An update downloaded (by the check here or by itself): the restart stays one tap away.
  const { updateId: waiting } = useUpdateOffer();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const lines = diagnosticLines(release, lastCheckForUpdateTimeSinceRestart ?? null);

  const check = async () => {
    setChecking(true);
    const { result, error } = await checkForUpdateNow();
    setChecking(false);
    if (result === 'ready') {
      offerRestart();
    } else if (result === 'up-to-date') {
      Alert.alert(t('settings.appInfo.upToDate'), t('settings.appInfo.latest'));
    } else if (result === 'unavailable') {
      Alert.alert(t('settings.appInfo.notAvailable'), t('settings.appInfo.updatesOff'));
    } else {
      Alert.alert(t('settings.appInfo.checkFailed'), error ?? t('common.pleaseTryAgain'));
    }
  };

  const testActions = showsTestActions(release) ? (
    <>
      <Action label={t('settings.appInfo.sendTestError')} onPress={() => { sendTestError(); Alert.alert(t('settings.appInfo.sent'), t('settings.appInfo.sentBody')); }} />
      <Action
        label={t('settings.appInfo.testCrash')}
        onPress={() =>
          Alert.alert(t('settings.appInfo.crashTitle'), t('settings.appInfo.crashBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('settings.appInfo.crash'), style: 'destructive', onPress: triggerTestNativeCrash },
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
        accessibilityLabel={t('settings.appInfo.label', { summary: appInfoSummary(release) })}
        accessibilityHint={t('settings.appInfo.hint')}
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name="information-circle-outline" size={24} color={palette.text} />
        <View style={styles.text}>
          <Text style={[typeV2.body, { color: palette.text }]}>{t('settings.appInfo.title')}</Text>
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
          {t('settings.appInfo.emergency')}
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
            {waiting ? (
              <PillButton title={t('settings.appInfo.restartToUpdate')} onPress={() => void applyUpdate()} size="sm" testID="app-info-restart" />
            ) : (
              <Action label={t('settings.appInfo.checkForUpdates')} onPress={check} />
            )}
            <Action label={t('settings.appInfo.share')} onPress={share} />
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
