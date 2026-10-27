import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { Stepper } from '../../components/Stepper';
import { MemorizationBrowser } from '../../components/MemorizationBrowser';
import { PillButton } from '../../components/v2/PillButton';
import { TopBar } from '../../components/v2/TopBar';
import {
  PageStatus,
  applyPendingChanges,
  applyPendingSurahChanges,
  buildInitialPendingForJourney,
  buildInitialPendingSurahsForJourney,
} from '../../lib/memorizationChanges';
import { useTheme } from '../../context/ThemeContext';
import { useDesign } from '../../design/DesignContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { layoutV2, typeV2 } from '../../theme/v2';
import { useApp } from '../../context/AppContext';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'JuzSelection'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'JuzSelection'>;

export default function JuzSelectionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { journeyStage } = route.params;
  const { user, pages, updatePages, saveUser } = useApp();

  // Local buffer for the user's selection. Stays in component state until
  // Continue is tapped, then flushes to global pages + Firestore in one batch.
  // This is the key DSA shift from the previous version: a tap is an O(1)
  // Map mutation, not a 604-entry array rebuild + global re-render.
  const [pendingChanges, setPendingChanges] = useState<Map<number, PageStatus>>(
    new Map(),
  );
  const [pendingSurahChanges, setPendingSurahChanges] = useState<
    Map<number, PageStatus>
  >(new Map());

  // Seed the buffer once pages have loaded so the initial selection matches
  // the chosen journey stage. Subsequent edits replace this baseline.
  const hasSeededRef = useRef(false);
  useEffect(() => {
    if (hasSeededRef.current) return;
    if (pages.length === 0) return;
    hasSeededRef.current = true;
    setPendingChanges(buildInitialPendingForJourney(pages, journeyStage));
    setPendingSurahChanges(
      buildInitialPendingSurahsForJourney(
        user?.memorizedSurahs ?? [],
        journeyStage,
      ),
    );
  }, [pages, journeyStage, user]);

  // Effective memorized count = base memorized status with pendingChanges applied.
  const effectiveMemorizedCount = useMemo(() => {
    let n = 0;
    for (const p of pages) {
      const override = pendingChanges.get(p.pageNumber);
      const effective =
        override !== undefined ? override : p.status === 'memorized' ? 'memorized' : 'not_memorized';
      if (effective === 'memorized') n++;
    }
    return n;
  }, [pages, pendingChanges]);

  const handleContinue = async () => {
    const { updatedPages, changedPageNumbers } = applyPendingChanges(
      pages,
      pendingChanges,
    );
    if (changedPageNumbers.length > 0) {
      await updatePages(updatedPages, changedPageNumbers);
    }
    if (user && pendingSurahChanges.size > 0) {
      const nextSurahs = applyPendingSurahChanges(
        user.memorizedSurahs ?? [],
        pendingSurahChanges,
      );
      await saveUser({ ...user, memorizedSurahs: nextSurahs });
    }
    navigation.navigate('Schedule', { journeyStage });
  };

  const canContinue = effectiveMemorizedCount > 0;

  // New design: the button shows it's saving, and a second tap waits.
  const [saving, setSaving] = useState(false);
  const continueV2 = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await handleContinue();
    } finally {
      setSaving(false);
    }
  };

  const subtext =
    journeyStage === 'complete'
      ? 'All marked as memorized — adjust if needed.'
      : 'Mark your completed surahs and juz.';

  if (isNew) {
    // The title scrolls with the list, so the largest text sizes still leave
    // room for it; the count and the action stay at the foot, over a hairline.
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="juz-selection">
        <TopBar onBack={() => navigation.goBack()} center={<Stepper total={3} current={2} />} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={v2.scroll}
          showsVerticalScrollIndicator={false}
          testID="juz-selection-scroll"
        >
          <View style={v2.header}>
            <Text
              style={[typeV2.title, { color: palette.text }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.6}
            >
              Select memorized portions
            </Text>
            <Text style={[typeV2.body, v2.subtext, { color: palette.secondary }]}>{subtext}</Text>
          </View>
          <View style={v2.browser}>
            <MemorizationBrowser
              pages={pages}
              pendingChanges={pendingChanges}
              onChange={setPendingChanges}
              baseMemorizedSurahs={user?.memorizedSurahs ?? []}
              pendingSurahChanges={pendingSurahChanges}
              onSurahChange={setPendingSurahChanges}
              markMode
              hideMarkToggle
            />
          </View>
        </ScrollView>

        <View style={[v2.footer, { borderTopColor: palette.separator }]} testID="juz-selection-footer">
          <Text
            style={[typeV2.body, v2.summary, { color: palette.secondary }]}
            maxFontSizeMultiplier={1.6}
            testID="juz-selection-summary"
          >
            <Text style={[typeV2.name, typeV2.numeral, { color: palette.accentText }]}>{effectiveMemorizedCount}</Text>
            {' of 604 pages memorized'}
          </Text>
          <PillButton
            title="Continue"
            size="lg"
            onPress={continueV2}
            disabled={!canContinue}
            busy={saving}
            testID="juz-continue"
          />
        </View>
      </SafeAreaView>
    );
  }

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
          <Stepper total={3} current={2} />
        </View>
        <Text style={styles.headline}>Select memorized portions</Text>
        <Text style={styles.subtext}>{subtext}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <MemorizationBrowser
          pages={pages}
          pendingChanges={pendingChanges}
          onChange={setPendingChanges}
          baseMemorizedSurahs={user?.memorizedSurahs ?? []}
          pendingSurahChanges={pendingSurahChanges}
          onSurahChange={setPendingSurahChanges}
          markMode
          hideMarkToggle
        />
      </ScrollView>

      <View style={styles.footer}>
        <GlassCard style={StyleSheet.absoluteFillObject} />
        <Text style={styles.summaryText}>
          <Text style={{ color: theme.accent, fontWeight: '600' }}>
            {effectiveMemorizedCount}
          </Text>
          {' of 604 pages memorized'}
        </Text>
        <Button
          title="Continue"
          onPress={handleContinue}
          variant="primary"
          disabled={!canContinue}
          style={styles.button}
        />
      </View>
    </SafeAreaView>
  );
}

const v2 = StyleSheet.create({
  scroll: { paddingBottom: 24 },
  header: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 16 },
  subtext: { marginTop: 4 },
  browser: { paddingHorizontal: layoutV2.gutter },
  footer: {
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
    borderTopWidth: layoutV2.hairline,
  },
  summary: { textAlign: 'center' },
});

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
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
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      overflow: 'hidden',
      gap: spacing.sm,
    },
    summaryText: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      textAlign: 'center',
    },
    button: { width: '100%' },
  });
