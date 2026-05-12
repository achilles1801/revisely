import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { QuranPage } from '../types';
import { PressableScale } from './PressableScale';

interface PageListItem {
  pageNumber: number;
  surahName: string;
  isCompleted: boolean;
  isWeak: boolean;
  onToggle: (pageNumber: number) => void;
  onFlag: (pageNumber: number) => void;
}

interface PageListProps {
  pages: PageListItem[];
  quranData: QuranPage[];
}

export function PageList({ pages, quranData }: PageListProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      {pages.map((item) => {
        const quranPage = quranData.find(q => q.pageNumber === item.pageNumber);
        const surahName = quranPage?.surahName || item.surahName;

        return (
          <PressableScale
            key={item.pageNumber}
            onPress={() => item.onToggle(item.pageNumber)}
            haptic="selection"
            style={styles.row}
            scale={0.99}
          >
            <View
              style={[
                styles.checkbox,
                item.isCompleted && styles.checkboxChecked,
              ]}
            >
              {item.isCompleted && (
                <Ionicons name="checkmark" size={16} color={theme.textInverse} />
              )}
            </View>

            <View style={styles.pageInfo}>
              <Text style={styles.pageNumber}>Page {item.pageNumber}</Text>
              <Text style={styles.surahName}>{surahName}</Text>
            </View>

            {item.isWeak && (
              <View style={styles.weakBadge}>
                <Text style={styles.weakBadgeText}>Weak</Text>
              </View>
            )}

            <PressableScale
              onPress={() => item.onFlag(item.pageNumber)}
              haptic="light"
              style={styles.flagButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={item.isWeak ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={item.isWeak ? theme.warning : theme.textMuted}
              />
            </PressableScale>
          </PressableScale>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: '100%',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderWidth: 1.5,
      borderColor: theme.border,
      borderRadius: radius.xs,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.bg,
    },
    checkboxChecked: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    pageInfo: {
      flex: 1,
    },
    pageNumber: {
      ...typography.titleSmall,
      color: theme.textPrimary,
      marginBottom: 2,
    },
    surahName: {
      ...typography.bodySmall,
      color: theme.textSecondary,
    },
    weakBadge: {
      backgroundColor: theme.warningBg,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    weakBadgeText: {
      ...typography.label,
      color: theme.warningText,
      fontSize: 10,
    },
    flagButton: {
      padding: spacing.xxs,
    },
  });
