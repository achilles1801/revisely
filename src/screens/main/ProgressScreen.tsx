import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState } from '../../components/EmptyState';
import { GlassCard } from '../../components/GlassCard';
import { LiquidGlassSegmentedControl } from '../../components/LiquidGlassSegmentedControl';
import { PressableScale } from '../../components/PressableScale';
import { useTabBarFootprint } from '../../components/LiquidGlassTabBar';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { getPagesForJuz, getSurahsInJuz } from '../../lib/quranData';

type StatMode = 'juz' | 'pages' | 'surahs';

function formatFractional(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

export default function ProgressScreen() {
  const { pages, loadData } = useApp();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const tabFootprint = useTabBarFootprint();
  const [refreshing, setRefreshing] = useState(false);
  const [statMode, setStatMode] = useState<StatMode>('juz');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const stats = useMemo(() => {
    let completeJuz = 0;
    let fractionalJuz = 0;
    let totalMemorized = 0;
    const completedSurahs = new Set<number>();

    const isMemorized = (pn: number) =>
      pages.find((p) => p.pageNumber === pn)?.status === 'memorized';

    for (let i = 1; i <= 30; i++) {
      const juzPages = getPagesForJuz(i);
      let memorizedCount = 0;
      for (const pn of juzPages) if (isMemorized(pn)) memorizedCount++;
      totalMemorized += memorizedCount;
      if (juzPages.length > 0) fractionalJuz += memorizedCount / juzPages.length;
      if (memorizedCount === juzPages.length) completeJuz++;

      const surahs = getSurahsInJuz(i);
      for (const surah of surahs) {
        let surahMemorized = 0;
        for (const pn of surah.pagesInJuz) if (isMemorized(pn)) surahMemorized++;
        if (surahMemorized === surah.pagesInJuz.length) {
          completedSurahs.add(surah.number);
        }
      }
    }

    return {
      completeJuz,
      fractionalJuz,
      totalMemorized,
      completedSurahs: completedSurahs.size,
    };
  }, [pages]);

  const totalMemorized = pages.filter((p) => p.status === 'memorized').length;

  if (pages.length > 0 && totalMemorized === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Progress</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Track what you've memorized
            </Text>
          </View>
          <PressableScale
            onPress={() =>
              navigation.navigate('Home', { screen: 'Memorization' })
            }
            haptic="medium"
            scale={0.985}
          >
            <GlassCard
              glassStyle="clear"
              specular
              tintColor={isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)'}
              style={styles.entryCard}
            >
              <View style={styles.entryIcon}>
                <Ionicons name="book-outline" size={22} color={theme.accent} />
              </View>
              <View style={styles.entryMain}>
                <Text style={[styles.entryTitle, { color: theme.textPrimary }]}>
                  Start tracking memorization
                </Text>
                <Text style={[styles.entrySub, { color: theme.textSecondary }]}>
                  Mark surahs, juz, or pages you already know.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.textMuted}
              />
            </GlassCard>
          </PressableScale>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const headlineNumber =
    statMode === 'juz'
      ? formatFractional(stats.fractionalJuz)
      : statMode === 'surahs'
        ? `${stats.completedSurahs}`
        : `${stats.totalMemorized}`;
  const headlineTotal =
    statMode === 'juz' ? '30' : statMode === 'surahs' ? '114' : '604';
  const percent =
    statMode === 'juz'
      ? (stats.completeJuz / 30) * 100
      : statMode === 'surahs'
        ? (stats.completedSurahs / 114) * 100
        : (stats.totalMemorized / 604) * 100;
  const remaining =
    statMode === 'juz'
      ? 30 - stats.completeJuz
      : statMode === 'surahs'
        ? 114 - stats.completedSurahs
        : 604 - stats.totalMemorized;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabFootprint + spacing.xl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Progress</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Track what you've memorized
          </Text>
        </View>

        {/* Overall stats */}
        <GlassCard
          glassStyle="clear"
          specular
          tintColor={isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)'}
          style={styles.card}
        >
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>OVERALL</Text>

          <View style={styles.segmentedWrap}>
            <LiquidGlassSegmentedControl<StatMode>
              options={[
                { value: 'juz', label: 'Juz' },
                { value: 'surahs', label: 'Surahs' },
                { value: 'pages', label: 'Pages' },
              ]}
              value={statMode}
              onChange={setStatMode}
            />
          </View>

          <View style={styles.statsMain}>
            <Text style={[styles.statsNumber, { color: theme.textPrimary }]}>
              {headlineNumber}
            </Text>
            <Text style={[styles.statsDivider, { color: theme.textMuted }]}>/</Text>
            <Text style={[styles.statsTotal, { color: theme.textMuted }]}>
              {headlineTotal}
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: theme.accent,
                  width: `${percent}%`,
                },
              ]}
            />
          </View>

          <View style={styles.progressLabels}>
            <Text style={[styles.progressPercent, { color: theme.textPrimary }]}>
              {Math.round(percent)}%
            </Text>
            <Text style={[styles.progressRemaining, { color: theme.textMuted }]}>
              {remaining} to go
            </Text>
          </View>
        </GlassCard>

        {/* Memorization entry — full-screen browser lives in its own screen */}
        <PressableScale
          onPress={() =>
            navigation.navigate('Home', { screen: 'Memorization' })
          }
          haptic="medium"
          scale={0.985}
        >
          <GlassCard
            glassStyle="clear"
            specular
            tintColor={isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)'}
            style={styles.entryCard}
          >
            <View style={styles.entryIcon}>
              <Ionicons name="book-outline" size={22} color={theme.accent} />
            </View>
            <View style={styles.entryMain}>
              <Text style={[styles.entryTitle, { color: theme.textPrimary }]}>
                Manage memorized pages
              </Text>
              <Text style={[styles.entrySub, { color: theme.textSecondary }]}>
                Browse by chapter, juz, or hizb and update what you've memorized.
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={theme.textMuted}
            />
          </GlassCard>
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  header: { marginBottom: spacing.lg },
  title: {
    ...typography.displaySmall,
    marginBottom: spacing.xs,
  },
  subtitle: { ...typography.bodyMedium },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  segmentedWrap: {
    marginBottom: spacing.md,
  },
  statsMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  statsNumber: {
    ...typography.statValue,
    fontSize: 56,
    lineHeight: 60,
  },
  statsDivider: {
    ...typography.titleLarge,
  },
  statsTotal: {
    ...typography.titleLarge,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPercent: {
    ...typography.titleSmall,
    fontWeight: '700',
  },
  progressRemaining: {
    ...typography.bodySmall,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  entryIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,107,90,0.12)',
  },
  entryMain: { flex: 1 },
  entryTitle: {
    ...typography.titleMedium,
    marginBottom: 2,
  },
  entrySub: {
    ...typography.caption,
    lineHeight: 16,
  },
});
