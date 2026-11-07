import React, { useMemo, useState, useRef } from 'react';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
// Gesture Handler's, so a sideways swipe on it can move to the next tab
// (navigation/PagerTabs).
import { ScrollView } from 'react-native-gesture-handler';
import { useScrollToTop } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { INSIGHTS_MIN_SESSIONS } from '../../lib/algorithm';
import { getRatingLabel } from '../../lib/ratings';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import { ProgressBar } from '../../components/ProgressBar';
import {
  Hairline,
  InsightRow,
  PagePreviewSheet,
  QuietLine,
  SectionHeader,
  StrengthBar,
} from '../../components/insights/InsightsV2';
import { BrowseByStrength, PageRow, usePageStrengthRows } from '../../components/insights/BrowseByStrength';
import { layoutV2, typeV2 } from '../../theme/v2';

export { juzMeta } from '../../components/insights/BrowseByStrength';

// Focus lists the first few.
const FOCUS_LIMIT_V2 = 3;

/**
 * The Insights tab, for accounts without the new Activity (navigation/tabPages): Strength, Focus,
 * and Browse (components/insights/BrowseByStrength). Accounts with it have Activity's Insights, and
 * Browse as "Pages by strength".
 */
export default function AlgorithmScreen() {
  const { palette } = useTheme();
  const { user, loadData } = useApp();
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  // Room for the tab bar (and the mini player) and for Revo's button.
  const tabFootprint = useTabBarFootprint() + useRevoFootprint();
  // Tapping the Insights tab while on it scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const { refreshing, onRefresh } = usePullToRefresh(loadData);
  const { rows: allPageRows, completedSessionCount, hasEnoughSessions } = usePageStrengthRows();

  // Focus: the first few of every page, whatever Browse is filtered to (its
  // filters sit below it).
  const topPages = useMemo(
    (): PageRow[] =>
      [...allPageRows]
        .sort((a, b) => (a.strength !== b.strength ? a.strength - b.strength : b.urgency - a.urgency))
        .slice(0, FOCUS_LIMIT_V2),
    [allPageRows],
  );

  const openPagePreview = (pageNumber: number) => setPreviewPage(pageNumber);

  if (!user) {
    return (
      <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
        <View style={styles.loadingContainer} testID="insights-loading">
          <ActivityIndicator color={palette.secondary} />
        </View>
      </TopSafeAreaView>
    );
  }

  // A large title, then flat sections on hairlines. Strength (one bar: how
  // many pages are weak, moderate, strong), Focus (the first few pages to
  // revise), Browse (pages, surahs or juz, weakest first, filtered by juz and
  // strength). A row opens its page in a sheet; a juz narrows Browse to it.
  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.secondary} />}
        testID="insights-v2"
      >
        <View style={v2.titleBlock}>
          <Text style={[typeV2.largeTitle, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            Insights
          </Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]}>Where you stand and what to focus on</Text>
        </View>
        <Hairline />

        {!hasEnoughSessions ? (
          <View testID="insights-warming">
            <SectionHeader title="Insights warming up" />
            <View style={v2.block}>
              <Text style={[typeV2.body, { color: palette.secondary }]}>
                {`They start after ${INSIGHTS_MIN_SESSIONS} completed revision sessions.`}
              </Text>
              <View style={v2.progress}>
                <ProgressBar
                  progress={(Math.min(completedSessionCount, INSIGHTS_MIN_SESSIONS) / INSIGHTS_MIN_SESSIONS) * 100}
                  height={6}
                  testID="insights-warming-progress"
                />
              </View>
              <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}>
                {`${completedSessionCount} of ${INSIGHTS_MIN_SESSIONS} so far`}
              </Text>
            </View>
            <Hairline />
          </View>
        ) : (
          <>
            {allPageRows.length > 0 && (
              <>
                <SectionHeader
                  title="Strength"
                  detail={`${allPageRows.length} revised page${allPageRows.length === 1 ? '' : 's'}`}
                />
                <StrengthBar ratings={allPageRows.map((r) => r.strength)} />
                <Hairline />
              </>
            )}

            <SectionHeader title="Focus" detail="Revise these first: the weakest and most overdue" />
            {topPages.length === 0 ? (
              <QuietLine testID="focus-empty">Your top priority will appear here.</QuietLine>
            ) : (
              topPages.map((row, i) => (
                <InsightRow
                  key={`focus-${row.pageNumber}`}
                  number={row.pageNumber}
                  name={`Page ${row.pageNumber} · ${row.surahName}`}
                  rating={row.strength}
                  text={`${getRatingLabel(row.strength)} · ${row.reason}`}
                  onPress={() => openPagePreview(row.pageNumber)}
                  separator={i < topPages.length - 1}
                  testID={`focus-${row.pageNumber}`}
                />
              ))
            )}
            <Hairline />

            <SectionHeader title="Browse" detail="Weakest first" />
            <BrowseByStrength rows={allPageRows} onOpenPage={openPagePreview} />
          </>
        )}
      </ScrollView>

      <PagePreviewSheet pageNumber={previewPage} onClose={() => setPreviewPage(null)} />
    </TopSafeAreaView>
  );
}

const v2 = StyleSheet.create({
  titleBlock: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 12, gap: 2 },
  block: { paddingHorizontal: layoutV2.gutter, paddingBottom: layoutV2.rowPad, gap: 10 },
  progress: { paddingVertical: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
