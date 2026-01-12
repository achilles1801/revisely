import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getPagesForJuz,
  getJuzName,
  getSurahsInJuz,
  SurahInJuz,
} from '../../lib/quranData';

type StatMode = 'juz' | 'pages' | 'surahs';

export default function ProgressScreen() {
  const { pages, loadData, updatePages } = useApp();
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedJuz, setExpandedJuz] = useState<number | null>(null);
  const [expandedSurah, setExpandedSurah] = useState<string | null>(null); // "juz-surah" format
  const [statMode, setStatMode] = useState<StatMode>('juz');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Helper function to get weakness rating color
  const getWeaknessRatingColor = (rating: number): string => {
    if (rating === 1) return '#ef4444'; // Cannot recall - red
    if (rating === 2) return '#f59e0b'; // Major difficulty - amber
    if (rating === 3) return '#eab308'; // Some hesitation - yellow
    if (rating === 4) return '#84cc16'; // Mostly smooth - lime
    if (rating === 5) return '#22c55e'; // Completely solid - green
    return '#9ca3af'; // Default gray
  };

  // Calculate stats for each juz including weakness ratings
  const getJuzStats = useCallback((juzNumber: number) => {
    const juzPageNumbers = getPagesForJuz(juzNumber);
    const juzPages = pages.filter(p => juzPageNumbers.includes(p.pageNumber));
    const memorizedCount = juzPages.filter(p => p.status === 'memorized').length;
    
    // Calculate weakness rating stats for memorized pages
    const memorizedPages = juzPages.filter(p => p.status === 'memorized');
    const weakPages = memorizedPages.filter(p => p.weaknessRating <= 2).length;
    const avgRating = memorizedPages.length > 0
      ? memorizedPages.reduce((sum, p) => sum + p.weaknessRating, 0) / memorizedPages.length
      : 0;
    
    return { 
      memorizedCount, 
      totalPages: juzPageNumbers.length,
      weakPages,
      avgRating: Math.round(avgRating * 10) / 10, // Round to 1 decimal
    };
  }, [pages]);

  // Overall stats including weakness ratings
  const stats = useMemo(() => {
    let completeJuz = 0;
    let inProgressJuz = 0;
    let totalMemorized = 0;
    let totalWeakPages = 0; // Pages with rating <= 2
    let totalPagesWithRatings = 0;
    let totalRatingSum = 0;
    const completedSurahs = new Set<number>();
    const allSurahs = new Set<number>();

    const memorizedPages = pages.filter(p => p.status === 'memorized');
    memorizedPages.forEach(page => {
      totalPagesWithRatings++;
      totalRatingSum += page.weaknessRating;
      if (page.weaknessRating <= 2) {
        totalWeakPages++;
      }
    });

    for (let i = 1; i <= 30; i++) {
      const { memorizedCount, totalPages } = getJuzStats(i);
      totalMemorized += memorizedCount;
      if (memorizedCount === totalPages) {
        completeJuz++;
      } else if (memorizedCount > 0) {
        inProgressJuz++;
      }

      // Count surahs
      const surahs = getSurahsInJuz(i);
      surahs.forEach(surah => {
        allSurahs.add(surah.number);
        const surahMemorized = surah.pagesInJuz.filter(pageNum => {
          const page = pages.find(p => p.pageNumber === pageNum);
          return page?.status === 'memorized';
        }).length;
        // Only count as complete if all pages in this juz portion are memorized
        // For full surah completion, we'd need to track across juz
        if (surahMemorized === surah.pagesInJuz.length) {
          completedSurahs.add(surah.number);
        }
      });
    }

    const avgWeaknessRating = totalPagesWithRatings > 0 
      ? Math.round((totalRatingSum / totalPagesWithRatings) * 10) / 10 
      : 0;

    return { 
      completeJuz, 
      inProgressJuz, 
      totalMemorized, 
      completedSurahs: completedSurahs.size, 
      totalSurahs: 114,
      totalWeakPages,
      avgWeaknessRating,
    };
  }, [getJuzStats, pages]);

  const getSurahMemorizedCount = (surah: SurahInJuz) => {
    return surah.pagesInJuz.filter(pageNum => {
      const page = pages.find(p => p.pageNumber === pageNum);
      return page?.status === 'memorized';
    }).length;
  };

  const handleToggleExpand = (juzNumber: number) => {
    setExpandedJuz(expandedJuz === juzNumber ? null : juzNumber);
  };

  const handleToggleJuz = useCallback((juzNumber: number) => {
    const juzPageNumbers = getPagesForJuz(juzNumber);
    const { memorizedCount, totalPages } = getJuzStats(juzNumber);
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

    updatePages(updatedPages, juzPageNumbers);
  }, [pages, getJuzStats, updatePages]);

  const handleToggleSurah = useCallback((juzNumber: number, surahNumber: number) => {
    const surahs = getSurahsInJuz(juzNumber);
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

    updatePages(updatedPages, surahPagesInJuz);
  }, [pages, updatePages]);

  const handleClearJuz = useCallback((juzNumber: number) => {
    const juzPageNumbers = getPagesForJuz(juzNumber);
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
    updatePages(updatedPages, juzPageNumbers);
  }, [pages, updatePages]);

  const handleTogglePage = useCallback((pageNumber: number) => {
    const page = pages.find(p => p.pageNumber === pageNumber);
    if (!page) return;

    const isMemorized = page.status === 'memorized';
    const updatedPages = pages.map(p => {
      if (p.pageNumber === pageNumber) {
        return {
          ...p,
          status: (isMemorized ? 'not_memorized' : 'memorized') as 'not_memorized' | 'memorized',
          dateMemorized: isMemorized ? null : new Date().toISOString(),
        };
      }
      return p;
    });

    updatePages(updatedPages, [pageNumber]);
  }, [pages, updatePages]);

  const handleToggleSurahExpand = (juzNumber: number, surahNumber: number) => {
    const key = `${juzNumber}-${surahNumber}`;
    setExpandedSurah(expandedSurah === key ? null : key);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
          />
        }
      >
        <Header title="Progress" />

        {/* Modern Stats Display */}
        <View style={[styles.statsContainer, { backgroundColor: theme.bgAlt }]}>
          {/* Toggle Pills */}
          <View style={[styles.toggleContainer, { backgroundColor: theme.bg }]}>
            {(['juz', 'surahs', 'pages'] as StatMode[]).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.toggleButton,
                  statMode === mode && styles.toggleButtonActive,
                  statMode === mode && { backgroundColor: theme.bgDark },
                ]}
                onPress={() => setStatMode(mode)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.toggleText,
                  { color: theme.textMuted },
                  statMode === mode && { color: theme.textInverse },
                ]}>
                  {mode === 'juz' ? 'Juz' : mode === 'surahs' ? 'Surahs' : 'Pages'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Main Stats Display */}
          <View style={styles.statsMain}>
            <Text style={[styles.statsNumber, { color: theme.textPrimary }]}>
              {statMode === 'juz' ? stats.completeJuz : statMode === 'surahs' ? stats.completedSurahs : stats.totalMemorized}
            </Text>
            <Text style={[styles.statsDivider, { color: theme.textMuted }]}>/</Text>
            <Text style={[styles.statsTotal, { color: theme.textMuted }]}>
              {statMode === 'juz' ? '30' : statMode === 'surahs' ? '114' : '604'}
            </Text>
          </View>

          {/* Weakness Rating Insights */}
          {stats.totalMemorized > 0 && (
            <View style={[styles.insightsSection, { borderTopColor: theme.border }]}>
              <Text style={[styles.insightsLabel, { color: theme.textMuted }]}>STRENGTH INSIGHTS</Text>
              <View style={styles.insightsRow}>
                <View style={styles.insightItem}>
                  <Text style={[styles.insightValue, { color: getWeaknessRatingColor(Math.round(stats.avgWeaknessRating)) }]}>
                    {stats.avgWeaknessRating.toFixed(1)}
                  </Text>
                  <Text style={[styles.insightLabel, { color: theme.textSecondary }]}>Avg Rating</Text>
                </View>
                <View style={[styles.insightDivider, { backgroundColor: theme.border }]} />
                <View style={styles.insightItem}>
                  <Text style={[styles.insightValue, { color: stats.totalWeakPages > 0 ? '#f59e0b' : theme.success }]}>
                    {stats.totalWeakPages}
                  </Text>
                  <Text style={[styles.insightLabel, { color: theme.textSecondary }]}>Need Practice</Text>
                </View>
              </View>
            </View>
          )}

          {/* Progress Bar with Gradient Effect */}
          <View style={styles.progressSection}>
            <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.bgDark,
                    width: `${(statMode === 'juz'
                      ? (stats.completeJuz / 30)
                      : statMode === 'surahs'
                      ? (stats.completedSurahs / 114)
                      : (stats.totalMemorized / 604)) * 100}%`,
                  },
                ]}
              >
                <View style={[styles.progressGlow, { backgroundColor: theme.textInverse }]} />
              </View>
            </View>

            {/* Progress Labels */}
            <View style={styles.progressLabels}>
              <Text style={[styles.progressPercent, { color: theme.textPrimary }]}>
                {Math.round((statMode === 'juz'
                  ? (stats.completeJuz / 30)
                  : statMode === 'surahs'
                  ? (stats.completedSurahs / 114)
                  : (stats.totalMemorized / 604)) * 100)}%
              </Text>
              <Text style={[styles.progressRemaining, { color: theme.textMuted }]}>
                {statMode === 'juz'
                  ? `${30 - stats.completeJuz} to go`
                  : statMode === 'surahs'
                  ? `${114 - stats.completedSurahs} to go`
                  : `${604 - stats.totalMemorized} to go`}
              </Text>
            </View>
          </View>
        </View>

        {/* Weak Pages Alert Section */}
        {stats.totalWeakPages > 0 && (
          <View style={[styles.weakPagesSection, { backgroundColor: theme.warningBg, borderColor: theme.warning }]}>
            <View style={styles.weakPagesHeader}>
              <Ionicons name="alert-circle" size={20} color="#f59e0b" />
              <Text style={[styles.weakPagesTitle, { color: theme.textPrimary }]}>
                Pages Needing Practice
              </Text>
            </View>
            <Text style={[styles.weakPagesText, { color: theme.textSecondary }]}>
              {stats.totalWeakPages} memorized page{stats.totalWeakPages !== 1 ? 's' : ''} {stats.totalWeakPages === 1 ? 'has' : 'have'} a weakness rating of 2 or lower
            </Text>
          </View>
        )}

        {/* All 30 Juz */}
        {Array.from({ length: 30 }, (_, i) => {
          const juzNumber = i + 1;
          const { memorizedCount, totalPages, weakPages, avgRating } = getJuzStats(juzNumber);
          const surahs = getSurahsInJuz(juzNumber);
          const isExpanded = expandedJuz === juzNumber;
          const isComplete = memorizedCount === totalPages;
          const isPartial = memorizedCount > 0 && memorizedCount < totalPages;
          const progress = totalPages > 0 ? memorizedCount / totalPages : 0;
          const hasWeakPages = weakPages > 0;

          return (
            <View key={juzNumber} style={[styles.card, { backgroundColor: theme.bgAlt }]}>
              <View style={styles.cardHeader}>
                {/* Card content - tappable to expand */}
                <TouchableOpacity
                  style={styles.cardContent}
                  onPress={() => handleToggleExpand(juzNumber)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.juzNumber,
                    { backgroundColor: theme.bg, borderColor: theme.border },
                    isComplete && { backgroundColor: theme.bgDark, borderColor: theme.bgDark },
                    isPartial && { backgroundColor: theme.warningBg, borderColor: theme.warning },
                  ]}>
                    <Text style={[
                      styles.juzNumberText,
                      { color: theme.textSecondary },
                      isComplete && { color: theme.textInverse },
                    ]}>
                      {juzNumber}
                    </Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.juzName, { color: theme.textPrimary }]}>
                      {getJuzName(juzNumber)}
                    </Text>
                    <View style={styles.juzMetaRow}>
                      <Text style={[styles.juzMeta, { color: theme.textMuted }]}>
                        {surahs.length} surah{surahs.length !== 1 ? 's' : ''} · {totalPages} pages
                      </Text>
                      {memorizedCount > 0 && (
                        <>
                          <Text style={[styles.juzMeta, { color: theme.textMuted }]}> · </Text>
                          <Text style={[styles.juzMeta, { color: getWeaknessRatingColor(Math.round(avgRating)) }]}>
                            Avg: {avgRating.toFixed(1)}
                          </Text>
                          {hasWeakPages && (
                            <>
                              <Text style={[styles.juzMeta, { color: theme.textMuted }]}> · </Text>
                              <Text style={[styles.juzMeta, { color: '#f59e0b' }]}>
                                {weakPages} weak
                              </Text>
                            </>
                          )}
                        </>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Checkbox - always visible and tappable */}
                <TouchableOpacity
                  style={styles.cardRight}
                  onPress={() => handleToggleJuz(juzNumber)}
                  activeOpacity={0.6}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {isPartial && (
                    <Text style={[styles.progressText, { color: theme.textMuted }]}>
                      {memorizedCount}/{totalPages}
                    </Text>
                  )}
                  <View style={[
                    styles.checkbox,
                    { backgroundColor: theme.bg, borderColor: theme.border },
                    isComplete && { backgroundColor: theme.bgDark, borderColor: theme.bgDark },
                    isPartial && { backgroundColor: theme.warningBg, borderColor: theme.warning },
                  ]}>
                    {isComplete && <Text style={[styles.checkmark, { color: theme.textInverse }]}>✓</Text>}
                    {isPartial && <Text style={[styles.partialMark, { color: theme.warningText }]}>−</Text>}
                  </View>
                </TouchableOpacity>
              </View>

              {/* Progress bar for partial */}
              {isPartial && (
                <View style={[styles.juzProgressBar, { backgroundColor: theme.border }]}>
                  <View style={[styles.juzProgressFill, { width: `${progress * 100}%`, backgroundColor: theme.warning }]} />
                </View>
              )}

              {/* Expanded Surah Details */}
              {isExpanded && (
                <View style={[styles.expandedSection, { borderTopColor: theme.border }]}>
                  <Text style={[styles.expandedLabel, { color: theme.textMuted }]}>
                    Tap surahs to mark as memorized
                  </Text>

                  <View style={styles.surahList}>
                    {surahs.map((surah) => {
                      const surahMemorized = getSurahMemorizedCount(surah);
                      const surahTotal = surah.pagesInJuz.length;
                      const isSurahComplete = surahMemorized === surahTotal;
                      const isSurahPartial = surahMemorized > 0 && surahMemorized < surahTotal;
                      const surahKey = `${juzNumber}-${surah.number}`;
                      const isSurahExpanded = expandedSurah === surahKey;

                      return (
                        <View key={surah.number}>
                          <View style={[
                            styles.surahItem,
                            { backgroundColor: theme.bg, borderColor: theme.border },
                            isSurahComplete && { backgroundColor: theme.bgDark, borderColor: theme.bgDark },
                            isSurahPartial && { backgroundColor: theme.warningBg, borderColor: theme.warning },
                          ]}>
                            {/* Surah info - tap to expand pages */}
                            <TouchableOpacity
                              style={styles.surahInfo}
                              onPress={() => handleToggleSurahExpand(juzNumber, surah.number)}
                              activeOpacity={0.7}
                            >
                              <Text style={[
                                styles.surahNumber,
                                { color: theme.textMuted },
                              ]}>
                                {surah.number}
                              </Text>
                              <View style={styles.surahNames}>
                                <Text style={[
                                  styles.surahNameArabic,
                                  { color: theme.textPrimary },
                                  isSurahComplete && { color: theme.textInverse },
                                ]}>
                                  {surah.nameArabic}
                                </Text>
                                <Text style={[
                                  styles.surahNameEnglish,
                                  { color: theme.textMuted },
                                ]}>
                                  {surah.name} · {surahMemorized}/{surahTotal}
                                </Text>
                              </View>
                              <Ionicons
                                name={isSurahExpanded ? 'chevron-up' : 'chevron-down'}
                                size={16}
                                color={theme.textMuted}
                              />
                            </TouchableOpacity>

                            {/* Checkbox - tap to toggle all pages */}
                            <TouchableOpacity
                              style={styles.surahRight}
                              onPress={() => handleToggleSurah(juzNumber, surah.number)}
                              activeOpacity={0.6}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <View style={[
                                styles.surahCheck,
                                { backgroundColor: theme.bg, borderColor: theme.border },
                                isSurahComplete && { backgroundColor: theme.textInverse, borderColor: theme.textInverse },
                                isSurahPartial && { backgroundColor: theme.warningBg, borderColor: theme.warning },
                              ]}>
                                {isSurahComplete && <Text style={[styles.surahCheckmark, { color: theme.bgDark }]}>✓</Text>}
                                {isSurahPartial && <Text style={[styles.surahPartialMark, { color: theme.warningText }]}>−</Text>}
                              </View>
                            </TouchableOpacity>
                          </View>

                          {/* Page-level selection */}
                          {isSurahExpanded && (
                            <View style={[styles.pagesList, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                              <Text style={[styles.pagesHint, { color: theme.textMuted }]}>
                                Select individual pages:
                              </Text>
                              <View style={styles.pagesGrid}>
                                {surah.pagesInJuz.map((pageNum) => {
                                  const page = pages.find(p => p.pageNumber === pageNum);
                                  const isPageMemorized = page?.status === 'memorized';
                                  const pageRating = page?.weaknessRating ?? 4;
                                  const ratingColor = getWeaknessRatingColor(pageRating);
                                  const isWeak = isPageMemorized && pageRating <= 2;

                                  return (
                                    <TouchableOpacity
                                      key={pageNum}
                                      style={[
                                        styles.pageChip,
                                        { backgroundColor: theme.bgAlt, borderColor: theme.border },
                                        isPageMemorized && { 
                                          backgroundColor: theme.bgDark, 
                                          borderColor: isWeak ? ratingColor : theme.bgDark,
                                          borderWidth: isWeak ? 2 : 1,
                                        },
                                      ]}
                                      onPress={() => handleTogglePage(pageNum)}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={[
                                        styles.pageChipText,
                                        { color: theme.textSecondary },
                                        isPageMemorized && { 
                                          color: isWeak ? ratingColor : theme.textInverse,
                                          fontWeight: isWeak ? '600' : '500',
                                        },
                                      ]}>
                                        {pageNum}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.quickActions}>
                    <TouchableOpacity
                      style={[styles.quickAction, { backgroundColor: theme.bg, borderColor: theme.border }]}
                      onPress={() => handleClearJuz(juzNumber)}
                    >
                      <Text style={[styles.quickActionText, { color: theme.textSecondary }]}>Clear All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickAction, { backgroundColor: theme.bgDark, borderColor: theme.bgDark }]}
                      onPress={() => handleToggleJuz(juzNumber)}
                    >
                      <Text style={[styles.quickActionText, { color: theme.textInverse }]}>
                        {isComplete ? 'Unmark All' : 'Mark All Complete'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {/* Footer summary */}
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            {stats.totalMemorized} of 604 pages memorized
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  statsContainer: {
    borderRadius: 24,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: spacing.xl,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 11,
    alignItems: 'center',
  },
  toggleButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  statsMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  statsNumber: {
    fontSize: 64,
    fontWeight: '700',
    letterSpacing: -2,
  },
  statsDivider: {
    fontSize: 40,
    fontWeight: '300',
    marginHorizontal: spacing.xs,
  },
  statsTotal: {
    fontSize: 32,
    fontWeight: '500',
  },
  progressSection: {
    gap: spacing.md,
  },
  progressTrack: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  progressGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    opacity: 0.3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPercent: {
    fontSize: 15,
    fontWeight: '600',
  },
  progressRemaining: {
    ...typography.bodySmall,
  },
  insightsSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
  },
  insightsLabel: {
    ...typography.label,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  insightsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightItem: {
    flex: 1,
    alignItems: 'center',
  },
  insightValue: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  insightLabel: {
    ...typography.bodySmall,
  },
  insightDivider: {
    width: 1,
    height: 40,
    marginHorizontal: spacing.lg,
  },
  weakPagesSection: {
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  weakPagesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  weakPagesTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  weakPagesText: {
    ...typography.bodySmall,
  },
  card: {
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
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  juzNumberText: {
    ...typography.bodyLarge,
    fontWeight: '600',
  },
  cardInfo: {
    flex: 1,
  },
  juzName: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  juzMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 2,
  },
  juzMeta: {
    ...typography.bodySmall,
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
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 16,
    fontWeight: '700',
  },
  partialMark: {
    fontSize: 18,
    fontWeight: '700',
  },
  juzProgressBar: {
    height: 3,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 2,
  },
  juzProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  expandedSection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    paddingTop: spacing.md,
  },
  expandedLabel: {
    ...typography.bodySmall,
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
    borderRadius: 8,
    padding: spacing.sm,
    borderWidth: 1,
  },
  surahInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  surahNumber: {
    ...typography.bodySmall,
    width: 28,
    textAlign: 'center',
  },
  surahNames: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  surahNameArabic: {
    ...typography.bodyMedium,
    fontWeight: '500',
  },
  surahNameEnglish: {
    ...typography.bodySmall,
  },
  surahRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  surahCheck: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  surahCheckmark: {
    fontSize: 12,
    fontWeight: '700',
  },
  surahPartialMark: {
    fontSize: 14,
    fontWeight: '700',
  },
  pagesList: {
    marginLeft: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 2,
  },
  pagesHint: {
    ...typography.bodySmall,
    marginBottom: spacing.sm,
  },
  pagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pageChip: {
    width: 44,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageChipText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickAction: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickActionText: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  footer: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerText: {
    ...typography.bodyMedium,
  },
});
