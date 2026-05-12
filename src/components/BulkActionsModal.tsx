import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { Button } from './Button';
import { GlassCard } from './GlassCard';
import { PressableScale } from './PressableScale';
import { QuranPage } from '../types';

interface PageData {
  pageNumber: number;
  isCompleted: boolean;
  weaknessRating: number;
}

interface BulkActionsModalProps {
  visible: boolean;
  onClose: () => void;
  pages: PageData[];
  quranData: QuranPage[];
  onMarkAllComplete: () => void;
  onMarkAllIncomplete: () => void;
  onMarkJuzComplete: (juzNumber: number) => void;
  onTogglePage: (pageNumber: number) => void;
}

type TabType = 'juz' | 'pages';

export function BulkActionsModal({
  visible,
  onClose,
  pages,
  quranData,
  onMarkAllComplete,
  onMarkAllIncomplete,
  onMarkJuzComplete,
  onTogglePage,
}: BulkActionsModalProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [activeTab, setActiveTab] = useState<TabType>('juz');

  const juzGroups = useMemo(() => {
    const groups: { [key: number]: PageData[] } = {};
    pages.forEach((page) => {
      const quranPage = quranData.find((q) => q.pageNumber === page.pageNumber);
      const juz = quranPage?.juzNumber || 1;
      if (!groups[juz]) groups[juz] = [];
      groups[juz].push(page);
    });
    return groups;
  }, [pages, quranData]);

  const allCompleted = pages.length > 0 && pages.every((p) => p.isCompleted);
  const completedCount = pages.filter((p) => p.isCompleted).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <GlassCard style={styles.sheetGlass} />
          <View style={styles.dragHandle} />

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Manage pages</Text>
              <Text style={styles.summaryText}>
                {completedCount} of {pages.length} complete
              </Text>
            </View>
            <PressableScale
              onPress={onClose}
              haptic="light"
              style={styles.closeButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={theme.textPrimary} />
            </PressableScale>
          </View>

          <View style={styles.quickActions}>
            <Button
              title={allCompleted ? 'Unmark all' : 'Mark all done'}
              onPress={allCompleted ? onMarkAllIncomplete : onMarkAllComplete}
              variant={allCompleted ? 'outline' : 'primary'}
            />
          </View>

          <View style={styles.tabs}>
            <PressableScale
              onPress={() => setActiveTab('juz')}
              haptic="selection"
              scale={0.97}
              style={[styles.tab, activeTab === 'juz' && styles.activeTab]}
            >
              <Text style={[styles.tabText, activeTab === 'juz' && styles.activeTabText]}>By juz</Text>
            </PressableScale>
            <PressableScale
              onPress={() => setActiveTab('pages')}
              haptic="selection"
              scale={0.97}
              style={[styles.tab, activeTab === 'pages' && styles.activeTab]}
            >
              <Text style={[styles.tabText, activeTab === 'pages' && styles.activeTabText]}>All pages</Text>
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scrollView}>
            {activeTab === 'juz'
              ? Object.entries(juzGroups).map(([juzNum, juzPages]) => {
                  const completed = juzPages.filter((p) => p.isCompleted).length;
                  const isFull = completed === juzPages.length;
                  return (
                    <PressableScale
                      key={juzNum}
                      onPress={() => onMarkJuzComplete(parseInt(juzNum))}
                      haptic="medium"
                      scale={0.99}
                      style={[styles.row, isFull && { backgroundColor: theme.accentSoft }]}
                    >
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowTitle}>Juz {juzNum}</Text>
                        <Text style={styles.rowSubtitle}>
                          {completed} / {juzPages.length} pages
                        </Text>
                      </View>
                      <View style={[styles.checkbox, isFull && styles.checkboxChecked]}>
                        {isFull && <Ionicons name="checkmark" size={16} color={theme.textInverse} />}
                      </View>
                    </PressableScale>
                  );
                })
              : pages.map((page) => {
                  const quranPage = quranData.find((q) => q.pageNumber === page.pageNumber);
                  return (
                    <PressableScale
                      key={page.pageNumber}
                      onPress={() => onTogglePage(page.pageNumber)}
                      haptic="selection"
                      scale={0.99}
                      style={[styles.row, page.isCompleted && { backgroundColor: theme.accentSoft }]}
                    >
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowTitle}>Page {page.pageNumber}</Text>
                        <Text style={styles.rowSubtitle}>{quranPage?.surahName || 'Surah'}</Text>
                      </View>
                      <View style={[styles.checkbox, page.isCompleted && styles.checkboxChecked]}>
                        {page.isCompleted && <Ionicons name="checkmark" size={16} color={theme.textInverse} />}
                      </View>
                    </PressableScale>
                  );
                })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      maxHeight: '90%',
      overflow: 'hidden',
      ...shadows.lg,
    },
    sheetGlass: {
      ...StyleSheet.absoluteFillObject,
    },
    dragHandle: {
      width: 40,
      height: 4,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginBottom: spacing.md,
      borderRadius: radius.full,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    title: { ...typography.titleLarge, color: theme.textPrimary },
    summaryText: { ...typography.bodySmall, color: theme.textSecondary, marginTop: 2 },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      backgroundColor: theme.bgAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    quickActions: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: theme.bgAlt,
      borderRadius: radius.sm,
      padding: 3,
      gap: 2,
    },
    tab: {
      flex: 1,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.xs,
      alignItems: 'center',
    },
    activeTab: { backgroundColor: theme.surface },
    tabText: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600' },
    activeTabText: { color: theme.textPrimary },
    scrollView: { flexGrow: 0 },
    scrollContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.xxs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
    },
    rowInfo: { flex: 1 },
    rowTitle: { ...typography.titleSmall, color: theme.textPrimary },
    rowSubtitle: { ...typography.bodySmall, color: theme.textSecondary, marginTop: 2 },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: radius.xs,
      borderWidth: 1.5,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkboxChecked: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
  });
