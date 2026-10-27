import React, { useMemo, useState, useRef } from 'react';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useScrollToTop } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import {
  calculatePageUrgency,
  countCompletedSessions,
  getMissedScheduledRevisions,
  INSIGHTS_MIN_SESSIONS,
} from '../../lib/algorithm';
import {
  getQuranData,
  getSurahForPage,
  getJuzName,
} from '../../lib/quranData';
import { RATINGS, getRatingLabel } from '../../lib/ratings';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { ProgressBar } from '../../components/ProgressBar';
import { ActionSheet } from '../../components/v2/ActionSheet';
import { PillButton } from '../../components/v2/PillButton';
import { PillTabs } from '../../components/v2/PillTabs';
import {
  Hairline,
  InsightRow,
  PagePreviewSheet,
  QuietLine,
  SectionHeader,
  ShowMore,
  StrengthBar,
} from '../../components/insights/InsightsV2';
import { layoutV2, typeV2 } from '../../theme/v2';

type BrowseMode = 'pages' | 'surahs' | 'juz';

// Focus lists the first few; Browse shows a few, then "Show all".
const FOCUS_LIMIT_V2 = 3;
const LIST_LIMIT_V2 = 3;

interface PageRow {
  pageNumber: number;
  juzNumber: number;
  surahNumber: number;
  surahName: string;
  surahNameArabic: string;
  strength: number;
  daysSinceRevision: number;
  reason: string;
  urgency: number;
}

interface SurahRow {
  surahNumber: number;
  surahName: string;
  surahNameArabic: string;
  weakestPage: number;
  avgStrength: number;
  pageCount: number;
}

interface JuzRow {
  juzNumber: number;
  weakestPage: number;
  avgStrength: number;
  pageCount: number;
}

/**
 * A juz row's meta: the numbers, then the juz's Arabic name in an isolate.
 * Arabic first would make the whole line right to left ("page · average 1.0 1 · الم").
 */
export function juzMeta(juz: number, pageCount: number, avgStrength: number): string {
  return `${pageCount} page${pageCount === 1 ? '' : 's'} · average ${avgStrength.toFixed(1)} · \u2068${getJuzName(juz)}\u2069`;
}

export default function AlgorithmScreen() {
  const { palette } = useTheme();
  const { user, pages, logs, loadData } = useApp();
  const quranData = useMemo(() => getQuranData(), []);

  const [juzFilter, setJuzFilter] = useState<number | null>(null);
  const [strengthFilter, setStrengthFilter] = useState<number | null>(null);
  const [browseMode, setBrowseMode] = useState<BrowseMode>('pages');
  const [juzPickerOpen, setJuzPickerOpen] = useState(false);
  const [strengthPickerOpen, setStrengthPickerOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const tabFootprint = useTabBarFootprint();
  const [expandedLists, setExpandedLists] = useState<Record<BrowseMode, boolean>>({
    pages: false,
    surahs: false,
    juz: false,
  });
  // Tapping the Insights tab while on it scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const toggleListExpansion = (mode: BrowseMode) => {
    setExpandedLists((prev) => ({ ...prev, [mode]: !prev[mode] }));
  };

  const { refreshing, onRefresh } = usePullToRefresh(loadData);

  const memorizedPages = useMemo(
    () => pages.filter((p) => p.status === 'memorized'),
    [pages],
  );

  const completedSessionCount = useMemo(
    () => countCompletedSessions(logs),
    [logs],
  );
  const hasEnoughSessions = completedSessionCount >= INSIGHTS_MIN_SESSIONS;

  const allPageRows = useMemo((): PageRow[] => {
    if (!user) return [];
    const today = new Date();

    return memorizedPages
      .filter((p) => p.lastRevisedDate)
      .map((page) => {
        const lastRevised = new Date(page.lastRevisedDate!);
        const daysSinceRevision = Math.floor(
          (today.getTime() - lastRevised.getTime()) / (1000 * 60 * 60 * 24),
        );

        let daysSinceMemorized: number | null = null;
        if (page.dateMemorized) {
          const dateMemorized = new Date(page.dateMemorized);
          daysSinceMemorized = Math.floor(
            (today.getTime() - dateMemorized.getTime()) / (1000 * 60 * 60 * 24),
          );
        }

        const urgency = calculatePageUrgency(page, user, memorizedPages, logs, today);
        const missed = getMissedScheduledRevisions(
          page,
          user,
          memorizedPages,
          logs,
          today,
        );
        const surah = getSurahForPage(page.pageNumber);
        const quranPage = quranData.find((q) => q.pageNumber === page.pageNumber);

        let reason: string;
        if (missed > 0) {
          reason =
            missed === 1
              ? 'Missed once on the schedule'
              : `Missed ${missed} scheduled revisions`;
        } else if (page.weaknessRating <= 2) {
          reason =
            page.weaknessRating === 1
              ? 'You marked this as very weak'
              : 'You marked this as weak';
        } else if (daysSinceMemorized !== null && daysSinceMemorized < 30) {
          reason = 'Recently memorized — keep it fresh';
        } else {
          reason = `Last revised ${daysSinceRevision}d ago`;
        }

        return {
          pageNumber: page.pageNumber,
          juzNumber: quranPage?.juzNumber ?? 0,
          surahNumber: surah.number,
          surahName: surah.name,
          surahNameArabic: surah.nameArabic,
          strength: page.weaknessRating,
          daysSinceRevision,
          reason,
          urgency,
        };
      });
  }, [user, memorizedPages, logs, quranData]);

  // Juz filter applies to the page-derived view; strength filter applies on
  // top of that for the Weakest lists.
  const filteredPageRows = useMemo((): PageRow[] => {
    if (juzFilter === null) return allPageRows;
    return allPageRows.filter((p) => p.juzNumber === juzFilter);
  }, [allPageRows, juzFilter]);

  // Focus: the first few of every page, whatever Browse is filtered to (its
  // filters sit below it).
  const topPages = useMemo(
    (): PageRow[] =>
      [...allPageRows]
        .sort((a, b) => (a.strength !== b.strength ? a.strength - b.strength : b.urgency - a.urgency))
        .slice(0, FOCUS_LIMIT_V2),
    [allPageRows],
  );

  const sortedPages = useMemo((): PageRow[] => {
    const base =
      strengthFilter === null
        ? filteredPageRows
        : filteredPageRows.filter((p) => p.strength === strengthFilter);
    return [...base].sort((a, b) => {
      if (a.strength !== b.strength) return a.strength - b.strength;
      return b.urgency - a.urgency;
    });
  }, [filteredPageRows, strengthFilter]);

  const sortedSurahs = useMemo((): SurahRow[] => {
    const bySurah = new Map<number, PageRow[]>();
    for (const row of filteredPageRows) {
      const list = bySurah.get(row.surahNumber) ?? [];
      list.push(row);
      bySurah.set(row.surahNumber, list);
    }

    const rows: SurahRow[] = [];
    bySurah.forEach((list, surahNumber) => {
      const avg = list.reduce((s, p) => s + p.strength, 0) / list.length;
      const weakest = [...list].sort((a, b) => a.strength - b.strength)[0];
      rows.push({
        surahNumber,
        surahName: list[0].surahName,
        surahNameArabic: list[0].surahNameArabic,
        weakestPage: weakest.pageNumber,
        avgStrength: Math.round(avg * 10) / 10,
        pageCount: list.length,
      });
    });

    const sorted = rows.sort((a, b) => a.avgStrength - b.avgStrength);
    if (strengthFilter === null) return sorted;
    return sorted.filter((r) => Math.round(r.avgStrength) === strengthFilter);
  }, [filteredPageRows, strengthFilter]);

  // Juz view always shows all juz with memorized pages — juz filter doesn't narrow this.
  const sortedJuz = useMemo((): JuzRow[] => {
    const byJuz = new Map<number, PageRow[]>();
    for (const row of allPageRows) {
      const list = byJuz.get(row.juzNumber) ?? [];
      list.push(row);
      byJuz.set(row.juzNumber, list);
    }

    const rows: JuzRow[] = [];
    byJuz.forEach((list, juzNumber) => {
      const avg = list.reduce((s, p) => s + p.strength, 0) / list.length;
      const weakest = [...list].sort((a, b) => a.strength - b.strength)[0];
      rows.push({
        juzNumber,
        weakestPage: weakest.pageNumber,
        avgStrength: Math.round(avg * 10) / 10,
        pageCount: list.length,
      });
    });

    const sorted = rows.sort((a, b) => a.avgStrength - b.avgStrength);
    if (strengthFilter === null) return sorted;
    return sorted.filter((r) => Math.round(r.avgStrength) === strengthFilter);
  }, [allPageRows, strengthFilter]);

  const availableJuz = useMemo(() => {
    const set = new Set<number>();
    for (const row of allPageRows) set.add(row.juzNumber);
    return Array.from(set).sort((a, b) => a - b);
  }, [allPageRows]);

  const openPagePreview = (pageNumber: number) => setPreviewPage(pageNumber);

  const handleJuzRowTap = (juzNumber: number) => {
    setJuzFilter(juzNumber);
    setBrowseMode('pages');
  };

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
        <View style={styles.loadingContainer} testID="insights-loading">
          <ActivityIndicator color={palette.secondary} />
        </View>
      </SafeAreaView>
    );
  }

  const filterLabel = juzFilter === null ? 'All juz' : `Juz ${juzFilter}`;
  const strengthFilterLabel =
    strengthFilter === null ? 'All strengths' : getRatingLabel(strengthFilter);

  // A large title, then flat sections on hairlines. Strength (one bar: how
  // many pages are weak, moderate, strong), Focus (the first few pages to
  // revise), Browse (pages, surahs or juz, weakest first, filtered by juz and
  // strength). A row opens its page in a sheet; a juz narrows Browse to it.
  const listRows =
    browseMode === 'pages' ? sortedPages.length : browseMode === 'surahs' ? sortedSurahs.length : sortedJuz.length;
  const expanded = expandedLists[browseMode];
  const limit = expanded ? Infinity : LIST_LIMIT_V2;
  const emptyBrowse =
    browseMode === 'juz' ? 'Nothing memorized yet' : `No ${browseMode} match these filters`;
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
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
            <View style={v2.controls}>
              <PillTabs<BrowseMode>
                options={[
                  { value: 'pages', label: 'Pages' },
                  { value: 'surahs', label: 'Surahs' },
                  { value: 'juz', label: 'Juz' },
                ]}
                value={browseMode}
                onChange={setBrowseMode}
                testID="browse-tabs"
              />
              <View style={v2.filters}>
                {browseMode !== 'juz' && (
                  <PillButton
                    title={filterLabel}
                    icon="filter-outline"
                    size="sm"
                    variant={juzFilter !== null ? 'solid' : 'outline'}
                    onPress={() => setJuzPickerOpen(true)}
                    accessibilityLabel={`Juz: ${filterLabel}`}
                    testID="filter-juz"
                  />
                )}
                <PillButton
                  title={strengthFilterLabel}
                  icon="pulse-outline"
                  size="sm"
                  variant={strengthFilter !== null ? 'solid' : 'outline'}
                  onPress={() => setStrengthPickerOpen(true)}
                  accessibilityLabel={`Strength: ${strengthFilterLabel}`}
                  testID="filter-strength"
                />
              </View>
            </View>
            <Hairline />
            {listRows === 0 ? (
              <QuietLine testID="browse-empty">{emptyBrowse}</QuietLine>
            ) : (
              <View testID={`browse-${browseMode}`}>
                {browseMode === 'pages' &&
                  sortedPages.slice(0, limit).map((row) => (
                    <InsightRow
                      key={`page-${row.pageNumber}`}
                      number={row.pageNumber}
                      name={`Page ${row.pageNumber} · ${row.surahName}`}
                      rating={row.strength}
                      text={`${getRatingLabel(row.strength)} · Juz ${row.juzNumber} · revised ${row.daysSinceRevision}d ago`}
                      onPress={() => openPagePreview(row.pageNumber)}
                      testID={`browse-page-${row.pageNumber}`}
                    />
                  ))}
                {browseMode === 'surahs' &&
                  sortedSurahs.slice(0, limit).map((row) => (
                    <InsightRow
                      key={`surah-${row.surahNumber}`}
                      number={row.surahNumber}
                      name={row.surahName}
                      rating={Math.round(row.avgStrength)}
                      text={`${row.pageCount} page${row.pageCount === 1 ? '' : 's'} memorized · average ${row.avgStrength.toFixed(1)}`}
                      onPress={() => openPagePreview(row.weakestPage)}
                      accessibilityLabel={`${row.surahName}, ${row.pageCount} pages memorized, average strength ${row.avgStrength.toFixed(1)}. Opens its weakest page`}
                      testID={`browse-surah-${row.surahNumber}`}
                    />
                  ))}
                {browseMode === 'juz' &&
                  sortedJuz.slice(0, limit).map((row) => (
                    <InsightRow
                      key={`juz-${row.juzNumber}`}
                      number={row.juzNumber}
                      name={`Juz ${row.juzNumber}`}
                      rating={Math.round(row.avgStrength)}
                      text={juzMeta(row.juzNumber, row.pageCount, row.avgStrength)}
                      onPress={() => handleJuzRowTap(row.juzNumber)}
                      accessibilityLabel={`Juz ${row.juzNumber}, ${row.pageCount} pages, average strength ${row.avgStrength.toFixed(1)}. Shows its pages`}
                      testID={`browse-juz-${row.juzNumber}`}
                    />
                  ))}
                {listRows > LIST_LIMIT_V2 ? (
                  <ShowMore
                    expanded={expanded}
                    hidden={listRows - LIST_LIMIT_V2}
                    onToggle={() => toggleListExpansion(browseMode)}
                  />
                ) : null}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ActionSheet
        visible={juzPickerOpen}
        onClose={() => setJuzPickerOpen(false)}
        title="Filter by juz"
        actions={[
          { key: 'all', label: 'All juz', selected: juzFilter === null, onPress: () => setJuzFilter(null) },
          ...availableJuz.map((juz) => ({
            key: `juz-${juz}`,
            label: `Juz ${juz}`,
            subtitle: getJuzName(juz),
            selected: juzFilter === juz,
            onPress: () => setJuzFilter(juz),
          })),
        ]}
        testID="juz-picker"
      />
      <ActionSheet
        visible={strengthPickerOpen}
        onClose={() => setStrengthPickerOpen(false)}
        title="Filter by strength"
        actions={[
          { key: 'all', label: 'All strengths', selected: strengthFilter === null, onPress: () => setStrengthFilter(null) },
          ...RATINGS.map((rating) => ({
            key: `strength-${rating.value}`,
            label: rating.label,
            selected: strengthFilter === rating.value,
            onPress: () => setStrengthFilter(rating.value),
          })),
        ]}
        testID="strength-picker"
      />
      <PagePreviewSheet pageNumber={previewPage} onClose={() => setPreviewPage(null)} />
    </SafeAreaView>
  );
}

const v2 = StyleSheet.create({
  titleBlock: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 12, gap: 2 },
  block: { paddingHorizontal: layoutV2.gutter, paddingBottom: layoutV2.rowPad, gap: 10 },
  progress: { paddingVertical: 2 },
  controls: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 12, gap: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
