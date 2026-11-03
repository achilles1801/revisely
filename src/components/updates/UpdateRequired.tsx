import React, { useEffect } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from '../SafeAreaView';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { openStore, storeName, useStoreDecision } from '../../lib/updates/storeUpdates';
import { useBusyReasons } from '../../lib/updates/busy';

/**
 * "Update required": over the whole app, with no way past it, while the
 * installed version is below config/app's minimum and the store has one that
 * meets it (lib/updates/versions storeDecision). It waits for a recording or a
 * recitation to stop.
 */
export function UpdateRequiredGate() {
  const { required } = useStoreDecision();
  const waits = useBusyReasons().some((r) => r === 'recording' || r === 'recitation');
  if (!required || waits) return null;
  return <UpdateRequired installed={required.installed} minimum={required.minimum} />;
}

export function UpdateRequired({ installed, minimum }: { installed: string; minimum: string }) {
  const { palette } = useTheme();
  // Android's back button stays here too.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]} accessibilityViewIsModal testID="update-required">
      <SafeAreaView style={styles.fill}>
        <View style={styles.centre}>
          <Ionicons name="arrow-up-circle-outline" size={48} color={palette.text} />
          <Text style={[typeV2.title, styles.centred, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            Update required
          </Text>
          <Text style={[typeV2.body, styles.centred, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
            This version of Revisely is no longer supported. Get version {minimum} or later from {storeName()} to keep
            revising. Your plan, progress and recordings stay as they are.
          </Text>
        </View>
        <View style={styles.foot}>
          <PillButton title="Update" size="lg" onPress={() => void openStore()} testID="update-required-open" />
          <Text style={[typeV2.meta, typeV2.numeral, styles.centred, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
            Installed: {installed}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: layoutV2.gutter * 2 },
  centred: { textAlign: 'center' },
  foot: { gap: 12, paddingHorizontal: layoutV2.gutter, paddingBottom: layoutV2.rowPad },
});
