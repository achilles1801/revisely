// A badge just won, on the session's end card (ACCOUNT-6): one quiet row under the totals, this once.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { formatNumber, t } from '../../i18n';
import { badgeName, type Milestone } from '../../lib/badges';
import { typeV2 } from '../../theme/v2';
import { BadgeMark } from './BadgeMark';

export function NewBadgeRow({ milestone }: { milestone: Milestone }) {
  const { palette } = useTheme();
  return (
    <View style={styles.row} accessible testID="session-end-badge">
      <View style={[styles.halo, { backgroundColor: palette.accentSubtle }]}>
        <BadgeMark milestone={milestone} size={44} />
      </View>
      <View>
        <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {t('account.badges.newRow', { badge: badgeName(milestone) })}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {t('account.badges.newRowSub', { count: milestone, n: formatNumber(milestone) })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  halo: { borderRadius: 29, padding: 7 },
});
