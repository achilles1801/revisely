import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { applyUpdate, dismissBanner, useUpdateBanner } from '../../lib/updates/ota';
import { useBusyReasons } from '../../lib/updates/busy';

/**
 * Home's quiet line for an update that has waited since an earlier visit
 * (lib/updates/ota): "Update ready · Restart", and ✕. Restart is left out while
 * a restart would interrupt something (a recording or recitation on another
 * tab, a timer); it then applies the next time the app opens.
 */
export function UpdateBanner() {
  const { palette } = useTheme();
  const { visible } = useUpdateBanner();
  // On Home itself; the screen isn't a reason here.
  const busy = useBusyReasons().some((r) => r !== 'screen');
  if (!visible) return null;
  return (
    <View style={styles.row} testID="update-banner">
      <View
        style={[styles.text, busy && styles.flex]}
        accessible
        accessibilityLabel={busy ? 'Update ready. It applies the next time you open Revisely.' : 'Update ready.'}
      >
        <Ionicons name="arrow-down-circle-outline" size={14} color={palette.secondary} allowFontScaling />
        <Text style={[typeV2.meta, styles.shrink, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} numberOfLines={2}>
          {busy ? 'Update ready · applies next time you open Revisely' : 'Update ready'}
        </Text>
      </View>
      {busy ? null : (
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} importantForAccessibility="no" accessibilityElementsHidden>
          ·
        </Text>
      )}
      {busy ? null : (
        <Tap
          onPress={() => void applyUpdate()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Restart to update"
          testID="update-banner-restart"
        >
          <Text style={[typeV2.meta, styles.strong, { color: palette.link }]} maxFontSizeMultiplier={1.4}>
            Restart
          </Text>
        </Tap>
      )}
      {busy ? null : <View style={styles.flex} />}
      <Tap
        onPress={dismissBanner}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        testID="update-banner-dismiss"
      >
        <Ionicons name="close" size={16} color={palette.secondary} allowFontScaling />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  // No line or fill: it sits on Home's glow (CLAUDE.md, "Home's glow must never end in an edge").
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 8,
  },
  text: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  strong: { fontWeight: '600' },
});
