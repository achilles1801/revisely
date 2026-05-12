import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { PageStatus } from '../types';
import { getPagesForJuz } from '../lib/quranData';
import { useTheme } from '../context/ThemeContext';
import { PressableScale } from './PressableScale';

interface JuzGridProps {
  pages: Array<{ pageNumber: number; status: PageStatus }>;
  currentJuz: number | null;
  currentPage: number | null;
  onJuzPress?: (juz: number) => void;
}

export function JuzGrid({
  pages,
  currentJuz,
  onJuzPress,
}: JuzGridProps) {
  const { theme } = useTheme();

  const getJuzStatus = (juz: number): PageStatus => {
    const juzPages = getPagesForJuz(juz);
    const juzPageData = pages.filter(p => juzPages.includes(p.pageNumber));

    if (juzPageData.every(p => p.status === 'memorized')) return 'memorized';
    if (juzPageData.some(p => p.status === 'memorized' || p.status === 'in_progress')) {
      return 'in_progress';
    }
    return 'not_memorized';
  };

  return (
    <View style={styles.grid}>
      {Array.from({ length: 30 }, (_, i) => {
        const juz = i + 1;
        const status = getJuzStatus(juz);
        const isCurrent = currentJuz === juz;

        const cellStyle = (() => {
          if (isCurrent) {
            return { backgroundColor: theme.accent };
          }
          if (status === 'memorized') {
            return { backgroundColor: theme.accentSoft };
          }
          if (status === 'in_progress') {
            return {
              backgroundColor: theme.bgAlt,
              borderWidth: 1.5,
              borderColor: theme.accent,
            };
          }
          return { backgroundColor: theme.bgAlt };
        })();

        const textColor = (() => {
          if (isCurrent) return theme.textInverse;
          if (status === 'memorized') return theme.accent;
          if (status === 'in_progress') return theme.accent;
          return theme.textMuted;
        })();

        const Wrapper = onJuzPress ? PressableScale : View;
        const wrapperProps = onJuzPress
          ? { onPress: () => onJuzPress(juz), haptic: 'selection' as const }
          : {};

        return (
          <Wrapper
            key={juz}
            {...wrapperProps}
            style={[styles.cell, cellStyle]}
          >
            <Text style={[styles.cellText, { color: textColor }]}>{juz}</Text>
          </Wrapper>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'flex-start',
  },
  cell: {
    width: '17.5%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellText: {
    ...typography.titleSmall,
    fontWeight: '600',
  },
});
