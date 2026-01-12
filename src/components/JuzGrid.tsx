import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { PageStatus } from '../types';
import { getPagesForJuz } from '../lib/quranData';
import { useTheme } from '../context/ThemeContext';

interface JuzGridProps {
  pages: Array<{ pageNumber: number; status: PageStatus }>;
  currentJuz: number | null;
  currentPage: number | null;
  onJuzPress?: (juz: number) => void;
}

export function JuzGrid({
  pages,
  currentJuz,
  currentPage,
  onJuzPress,
}: JuzGridProps) {
  const { theme } = useTheme();

  const getJuzStatus = (juz: number): PageStatus => {
    const juzPages = getPagesForJuz(juz);
    const juzPageData = pages.filter(p => juzPages.includes(p.pageNumber));

    if (juzPageData.every(p => p.status === 'memorized')) {
      return 'memorized';
    }
    if (juzPageData.some(p => p.status === 'memorized' || p.status === 'in_progress')) {
      return 'in_progress';
    }
    return 'not_memorized';
  };

  const isCurrentJuz = (juz: number) => currentJuz === juz;

  return (
    <View style={styles.grid}>
      {Array.from({ length: 30 }, (_, i) => {
        const juz = i + 1;
        const status = getJuzStatus(juz);
        const isCurrent = isCurrentJuz(juz);

        return (
          <TouchableOpacity
            key={juz}
            style={[
              styles.cell,
              { backgroundColor: theme.bgAlt, borderColor: theme.border },
              status === 'memorized' && !isCurrent && { backgroundColor: theme.bgDark, borderColor: theme.bgDark },
              status === 'in_progress' && { backgroundColor: theme.warningBg, borderColor: theme.warning, borderWidth: 2 },
              isCurrent && { backgroundColor: theme.warningBg, borderColor: theme.warning, borderWidth: 2 },
            ]}
            onPress={() => onJuzPress?.(juz)}
            activeOpacity={onJuzPress ? 0.7 : 1}
            disabled={!onJuzPress}
          >
            <Text
              style={[
                styles.cellText,
                { color: theme.textMuted },
                status === 'memorized' && !isCurrent && { color: theme.textInverse },
                isCurrent && { color: theme.warningText, fontWeight: '600' },
              ]}
            >
              {juz}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  cell: {
    width: '15%',
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellText: {
    ...typography.bodyMedium,
    fontWeight: '500',
  },
});
