import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { QuranPage } from '../types';

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
  return (
    <View style={styles.container}>
      {pages.map((item) => {
        const quranPage = quranData.find(q => q.pageNumber === item.pageNumber);
        const surahName = quranPage?.surahName || item.surahName;

        return (
          <TouchableOpacity
            key={item.pageNumber}
            style={[
              styles.row,
              item.isCompleted && styles.rowCompleted,
              item.isWeak && styles.rowWeak,
            ]}
            onPress={() => item.onToggle(item.pageNumber)}
            activeOpacity={0.7}
          >
            <View style={styles.checkbox}>
              {item.isCompleted && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
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
            <TouchableOpacity
              style={styles.flagButton}
              onPress={() => item.onFlag(item.pageNumber)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.flagText}>⚑</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  rowCompleted: {
    backgroundColor: colors.bgAlt,
  },
  rowWeak: {
    backgroundColor: colors.warningBg,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 0,
    marginRight: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  pageInfo: {
    flex: 1,
  },
  pageNumber: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  surahName: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  weakBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginRight: spacing.sm,
    borderRadius: 0,
  },
  weakBadgeText: {
    ...typography.label,
    color: colors.warningText,
    fontSize: 9,
  },
  flagButton: {
    padding: spacing.xs,
  },
  flagText: {
    fontSize: 18,
    color: colors.textMuted,
  },
});

