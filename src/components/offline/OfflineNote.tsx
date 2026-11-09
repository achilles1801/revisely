import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { layoutV2, typeV2 } from '../../theme/v2';

/**
 * One quiet line while the server can't be reached: what's shown is the copy
 * on this phone, and changes wait here until the connection is back.
 */
export function OfflineNote() {
  const { palette } = useTheme();
  const { offline, pendingChanges } = useApp();
  if (!offline) return null;
  const waiting = pendingChanges > 0;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={
        waiting
          ? "Offline. Your changes are saved on this phone and sync when you're back online."
          : "Offline. Showing what's saved on this phone."
      }
      testID="offline-note"
    >
      <Ionicons name="cloud-offline-outline" size={14} color={palette.secondary} allowFontScaling />
      <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
        {waiting ? 'Offline · changes saved on this phone' : 'Offline'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 8,
  },
});
