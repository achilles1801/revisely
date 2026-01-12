import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { Button } from './Button';
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
  const [activeTab, setActiveTab] = useState<TabType>('juz');

  // Group pages by juz
  const juzGroups = useMemo(() => {
    const groups: { [key: number]: PageData[] } = {};
    pages.forEach(page => {
      const quranPage = quranData.find(q => q.pageNumber === page.pageNumber);
      const juz = quranPage?.juzNumber || 1;
      if (!groups[juz]) groups[juz] = [];
      groups[juz].push(page);
    });
    return groups;
  }, [pages, quranData]);

  const allCompleted = pages.every(p => p.isCompleted);
  const completedCount = pages.filter(p => p.isCompleted).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Manage Pages</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {completedCount} of {pages.length} pages completed
          </Text>
        </View>

        <View style={styles.quickActions}>
          <Button
            title={allCompleted ? "Unmark All" : "Mark All Done"}
            onPress={allCompleted ? onMarkAllIncomplete : onMarkAllComplete}
            variant={allCompleted ? "outline" : "primary"}
            style={styles.quickButton}
          />
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'juz' && styles.activeTab]}
            onPress={() => setActiveTab('juz')}
          >
            <Text style={[styles.tabText, activeTab === 'juz' && styles.activeTabText]}>
              By Juz
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pages' && styles.activeTab]}
            onPress={() => setActiveTab('pages')}
          >
            <Text style={[styles.tabText, activeTab === 'pages' && styles.activeTabText]}>
              All Pages
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {activeTab === 'juz' ? (
            // Juz view
            Object.entries(juzGroups).map(([juzNum, juzPages]) => {
              const juzCompleted = juzPages.filter(p => p.isCompleted).length;
              const isFullyCompleted = juzCompleted === juzPages.length;

              return (
                <Pressable
                  key={juzNum}
                  style={[styles.juzRow, isFullyCompleted && styles.juzRowCompleted]}
                  onPress={() => onMarkJuzComplete(parseInt(juzNum))}
                >
                  <View style={styles.juzInfo}>
                    <Text style={styles.juzTitle}>Juz {juzNum}</Text>
                    <Text style={styles.juzSubtitle}>
                      {juzCompleted} / {juzPages.length} pages
                    </Text>
                  </View>
                  <View style={[styles.checkbox, isFullyCompleted && styles.checkboxChecked]}>
                    {isFullyCompleted && (
                      <Ionicons name="checkmark" size={18} color={colors.textInverse} />
                    )}
                  </View>
                </Pressable>
              );
            })
          ) : (
            // Pages view
            pages.map(page => {
              const quranPage = quranData.find(q => q.pageNumber === page.pageNumber);
              return (
                <Pressable
                  key={page.pageNumber}
                  style={[styles.pageRow, page.isCompleted && styles.pageRowCompleted]}
                  onPress={() => onTogglePage(page.pageNumber)}
                >
                  <View style={styles.pageInfo}>
                    <Text style={styles.pageNumber}>Page {page.pageNumber}</Text>
                    <Text style={styles.pageSurah}>{quranPage?.surahName || 'Surah'}</Text>
                  </View>
                  <View style={[styles.checkbox, page.isCompleted && styles.checkboxChecked]}>
                    {page.isCompleted && (
                      <Ionicons name="checkmark" size={18} color={colors.textInverse} />
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title="Done"
            onPress={onClose}
            variant="primary"
            style={styles.doneButton}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.displaySmall,
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  summary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgAlt,
  },
  summaryText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  quickActions: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  quickButton: {
    width: '100%',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  tabText: {
    ...typography.bodyMedium,
    color: colors.textMuted,
  },
  activeTabText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  juzRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  juzRowCompleted: {
    backgroundColor: colors.successBg,
  },
  juzInfo: {
    flex: 1,
  },
  juzTitle: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  juzSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pageRowCompleted: {
    backgroundColor: colors.successBg,
  },
  pageInfo: {
    flex: 1,
  },
  pageNumber: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  pageSurah: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  doneButton: {
    width: '100%',
  },
});
