import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import { Stepper } from '../../components/Stepper';
import { ProgressBar } from '../../components/ProgressBar';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useApp } from '../../context/AppContext';
import {
  getPagesForJuz,
  getJuzName,
  getSurahsInJuz,
  SurahInJuz,
} from '../../lib/quranData';
import { UserPage } from '../../types';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'JuzSelection'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'JuzSelection'>;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface JuzCardProps {
  juzNumber: number;
  name: string;
  memorizedCount: number;
  totalPages: number;
  isExpanded: boolean;
  surahs: SurahInJuz[];
  pages: UserPage[];
  theme: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onToggleJuz: () => void;
  onExpand: () => void;
  onToggleSurah: (surahNumber: number) => void;
  onClearAll: () => void;
}

function JuzCard({
  juzNumber,
  name,
  memorizedCount,
  totalPages,
  isExpanded,
  surahs,
  pages,
  theme,
  styles,
  onToggleJuz,
  onExpand,
  onToggleSurah,
  onClearAll,
}: JuzCardProps) {
  const isComplete = memorizedCount === totalPages;
  const isPartial = memorizedCount > 0 && memorizedCount < totalPages;
  const progress = totalPages > 0 ? (memorizedCount / totalPages) * 100 : 0;

  const getSurahMemorizedCount = (surah: SurahInJuz) =>
    surah.pagesInJuz.filter((pageNum) => {
      const page = pages.find((p) => p.pageNumber === pageNum);
      return page?.status === 'memorized';
    }).length;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <PressableScale
          onPress={onExpand}
          haptic="light"
          style={styles.cardContent}
          scale={0.99}
        >
          <View
            style={[
              styles.juzNumberWrap,
              isComplete && { backgroundColor: theme.accent },
              isPartial && { backgroundColor: theme.accentSoft },
            ]}
          >
            <Text
              style={[
                styles.juzNumberText,
                { color: isComplete ? theme.textInverse : isPartial ? theme.accent : theme.textSecondary },
              ]}
            >
              {juzNumber}
            </Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.juzName}>{name}</Text>
            <Text style={styles.pageRange}>
              {surahs.length} surah{surahs.length !== 1 ? 's' : ''} · {totalPages} pages
            </Text>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textMuted}
          />
        </PressableScale>

        <PressableScale
          onPress={onToggleJuz}
          haptic="medium"
          style={styles.checkboxWrap}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {isPartial && <Text style={styles.progressText}>{memorizedCount}/{totalPages}</Text>}
          <View
            style={[
              styles.checkbox,
              isComplete && { backgroundColor: theme.accent, borderColor: theme.accent },
              isPartial && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
            ]}
          >
            {isComplete && <Ionicons name="checkmark" size={16} color={theme.textInverse} />}
            {isPartial && <Ionicons name="remove" size={16} color={theme.accent} />}
          </View>
        </PressableScale>
      </View>

      {isPartial && (
        <View style={styles.progressBarRow}>
          <ProgressBar progress={progress} height={3} color={theme.accent} />
        </View>
      )}

      {isExpanded && (
        <View style={styles.expandedSection}>
          <Text style={styles.expandedLabel}>Tap surahs to mark as memorized</Text>

          <View style={styles.surahList}>
            {surahs.map((surah) => {
              const surahMemorized = getSurahMemorizedCount(surah);
              const surahTotal = surah.pagesInJuz.length;
              const isSurahComplete = surahMemorized === surahTotal;
              const isSurahPartial = surahMemorized > 0 && surahMemorized < surahTotal;

              return (
                <PressableScale
                  key={surah.number}
                  onPress={() => onToggleSurah(surah.number)}
                  haptic="selection"
                  scale={0.99}
                  style={[
                    styles.surahItem,
                    isSurahComplete && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                    isSurahPartial && { borderColor: theme.accent },
                  ]}
                >
                  <Text style={styles.surahNumber}>{surah.number}</Text>
                  <View style={styles.surahNames}>
                    <Text style={styles.surahNameArabic}>{surah.nameArabic}</Text>
                    <Text style={styles.surahNameEnglish}>{surah.name}</Text>
                  </View>
                  <Text style={styles.surahPages}>{surahTotal}p</Text>
                  <View
                    style={[
                      styles.surahCheck,
                      isSurahComplete && { backgroundColor: theme.accent, borderColor: theme.accent },
                      isSurahPartial && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                    ]}
                  >
                    {isSurahComplete && <Ionicons name="checkmark" size={12} color={theme.textInverse} />}
                    {isSurahPartial && <Ionicons name="remove" size={12} color={theme.accent} />}
                  </View>
                </PressableScale>
              );
            })}
          </View>

          <View style={styles.quickActions}>
            <PressableScale onPress={onClearAll} haptic="light" style={styles.quickAction}>
              <Text style={styles.quickActionText}>Clear all</Text>
            </PressableScale>
            <PressableScale
              onPress={onToggleJuz}
              haptic="medium"
              style={[styles.quickAction, styles.quickActionPrimary]}
            >
              <Text style={[styles.quickActionText, { color: theme.textInverse }]}>
                {isComplete ? 'Unmark all' : 'Mark all'}
              </Text>
            </PressableScale>
          </View>
        </View>
      )}
    </View>
  );
}

export default function JuzSelectionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { journeyStage } = route.params;
  const { pages, updatePages } = useApp();

  const [expandedJuz, setExpandedJuz] = useState<number | null>(null);

  useEffect(() => {
    if (journeyStage === 'complete' && pages.length > 0) {
      const allNotMemorized = pages.every((p) => p.status !== 'memorized');
      if (allNotMemorized) {
        const allMemorized = pages.map((p) => ({
          ...p,
          status: 'memorized' as const,
          dateMemorized: new Date().toISOString(),
        }));
        updatePages(allMemorized);
      }
    }
  }, [journeyStage, pages.length]);

  const getJuzStats = useCallback(
    (juzNumber: number) => {
      const juzPages = getPagesForJuz(juzNumber);
      const juzPageData = pages.filter((p) => juzPages.includes(p.pageNumber));
      const memorizedCount = juzPageData.filter((p) => p.status === 'memorized').length;
      return { memorizedCount, totalPages: juzPages.length };
    },
    [pages],
  );

  const handleToggleJuz = useCallback(
    (juz: number) => {
      const juzPageNumbers = getPagesForJuz(juz);
      const { memorizedCount, totalPages } = getJuzStats(juz);
      const isComplete = memorizedCount === totalPages;
      const updatedPages = pages.map((p) =>
        juzPageNumbers.includes(p.pageNumber)
          ? {
              ...p,
              status: (isComplete ? 'not_memorized' : 'memorized') as 'not_memorized' | 'memorized',
              dateMemorized: isComplete ? null : new Date().toISOString(),
            }
          : p,
      );
      updatePages(updatedPages, juzPageNumbers);
    },
    [pages, getJuzStats, updatePages],
  );

  const handleClearJuz = useCallback(
    (juz: number) => {
      const juzPageNumbers = getPagesForJuz(juz);
      const updatedPages = pages.map((p) =>
        juzPageNumbers.includes(p.pageNumber)
          ? { ...p, status: 'not_memorized' as const, dateMemorized: null }
          : p,
      );
      updatePages(updatedPages, juzPageNumbers);
    },
    [pages, updatePages],
  );

  const handleExpandJuz = useCallback(
    (juz: number) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedJuz(expandedJuz === juz ? null : juz);
    },
    [expandedJuz],
  );

  const handleToggleSurah = useCallback(
    (juz: number, surahNumber: number) => {
      const surahs = getSurahsInJuz(juz);
      const surah = surahs.find((s) => s.number === surahNumber);
      if (!surah) return;
      const surahPagesInJuz = surah.pagesInJuz;
      const memorizedCount = surahPagesInJuz.filter((pageNum) => {
        const page = pages.find((p) => p.pageNumber === pageNum);
        return page?.status === 'memorized';
      }).length;
      const isComplete = memorizedCount === surahPagesInJuz.length;
      const updatedPages = pages.map((p) =>
        surahPagesInJuz.includes(p.pageNumber)
          ? {
              ...p,
              status: (isComplete ? 'not_memorized' : 'memorized') as 'not_memorized' | 'memorized',
              dateMemorized: isComplete ? null : new Date().toISOString(),
            }
          : p,
      );
      updatePages(updatedPages, surahPagesInJuz);
    },
    [pages, updatePages],
  );

  const handleContinue = () => {
    navigation.navigate('Schedule', {
      journeyStage,
      currentJuz: undefined,
      currentPage: undefined,
    });
  };

  const totalMemorized = pages.filter((p) => p.status === 'memorized').length;

  const headlineText =
    journeyStage === 'beginning' ? 'What have you memorized?' : 'Select memorized portions';
  const instructionText =
    journeyStage === 'beginning'
      ? 'Tap a juz to expand and select surahs.'
      : journeyStage === 'in_progress'
      ? 'Mark your completed surahs and juz.'
      : 'All marked as memorized — adjust if needed.';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <PressableScale
            onPress={() => navigation.goBack()}
            haptic="light"
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.textSecondary} />
          </PressableScale>
          <Stepper total={4} current={2} />
        </View>
        <Text style={styles.headline}>{headlineText}</Text>
        <Text style={styles.subtext}>{instructionText}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {Array.from({ length: 30 }, (_, i) => {
          const juzNumber = i + 1;
          const stats = getJuzStats(juzNumber);
          const surahs = getSurahsInJuz(juzNumber);

          return (
            <JuzCard
              key={juzNumber}
              juzNumber={juzNumber}
              name={getJuzName(juzNumber)}
              memorizedCount={stats.memorizedCount}
              totalPages={stats.totalPages}
              isExpanded={expandedJuz === juzNumber}
              surahs={surahs}
              pages={pages}
              theme={theme}
              styles={styles}
              onToggleJuz={() => handleToggleJuz(juzNumber)}
              onExpand={() => handleExpandJuz(juzNumber)}
              onToggleSurah={(surahNum) => handleToggleSurah(juzNumber, surahNum)}
              onClearAll={() => handleClearJuz(juzNumber)}
            />
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.summaryText}>
          <Text style={{ color: theme.accent, fontWeight: '600' }}>{totalMemorized}</Text>
          {' of 604 pages memorized'}
        </Text>
        <Button title="Continue" onPress={handleContinue} variant="primary" style={styles.button} />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    backButton: { padding: spacing.xxs },
    headline: { ...typography.displaySmall, color: theme.textPrimary, marginBottom: spacing.xxs },
    subtext: { ...typography.bodyMedium, color: theme.textSecondary },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
    card: {
      backgroundColor: theme.bgAlt,
      borderRadius: radius.md,
      marginBottom: spacing.xs,
      overflow: 'hidden',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    cardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: spacing.sm,
    },
    juzNumberWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    juzNumberText: {
      ...typography.titleSmall,
      fontWeight: '600',
    },
    cardInfo: { flex: 1 },
    juzName: { ...typography.titleSmall, color: theme.textPrimary },
    pageRange: { ...typography.bodySmall, color: theme.textMuted, marginTop: 2 },
    checkboxWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingLeft: spacing.sm,
    },
    progressText: { ...typography.bodySmall, color: theme.textMuted },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: radius.xs,
      borderWidth: 1.5,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    progressBarRow: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    expandedSection: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: spacing.md,
    },
    expandedLabel: { ...typography.bodySmall, color: theme.textMuted, marginBottom: spacing.xs },
    surahList: { gap: spacing.xxs, marginBottom: spacing.sm },
    surahItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: theme.bg,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    surahNumber: {
      ...typography.bodySmall,
      color: theme.textMuted,
      width: 22,
      textAlign: 'center',
    },
    surahNames: { flex: 1 },
    surahNameArabic: { ...typography.bodyMedium, color: theme.textPrimary, fontWeight: '500' },
    surahNameEnglish: { ...typography.bodySmall, color: theme.textMuted },
    surahPages: { ...typography.bodySmall, color: theme.textMuted },
    surahCheck: {
      width: 20,
      height: 20,
      borderRadius: radius.xs,
      borderWidth: 1.5,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    quickActions: { flexDirection: 'row', gap: spacing.xs },
    quickAction: {
      flex: 1,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
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
      fontWeight: '600',
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.bg,
      gap: spacing.sm,
    },
    summaryText: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      textAlign: 'center',
    },
    button: { width: '100%' },
  });
