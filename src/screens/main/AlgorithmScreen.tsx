import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { calculatePageUrgency } from '../../lib/algorithm';
import { getQuranData } from '../../lib/quranData';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface PageUrgencyData {
  pageNumber: number;
  juzNumber: number;
  urgency: number;
  weaknessRating: number;
  components: {
    timeUrgency: number;
    recencyMultiplier: number;
    weaknessMultiplier: number;
    skipPenalty: number;
  };
  daysSinceRevision: number;
  isDanger: boolean;
}

export default function AlgorithmScreen() {
  const { theme } = useTheme();
  const { user, pages, loadData } = useApp();
  const quranData = getQuranData();

  const [expandedPage, setExpandedPage] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Calculate urgency for all memorized pages with breakdown
  const pageUrgencies = useMemo((): PageUrgencyData[] => {
    if (!user) return [];

    const today = new Date();

    return pages
      .filter(p => p.status === 'memorized' && p.lastRevisedDate)
      .map(page => {
        const lastRevised = new Date(page.lastRevisedDate!);
        const daysSinceRevision = Math.floor(
          (today.getTime() - lastRevised.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Calculate individual components
        const timeUrgency = daysSinceRevision / user.dangerThresholdDays;

        let recencyMultiplier = 1.0;
        if (page.dateMemorized) {
          const dateMemorized = new Date(page.dateMemorized);
          const daysSinceMemorized = Math.floor(
            (today.getTime() - dateMemorized.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceMemorized < 30) {
            recencyMultiplier = 2.0 - (daysSinceMemorized / 30);
          }
        }

        const weaknessMultiplier = (6 - page.weaknessRating) / 5;
        const skipPenalty = 1 + (page.skipCount * 0.2);

        const quranPage = quranData.find(q => q.pageNumber === page.pageNumber);
        const urgency = calculatePageUrgency(page, user, today);

        return {
          pageNumber: page.pageNumber,
          juzNumber: quranPage?.juzNumber || 0,
          urgency,
          weaknessRating: page.weaknessRating,
          components: {
            timeUrgency,
            recencyMultiplier,
            weaknessMultiplier,
            skipPenalty,
          },
          daysSinceRevision,
          isDanger: daysSinceRevision > user.dangerThresholdDays,
        };
      })
      .sort((a, b) => b.urgency - a.urgency);
  }, [user, pages, quranData]);

  // Get top N based on daily capacity
  const topPages = useMemo(() => {
    if (!user) return [];
    return pageUrgencies.slice(0, user.dailyPageCapacity);
  }, [pageUrgencies, user]);

  // Calculate juz-level coverage and danger stats
  const juzStats = useMemo(() => {
    const stats = new Map<number, { total: number; danger: number; avgUrgency: number }>();

    for (let juz = 1; juz <= 30; juz++) {
      const juzPages = pageUrgencies.filter(p => p.juzNumber === juz);
      const dangerPages = juzPages.filter(p => p.isDanger);
      const avgUrgency = juzPages.length > 0
        ? juzPages.reduce((sum, p) => sum + p.urgency, 0) / juzPages.length
        : 0;

      stats.set(juz, {
        total: juzPages.length,
        danger: dangerPages.length,
        avgUrgency,
      });
    }

    return stats;
  }, [pageUrgencies]);

  // Get max urgency for heatmap scaling
  const maxUrgency = useMemo(() => {
    return Math.max(...pageUrgencies.map(p => p.urgency), 1);
  }, [pageUrgencies]);

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dangerCount = pageUrgencies.filter(p => p.isDanger).length;

  // Helper function to get weakness rating color
  const getWeaknessRatingColor = (rating: number): string => {
    if (rating === 1) return '#ef4444'; // Cannot recall - red
    if (rating === 2) return '#f59e0b'; // Major difficulty - amber
    if (rating === 3) return '#eab308'; // Some hesitation - yellow
    if (rating === 4) return '#84cc16'; // Mostly smooth - lime
    if (rating === 5) return '#22c55e'; // Completely solid - green
    return '#9ca3af'; // Default gray
  };

  const getWeaknessLabel = (rating: number): string => {
    if (rating === 1) return 'Cannot recall';
    if (rating === 2) return 'Major difficulty';
    if (rating === 3) return 'Some hesitation';
    if (rating === 4) return 'Mostly smooth';
    if (rating === 5) return 'Completely solid';
    return 'Not rated';
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Algorithm Insights</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            How your pages are prioritized
          </Text>
        </View>

        {/* System Parameters Card */}
        <Card style={StyleSheet.flatten([styles.card, { backgroundColor: theme.bgAlt, borderColor: theme.border }])}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>SYSTEM PARAMETERS</Text>

          <View style={styles.paramRow}>
            <View style={styles.paramItem}>
              <Text style={[styles.paramValue, { color: theme.textPrimary }]}>
                {user.dangerThresholdDays}
              </Text>
              <Text style={[styles.paramLabel, { color: theme.textSecondary }]}>
                Danger Threshold (days)
              </Text>
            </View>
            <View style={styles.paramItem}>
              <Text style={[styles.paramValue, { color: theme.textPrimary }]}>
                {user.dailyPageCapacity}
              </Text>
              <Text style={[styles.paramLabel, { color: theme.textSecondary }]}>
                Daily Capacity (pages)
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.paramRow}>
            <View style={styles.paramItem}>
              <Text style={[styles.paramValue, { color: theme.textPrimary }]}>
                {pageUrgencies.length}
              </Text>
              <Text style={[styles.paramLabel, { color: theme.textSecondary }]}>
                Memorized Pages
              </Text>
            </View>
            <View style={styles.paramItem}>
              <Text style={[styles.paramValue, { color: dangerCount > 0 ? theme.warning : theme.success }]}>
                {dangerCount}
              </Text>
              <Text style={[styles.paramLabel, { color: theme.textSecondary }]}>
                In Danger Zone
              </Text>
            </View>
          </View>
        </Card>

        {/* Weakness Rating Summary */}
        {pageUrgencies.length > 0 && (
          <Card style={StyleSheet.flatten([styles.card, { backgroundColor: theme.bgAlt, borderColor: theme.border }])}>
            <Text style={[styles.cardLabel, { color: theme.textMuted }]}>WEAKNESS RATING SUMMARY</Text>
            
            {(() => {
              const memorizedPages = pages.filter(p => p.status === 'memorized');
              const ratingCounts = [0, 0, 0, 0, 0]; // Counts for ratings 1-5
              let totalRatingSum = 0;
              
              memorizedPages.forEach(page => {
                const rating = page.weaknessRating;
                if (rating >= 1 && rating <= 5) {
                  ratingCounts[rating - 1]++;
                  totalRatingSum += rating;
                }
              });
              
              const avgRating = memorizedPages.length > 0 
                ? Math.round((totalRatingSum / memorizedPages.length) * 10) / 10 
                : 0;
              const weakPages = ratingCounts[0] + ratingCounts[1]; // Ratings 1-2
              
              return (
                <>
                  <View style={styles.paramRow}>
                    <View style={styles.paramItem}>
                      <Text style={[styles.paramValue, { color: getWeaknessRatingColor(Math.round(avgRating)) }]}>
                        {avgRating.toFixed(1)}
                      </Text>
                      <Text style={[styles.paramLabel, { color: theme.textSecondary }]}>
                        Average Rating
                      </Text>
                    </View>
                    <View style={styles.paramItem}>
                      <Text style={[styles.paramValue, { color: weakPages > 0 ? '#f59e0b' : theme.success }]}>
                        {weakPages}
                      </Text>
                      <Text style={[styles.paramLabel, { color: theme.textSecondary }]}>
                        Need Practice
                      </Text>
                    </View>
                  </View>
                  
                  {/* Rating Distribution */}
                  <View style={[styles.divider, { backgroundColor: theme.border }]} />
                  <Text style={[styles.cardSubtitle, { color: theme.textSecondary, marginBottom: spacing.md }]}>
                    Rating Distribution
                  </Text>
                  <View style={styles.ratingDistribution}>
                    {[5, 4, 3, 2, 1].map((rating) => {
                      const count = ratingCounts[rating - 1];
                      const percentage = memorizedPages.length > 0 
                        ? (count / memorizedPages.length) * 100 
                        : 0;
                      
                      return (
                        <View key={rating} style={styles.ratingBarItem}>
                          <View style={styles.ratingBarLabel}>
                            <View style={[styles.ratingDot, { backgroundColor: getWeaknessRatingColor(rating) }]} />
                            <Text style={[styles.ratingLabel, { color: theme.textSecondary }]}>
                              {rating} - {getWeaknessLabel(rating)}
                            </Text>
                          </View>
                          <View style={[styles.ratingBarContainer, { backgroundColor: theme.border }]}>
                            <View 
                              style={[
                                styles.ratingBarFill, 
                                { 
                                  width: `${percentage}%`, 
                                  backgroundColor: getWeaknessRatingColor(rating) 
                                }
                              ]} 
                            />
                          </View>
                          <Text style={[styles.ratingCount, { color: theme.textMuted }]}>
                            {count}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              );
            })()}
          </Card>
        )}

        {/* Juz Heatmap */}
        <Card style={StyleSheet.flatten([styles.card, { backgroundColor: theme.bgAlt, borderColor: theme.border }])}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>JUZ COVERAGE HEATMAP</Text>
          <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
            Urgency level across all 30 juz
          </Text>

          <View style={styles.heatmapGrid}>
            {Array.from({ length: 30 }, (_, i) => i + 1).map(juz => {
              const stat = juzStats.get(juz);
              const hasPages = (stat?.total || 0) > 0;
              const hasDanger = (stat?.danger || 0) > 0;
              const urgency = stat?.avgUrgency || 0;

              // Calculate opacity based on urgency
              const opacity = hasPages ? Math.min(urgency / maxUrgency, 1) : 0;

              let backgroundColor = theme.border;
              if (hasPages) {
                backgroundColor = hasDanger ? theme.warning : theme.textMuted;
              }

              return (
                <View
                  key={juz}
                  style={[
                    styles.heatmapCell,
                    {
                      backgroundColor,
                      opacity: hasPages ? Math.max(opacity, 0.15) : 0.1,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.heatmapCellText,
                      {
                        color: hasPages && urgency > maxUrgency * 0.5 ? '#fff' : theme.textMuted,
                      },
                    ]}
                  >
                    {juz}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.heatmapLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.textMuted, opacity: 0.2 }]} />
              <Text style={[styles.legendText, { color: theme.textSecondary }]}>Low urgency</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.warning }]} />
              <Text style={[styles.legendText, { color: theme.textSecondary }]}>Danger zone</Text>
            </View>
          </View>
        </Card>

        {/* Top Priority Pages */}
        <Card style={StyleSheet.flatten([styles.card, { backgroundColor: theme.bgAlt, borderColor: theme.border }])}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>TODAY'S PRIORITY QUEUE</Text>
          <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
            Top {topPages.length} pages by urgency score
          </Text>

          {topPages.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              No pages scheduled for today
            </Text>
          ) : (
            <View style={styles.pageList}>
              {topPages.map((page, index) => {
                const isExpanded = expandedPage === page.pageNumber;

                return (
                  <View key={page.pageNumber}>
                    <TouchableOpacity
                      style={[
                        styles.pageRow,
                        { borderLeftColor: page.isDanger ? theme.warning : theme.success },
                      ]}
                      onPress={() => setExpandedPage(isExpanded ? null : page.pageNumber)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pageRowHeader}>
                        <View style={styles.pageInfo}>
                          <Text style={[styles.pageRank, { color: theme.textMuted }]}>
                            #{index + 1}
                          </Text>
                          <Text style={[styles.pageNumber, { color: theme.textPrimary }]}>
                            Page {page.pageNumber}
                          </Text>
                          <Text style={[styles.juzBadge, { color: theme.textSecondary }]}>
                            Juz {page.juzNumber}
                          </Text>
                          <View style={[styles.weaknessIndicator, { backgroundColor: getWeaknessRatingColor(page.weaknessRating) + '20', borderColor: getWeaknessRatingColor(page.weaknessRating) }]}>
                            <Text style={[styles.weaknessIndicatorText, { color: getWeaknessRatingColor(page.weaknessRating) }]}>
                              {page.weaknessRating}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.pageScore}>
                          <Text style={[styles.urgencyScore, { color: theme.textPrimary }]}>
                            {page.urgency.toFixed(2)}
                          </Text>
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={theme.textMuted}
                          />
                        </View>
                      </View>

                      {isExpanded && (
                        <View style={styles.pageBreakdown}>
                          <View style={[styles.breakdownDivider, { backgroundColor: theme.border }]} />

                          <View style={styles.breakdownRow}>
                            <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
                              Time Urgency
                            </Text>
                            <Text style={[styles.breakdownValue, { color: theme.textPrimary }]}>
                              {page.components.timeUrgency.toFixed(2)}
                            </Text>
                          </View>
                          <Text style={[styles.breakdownHint, { color: theme.textMuted }]}>
                            {page.daysSinceRevision} days since last revision
                          </Text>

                          <View style={styles.breakdownRow}>
                            <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
                              Recency Multiplier
                            </Text>
                            <Text style={[styles.breakdownValue, { color: theme.textPrimary }]}>
                              {page.components.recencyMultiplier.toFixed(2)}x
                            </Text>
                          </View>
                          <Text style={[styles.breakdownHint, { color: theme.textMuted }]}>
                            {page.components.recencyMultiplier > 1
                              ? 'Recently memorized - needs extra attention'
                              : 'Stable memorization'}
                          </Text>

                          <View style={styles.breakdownRow}>
                            <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
                              Weakness Rating
                            </Text>
                            <View style={styles.weaknessRatingDisplay}>
                              <Text style={[styles.breakdownValue, { color: getWeaknessRatingColor(page.weaknessRating) }]}>
                                {page.weaknessRating}/5
                              </Text>
                              <View style={[styles.weaknessRatingBadge, { backgroundColor: getWeaknessRatingColor(page.weaknessRating) + '20' }]}>
                                <Text style={[styles.weaknessRatingText, { color: getWeaknessRatingColor(page.weaknessRating) }]}>
                                  {getWeaknessLabel(page.weaknessRating)}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.breakdownRow}>
                            <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
                              Weakness Multiplier
                            </Text>
                            <Text style={[styles.breakdownValue, { color: theme.textPrimary }]}>
                              {page.components.weaknessMultiplier.toFixed(2)}x
                            </Text>
                          </View>
                          <Text style={[styles.breakdownHint, { color: theme.textMuted }]}>
                            {page.components.weaknessMultiplier > 0.6
                              ? 'Higher weakness - prioritized for revision'
                              : 'Strong retention - lower priority'}
                          </Text>

                          <View style={styles.breakdownRow}>
                            <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
                              Skip Penalty
                            </Text>
                            <Text style={[styles.breakdownValue, { color: theme.textPrimary }]}>
                              {page.components.skipPenalty.toFixed(2)}x
                            </Text>
                          </View>
                          <Text style={[styles.breakdownHint, { color: theme.textMuted }]}>
                            {page.components.skipPenalty > 1
                              ? 'Previously skipped - boosted priority'
                              : 'No skip history'}
                          </Text>

                          <View style={[styles.formulaBox, { backgroundColor: theme.bg }]}>
                            <Text style={[styles.formulaLabel, { color: theme.textMuted }]}>
                              Final Score =
                            </Text>
                            <Text style={[styles.formulaText, { color: theme.textSecondary }]}>
                              {page.components.timeUrgency.toFixed(2)} × {page.components.recencyMultiplier.toFixed(2)} × {page.components.weaknessMultiplier.toFixed(2)} × {page.components.skipPenalty.toFixed(2)}
                            </Text>
                            <Text style={[styles.formulaResult, { color: theme.textPrimary }]}>
                              = {page.urgency.toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* How it Works */}
        <Card style={StyleSheet.flatten([styles.card, { backgroundColor: theme.bgAlt, borderColor: theme.border }])}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>HOW IT WORKS</Text>

          <View style={styles.explanationItem}>
            <View style={[styles.explanationBullet, { backgroundColor: theme.textPrimary }]} />
            <View style={styles.explanationContent}>
              <Text style={[styles.explanationTitle, { color: theme.textPrimary }]}>
                Time Urgency
              </Text>
              <Text style={[styles.explanationText, { color: theme.textSecondary }]}>
                Pages approach danger as days since revision increase. Crosses 1.0 at your danger threshold ({user.dangerThresholdDays} days).
              </Text>
            </View>
          </View>

          <View style={styles.explanationItem}>
            <View style={[styles.explanationBullet, { backgroundColor: theme.textPrimary }]} />
            <View style={styles.explanationContent}>
              <Text style={[styles.explanationTitle, { color: theme.textPrimary }]}>
                Recency Boost
              </Text>
              <Text style={[styles.explanationText, { color: theme.textSecondary }]}>
                Newly memorized pages (under 30 days) get 1.0-2.0x multiplier for reinforcement.
              </Text>
            </View>
          </View>

          <View style={styles.explanationItem}>
            <View style={[styles.explanationBullet, { backgroundColor: theme.textPrimary }]} />
            <View style={styles.explanationContent}>
              <Text style={[styles.explanationTitle, { color: theme.textPrimary }]}>
                Weakness Priority
              </Text>
              <Text style={[styles.explanationText, { color: theme.textSecondary }]}>
                Your 1-5 weakness ratings directly affect urgency. Lower ratings (1-2: Cannot recall/Major difficulty) get highest priority multipliers. Rating of 1 gets 1.0x multiplier, rating of 5 gets 0.2x multiplier.
              </Text>
            </View>
          </View>

          <View style={styles.explanationItem}>
            <View style={[styles.explanationBullet, { backgroundColor: theme.textPrimary }]} />
            <View style={styles.explanationContent}>
              <Text style={[styles.explanationTitle, { color: theme.textPrimary }]}>
                Skip Prevention
              </Text>
              <Text style={[styles.explanationText, { color: theme.textSecondary }]}>
                Each skip adds 0.2x multiplier to prevent repeatedly postponing the same pages.
              </Text>
            </View>
          </View>
        </Card>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.bodyMedium,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.displaySmall,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodyMedium,
  },
  card: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderWidth: 1,
  },
  cardLabel: {
    ...typography.label,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...typography.bodySmall,
    marginBottom: spacing.lg,
  },
  paramRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  paramItem: {
    flex: 1,
  },
  paramValue: {
    ...typography.displayMedium,
    marginBottom: spacing.xs,
  },
  paramLabel: {
    ...typography.bodySmall,
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  heatmapCell: {
    width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.lg * 2 - spacing.xs * 5) / 6,
    aspectRatio: 1,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heatmapCellText: {
    ...typography.bodySmall,
    fontSize: 11,
    fontWeight: '600',
  },
  heatmapLegend: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 0,
  },
  legendText: {
    ...typography.bodySmall,
  },
  pageList: {
    gap: spacing.md,
  },
  pageRow: {
    padding: spacing.md,
    borderLeftWidth: 3,
  },
  pageRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  pageRank: {
    ...typography.bodySmall,
    fontWeight: '600',
    width: 28,
  },
  pageNumber: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  juzBadge: {
    ...typography.bodySmall,
  },
  pageScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  urgencyScore: {
    ...typography.bodyLarge,
    fontWeight: '600',
  },
  pageBreakdown: {
    marginTop: spacing.md,
  },
  breakdownDivider: {
    height: 1,
    marginBottom: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  breakdownLabel: {
    ...typography.bodySmall,
  },
  breakdownValue: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  breakdownHint: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  formulaBox: {
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  formulaLabel: {
    ...typography.label,
    marginBottom: spacing.xs,
  },
  formulaText: {
    ...typography.bodySmall,
    fontFamily: 'Courier',
    marginBottom: spacing.xs,
  },
  formulaResult: {
    ...typography.bodyMedium,
    fontWeight: '600',
    fontFamily: 'Courier',
  },
  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  explanationItem: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  explanationBullet: {
    width: 6,
    height: 6,
    marginTop: 6,
  },
  explanationContent: {
    flex: 1,
  },
  explanationTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  explanationText: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
  weaknessRatingDisplay: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  weaknessRatingBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  weaknessRatingText: {
    ...typography.bodySmall,
    fontSize: 10,
    fontWeight: '500',
  },
  weaknessIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weaknessIndicatorText: {
    ...typography.bodySmall,
    fontSize: 11,
    fontWeight: '700',
  },
  ratingDistribution: {
    gap: spacing.sm,
  },
  ratingBarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ratingBarLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    width: 140,
  },
  ratingDot: {
    width: 8,
    height: 8,
  },
  ratingLabel: {
    ...typography.bodySmall,
    fontSize: 11,
  },
  ratingBarContainer: {
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
  },
  ratingCount: {
    ...typography.bodySmall,
    fontSize: 11,
    width: 30,
    textAlign: 'right',
  },
});
