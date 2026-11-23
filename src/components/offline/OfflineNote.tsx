import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { t } from '../../i18n';

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
          ? t('offline.note.waitingLabel')
          : t('offline.note.label')
      }
      testID="offline-note"
    >
      <Ionicons name="cloud-offline-outline" size={14} color={palette.secondary} allowFontScaling />
      <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
        {waiting ? t('offline.note.waiting') : t('offline.note.short')}
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
