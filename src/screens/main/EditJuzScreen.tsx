import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { Button } from '../../components/Button';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import {
  getPagesForJuz,
  getJuzRange,
  getJuzName,
  getSurahsInJuz,
  SurahInJuz,
} from '../../lib/quranData';
import { UserPage } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'EditJuz'>;

interface JuzCardProps {
  juzNumber: number;
  name: string;
  pageRange: { start: number; end: number };
  memorizedCount: number;
  totalPages: number;
  isExpanded: boolean;
  surahs: SurahInJuz[];
  pages: UserPage[];
  onToggleJuz: () => void;
  onExpand: () => void;
  onToggleSurah: (surahNumber: number) => void;
  onClearAll: () => void;
}

function JuzCard({
  juzNumber,
  name,
  pageRange,
  memorizedCount,
  totalPages,
  isExpanded,
  surahs,
  pages,
  onToggleJuz,
  onExpand,
  onToggleSurah,
  onClearAll,
}: JuzCardProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isComplete = memorizedCount === totalPages;
  const isPartial = memorizedCount > 0 && memorizedCount < totalPages;
  const progress = totalPages > 0 ? memorizedCount / totalPages : 0;

  const getSurahMemorizedCount = (surah: SurahInJuz) => {
    return surah.pagesInJuz.filter(pageNum => {
      const page = pages.find(p => p.pageNumber === pageNum);
      return page?.status === 'memorized';
    }).length;
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {/* Card content - tappable to expand */}
        <TouchableOpacity
          style={styles.cardContent}
          onPress={onExpand}
          activeOpacity={0.7}
        >
          <View style={[
            styles.juzNumber,
            isComplete && styles.juzNumberComplete,
            isPartial && styles.juzNumberPartial,
          ]}>
            <Text style={[
              styles.juzNumberText,
              isComplete && styles.juzNumberTextComplete,
            ]}>
              {juzNumber}
            </Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.juzName}>{name}</Text>
            <Text style={styles.pageRange}>
              {surahs.length} surah{surahs.length !== 1 ? 's' : ''} · {totalPages} pages
            </Text>
          </View>
        </TouchableOpacity>

        {/* Checkbox - separate touch target with larger hit area */}
        <TouchableOpacity
          style={styles.cardRight}
          onPress={onToggleJuz}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isPartial && (
            <Text style={styles.progressText}>
              {memorizedCount}/{totalPages}
            </Text>
          )}
          <View
            style={[
              styles.checkbox,
              isComplete && styles.checkboxChecked,
              isPartial && styles.checkboxPartial,
            ]}
          >
            {isComplete && <Text style={styles.checkmark}>✓</Text>}
            {isPartial && <Text style={styles.partialMark}>−</Text>}
          </View>
        </TouchableOpacity>
      </View>

      {isPartial && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      )}

      {isExpanded && (
        <View style={styles.expandedSection}>
          <Text style={styles.expandedLabel}>
            Tap surahs to mark as memorized
          </Text>

          <View style={styles.surahList}>
            {surahs.map((surah) => {
              const surahMemorized = getSurahMemorizedCount(surah);
              const surahTotal = surah.pagesInJuz.length;
              const isSurahComplete = surahMemorized === surahTotal;
              const isSurahPartial = surahMemorized > 0 && surahMemorized < surahTotal;

              return (
                <TouchableOpacity
                  key={surah.number}
                  style={[
                    styles.surahItem,
                    isSurahComplete && styles.surahItemComplete,
                    isSurahPartial && styles.surahItemPartial,
                  ]}
                  onPress={() => onToggleSurah(surah.number)}
                  activeOpacity={0.7}
                >
                  <View style={styles.surahInfo}>
                    <Text style={[
                      styles.surahNumber,
                      isSurahComplete && styles.surahTextComplete,
                    ]}>
                      {surah.number}
                    </Text>
                    <View style={styles.surahNames}>
                      <Text style={[
                        styles.surahNameArabic,
                        isSurahComplete && styles.surahTextComplete,
                      ]}>
                        {surah.nameArabic}
                      </Text>
                      <Text style={[
                        styles.surahNameEnglish,
                        isSurahComplete && styles.surahTextCompleteSecondary,
                      ]}>
                        {surah.name}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.surahRight}>
                    <Text style={[
                      styles.surahPages,
                      isSurahComplete && styles.surahTextCompleteSecondary,
                    ]}>
                      {surahTotal} pg{surahTotal !== 1 ? 's' : ''}
                    </Text>
                    <View style={[
                      styles.surahCheck,
                      isSurahComplete && styles.surahCheckComplete,
                      isSurahPartial && styles.surahCheckPartial,
                    ]}>
                      {isSurahComplete && <Text style={styles.surahCheckmark}>✓</Text>}
                      {isSurahPartial && <Text style={styles.surahPartialMark}>−</Text>}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={onClearAll}
            >
              <Text style={styles.quickActionText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAction, styles.quickActionPrimary]}
              onPress={onToggleJuz}
            >
              <Text style={[styles.quickActionText, styles.quickActionTextPrimary]}>
                {isComplete ? 'Unmark All' : 'Mark All Complete'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function EditJuzScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { pages, updatePages } = useApp();

  const [expandedJuz, setExpandedJuz] = useState<number | null>(null);

  const getJuzStats = useCallback((juzNumber: number) => {
    const juzPages = getPagesForJuz(juzNumber);
    const juzPageData = pages.filter(p => juzPages.includes(p.pageNumber));
    const memorizedCount = juzPageData.filter(p => p.status === 'memorized').length;
    return { memorizedCount, totalPages: juzPages.length };
  }, [pages]);

  const handleToggleJuz = useCallback((juz: number) => {
    const juzPageNumbers = getPagesForJuz(juz);
    const { memorizedCount, totalPages } = getJuzStats(juz);
    const isComplete = memorizedCount === totalPages;

    const updatedPages = pages.map(p => {
      if (juzPageNumbers.includes(p.pageNumber)) {
        return {
          ...p,
          status: (isComplete ? 'not_memorized' : 'memorized') as 'not_memorized' | 'memorized',
          dateMemorized: isComplete ? null : new Date().toISOString(),
        };
      }
      return p;
    });

    // Only sync the changed pages
    updatePages(updatedPages, juzPageNumbers);
  }, [pages, getJuzStats, updatePages]);

  const handleClearJuz = useCallback((juz: number) => {
    const juzPageNumbers = getPagesForJuz(juz);

    const updatedPages = pages.map(p => {
      if (juzPageNumbers.includes(p.pageNumber)) {
        return {
          ...p,
          status: 'not_memorized' as const,
          dateMemorized: null,
        };
      }
      return p;
    });

    // Only sync the changed pages
    updatePages(updatedPages, juzPageNumbers);
  }, [pages, updatePages]);

  const handleExpandJuz = useCallback((juz: number) => {
    setExpandedJuz(expandedJuz === juz ? null : juz);
  }, [expandedJuz]);

  const handleToggleSurah = useCallback((juz: number, surahNumber: number) => {
    const surahs = getSurahsInJuz(juz);
    const surah = surahs.find(s => s.number === surahNumber);
    if (!surah) return;

    const surahPagesInJuz = surah.pagesInJuz;
    const memorizedCount = surahPagesInJuz.filter(pageNum => {
      const page = pages.find(p => p.pageNumber === pageNum);
      return page?.status === 'memorized';
    }).length;

    const isComplete = memorizedCount === surahPagesInJuz.length;

    const updatedPages = pages.map(p => {
      if (surahPagesInJuz.includes(p.pageNumber)) {
        return {
          ...p,
          status: (isComplete ? 'not_memorized' : 'memorized') as 'not_memorized' | 'memorized',
          dateMemorized: isComplete ? null : new Date().toISOString(),
        };
      }
      return p;
    });

    // Only sync the changed pages
    updatePages(updatedPages, surahPagesInJuz);
  }, [pages, updatePages]);

  const handleSave = () => {
    navigation.goBack();
  };

  const getTotalMemorized = () => {
    return pages.filter(p => p.status === 'memorized').length;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headline}>Edit Memorized</Text>
        <Text style={styles.subtext}>
          Tap checkbox to mark juz complete, or expand to select surahs.
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {Array.from({ length: 30 }, (_, i) => {
          const juzNumber = i + 1;
          const range = getJuzRange(juzNumber);
          const stats = getJuzStats(juzNumber);
          const surahs = getSurahsInJuz(juzNumber);

          return (
            <JuzCard
              key={juzNumber}
              juzNumber={juzNumber}
              name={getJuzName(juzNumber)}
              pageRange={range}
              memorizedCount={stats.memorizedCount}
              totalPages={stats.totalPages}
              isExpanded={expandedJuz === juzNumber}
              surahs={surahs}
              pages={pages}
              onToggleJuz={() => handleToggleJuz(juzNumber)}
              onExpand={() => handleExpandJuz(juzNumber)}
              onToggleSurah={(surahNum) => handleToggleSurah(juzNumber, surahNum)}
              onClearAll={() => handleClearJuz(juzNumber)}
            />
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {getTotalMemorized()} of 604 pages memorized
          </Text>
        </View>
        <Button
          title="Done"
          onPress={handleSave}
          variant="primary"
          style={styles.button}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (theme: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  backButton: {
    marginBottom: spacing.md,
  },
  backButtonText: {
    ...typography.bodyMedium,
    color: theme.textSecondary,
  },
  headline: {
    ...typography.displaySmall,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  subtext: {
    ...typography.bodyMedium,
    color: theme.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: theme.bgAlt,
    borderRadius: 12,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  juzNumber: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.bg,
    borderWidth: 2,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  juzNumberComplete: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  juzNumberPartial: {
    backgroundColor: theme.warningBg,
    borderColor: theme.warning,
  },
  juzNumberText: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  juzNumberTextComplete: {
    color: theme.textInverse,
  },
  cardInfo: {
    flex: 1,
  },
  juzName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  pageRange: {
    ...typography.bodySmall,
    color: theme.textMuted,
    marginTop: 2,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
  },
  progressText: {
    ...typography.bodySmall,
    color: theme.textMuted,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.border,
    backgroundColor: theme.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  checkboxPartial: {
    backgroundColor: theme.warningBg,
    borderColor: theme.warning,
  },
  checkmark: {
    color: theme.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  partialMark: {
    color: theme.warningText,
    fontSize: 18,
    fontWeight: '700',
  },
  progressBar: {
    height: 3,
    backgroundColor: theme.border,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.warning,
    borderRadius: 2,
  },
  expandedSection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: spacing.md,
  },
  expandedLabel: {
    ...typography.bodySmall,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  surahList: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  surahItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.bg,
    borderRadius: 8,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: theme.border,
  },
  surahItemComplete: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  surahItemPartial: {
    backgroundColor: theme.warningBg,
    borderColor: theme.warning,
  },
  surahInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  surahNumber: {
    ...typography.bodySmall,
    color: theme.textMuted,
    width: 28,
    textAlign: 'center',
  },
  surahNames: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  surahNameArabic: {
    ...typography.bodyMedium,
    color: theme.textPrimary,
    fontWeight: '500',
  },
  surahNameEnglish: {
    ...typography.bodySmall,
    color: theme.textMuted,
  },
  surahRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  surahPages: {
    ...typography.bodySmall,
    color: theme.textMuted,
  },
  surahCheck: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: theme.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  surahCheckComplete: {
    backgroundColor: theme.textInverse,
    borderColor: theme.textInverse,
  },
  surahCheckPartial: {
    backgroundColor: theme.warningBg,
    borderColor: theme.warning,
  },
  surahCheckmark: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  surahPartialMark: {
    color: theme.warningText,
    fontSize: 14,
    fontWeight: '700',
  },
  surahTextComplete: {
    color: theme.textInverse,
  },
  surahTextCompleteSecondary: {
    color: theme.textMuted,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickAction: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  quickActionPrimary: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  quickActionText: {
    ...typography.bodySmall,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  quickActionTextPrimary: {
    color: theme.textInverse,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.bg,
  },
  summary: {
    marginBottom: spacing.md,
  },
  summaryText: {
    ...typography.bodyMedium,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  button: {
    width: '100%',
  },
});
