// Every revised page by strength, weakest first: pages, surahs or juz, filtered by juz and by
// strength. The Insights tab's Browse (screens/main/AlgorithmScreen), and Activity's "Pages by
// strength" (screens/activity/PagesByStrengthScreen), reached from Insights' Weak spots.

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApp } from '../../context/AppContext';
import {
  calculatePageUrgency,
  countCompletedSessions,
  getMissedScheduledRevisions,
  INSIGHTS_MIN_SESSIONS,
} from '../../lib/algorithm';
import { getRevisionDateForUser, getRevisionDayForUser } from '../../lib/fajrBoundary';
import { daysBetween } from '../../lib/activityHeatmap';
import { getJuzName, getQuranData, getSurahForPage } from '../../lib/quranData';
import { RATINGS, getRatingLabel } from '../../lib/ratings';
import { describePassage, firstWordsOfPage, pagesNote, spokenText } from '../../lib/passages';
import { layoutV2 } from '../../theme/v2';
import { ActionSheet } from '../v2/ActionSheet';
import { PillButton } from '../v2/PillButton';
import { PillTabs } from '../v2/PillTabs';
import { Hairline, InsightRow, QuietLine, ShowMore } from './InsightsV2';
import { revisablePages } from '../../lib/memorizedAyahs';
import { t } from '../../i18n';
import { lastRevisedDay } from '../../lib/recency';

// Moved to lib/recency (Insights' Gaps reads it too); kept here for this file's callers.
export { lastRevisedDay };

type BrowseMode = 'pages' | 'surahs' | 'juz';

// Collapsed, a list shows a few rows, then "Show all".
const LIST_LIMIT = 3;

export interface PageRow {
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
  return t('insights.juzMeta', { count: pageCount, average: avgStrength.toFixed(1), name: getJuzName(juz) });
}

/**
 * A page's row, surah first (Majd's rule, Nov 7 2026: surahs and juz, page numbers almost never):
 * its title is the passage ("Al-Baqarah, ayahs 246–248", lib/passages), its mark the surah's
 * number (as the Surahs list), and the page number only a quiet detail in `detail`.
 */
export function pageRowText(pageNumber: number, detail: (page: string) => string): { name: string; text: string; spoken: string } {
  const name = describePassage([pageNumber]);
  const text = detail(pagesNote([pageNumber]));
  return { name, text, spoken: spokenText(`${name}. ${text}`) };
}

/** "today", "1d ago", "12d ago": how long since a page's last revision day. */
export function revisedAgo(days: number): string {
  return days === 0 ? t('insights.today') : t('insights.daysAgo', { days });
}

/**
 * Every memorized page that has been revised, with its strength, how overdue it is and why it
 * would come first; and whether there are enough sessions for Insights to say anything yet.
 */
export function usePageStrengthRows(): {
  rows: PageRow[];
  completedSessionCount: number;
  hasEnoughSessions: boolean;
} {
  const { user, pages, logs } = useApp();
  const quranData = useMemo(() => getQuranData(), []);
  const memorizedPages = useMemo(() => revisablePages(pages), [pages]);
  const completedSessionCount = useMemo(() => countCompletedSessions(logs), [logs]);

  const rows = useMemo((): PageRow[] => {
    if (!user) return [];
    // The revision day, not the calendar: between midnight and fajr it is still yesterday.
    const today = getRevisionDateForUser(user);
    const todayDay = getRevisionDayForUser(user);

    return memorizedPages
      .filter((p) => p.lastRevisedDate)
      .map((page) => {
        // Whole revision days from the one it was last revised on: a page revised this morning is
        // 0 (today). Measuring from today's midnight made it -1 ("revised -1d ago").
        const daysSinceRevision = Math.max(0, daysBetween(lastRevisedDay(user, page.lastRevisedDate!), todayDay));

        let daysSinceMemorized: number | null = null;
        if (page.dateMemorized) {
          const dateMemorized = new Date(page.dateMemorized);
          daysSinceMemorized = Math.floor((today.getTime() - dateMemorized.getTime()) / (1000 * 60 * 60 * 24));
        }

        const urgency = calculatePageUrgency(page, user, memorizedPages, logs, today);
        const missed = getMissedScheduledRevisions(page, user, memorizedPages, logs, today);
        const surah = getSurahForPage(page.pageNumber);
        const quranPage = quranData.find((q) => q.pageNumber === page.pageNumber);

        let reason: string;
        if (missed > 0) {
          reason = missed === 1 ? t('insights.reason.missedOnce') : t('insights.reason.missed', { count: missed });
        } else if (page.weaknessRating <= 2) {
          reason = page.weaknessRating === 1 ? t('insights.reason.veryWeak') : t('insights.reason.weak');
        } else if (daysSinceMemorized !== null && daysSinceMemorized < 30) {
          reason = t('insights.reason.recent');
        } else {
          reason = t('insights.reason.lastRevised', { ago: revisedAgo(daysSinceRevision) });
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

  return { rows, completedSessionCount, hasEnoughSessions: completedSessionCount >= INSIGHTS_MIN_SESSIONS };
}

/**
 * The Browse list: Pages | Surahs | Juz, the juz and strength filters (menus), then the rows,
 * weakest first. A page or surah row opens its (weakest) page; a juz narrows the pages to it.
 * `collapsed` shows three rows, then "Show all" (the Insights tab); a screen of its own shows
 * every row. `activityTabs`: Pages | Surahs | Juz as Activity's tabs (ink pills that hug their
 * labels, gap audit §1 A), for Pages by strength, which is part of Activity.
 */
export function BrowseByStrength({
  rows,
  onOpenPage,
  collapsed = true,
  activityTabs = false,
}: {
  rows: PageRow[];
  onOpenPage: (pageNumber: number) => void;
  collapsed?: boolean;
  activityTabs?: boolean;
}) {
  const [juzFilter, setJuzFilter] = useState<number | null>(null);
  const [strengthFilter, setStrengthFilter] = useState<number | null>(null);
  const [browseMode, setBrowseMode] = useState<BrowseMode>('pages');
  const [juzPickerOpen, setJuzPickerOpen] = useState(false);
  const [strengthPickerOpen, setStrengthPickerOpen] = useState(false);
  const [expandedLists, setExpandedLists] = useState<Record<BrowseMode, boolean>>({
    pages: false,
    surahs: false,
    juz: false,
  });

  const toggleListExpansion = (mode: BrowseMode) => {
    setExpandedLists((prev) => ({ ...prev, [mode]: !prev[mode] }));
  };

  // Juz filter applies to the page-derived view; strength filter applies on
  // top of that for the Weakest lists.
  const filteredPageRows = useMemo((): PageRow[] => {
    if (juzFilter === null) return rows;
    return rows.filter((p) => p.juzNumber === juzFilter);
  }, [rows, juzFilter]);

  const sortedPages = useMemo((): PageRow[] => {
    const base = strengthFilter === null ? filteredPageRows : filteredPageRows.filter((p) => p.strength === strengthFilter);
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

    const out: SurahRow[] = [];
    bySurah.forEach((list, surahNumber) => {
      const avg = list.reduce((s, p) => s + p.strength, 0) / list.length;
      const weakest = [...list].sort((a, b) => a.strength - b.strength)[0];
      out.push({
        surahNumber,
        surahName: list[0].surahName,
        surahNameArabic: list[0].surahNameArabic,
        weakestPage: weakest.pageNumber,
        avgStrength: Math.round(avg * 10) / 10,
        pageCount: list.length,
      });
    });

    const sorted = out.sort((a, b) => a.avgStrength - b.avgStrength);
    if (strengthFilter === null) return sorted;
    return sorted.filter((r) => Math.round(r.avgStrength) === strengthFilter);
  }, [filteredPageRows, strengthFilter]);

  // Juz view always shows all juz with memorized pages — juz filter doesn't narrow this.
  const sortedJuz = useMemo((): JuzRow[] => {
    const byJuz = new Map<number, PageRow[]>();
    for (const row of rows) {
      const list = byJuz.get(row.juzNumber) ?? [];
      list.push(row);
      byJuz.set(row.juzNumber, list);
    }

    const out: JuzRow[] = [];
    byJuz.forEach((list, juzNumber) => {
      const avg = list.reduce((s, p) => s + p.strength, 0) / list.length;
      const weakest = [...list].sort((a, b) => a.strength - b.strength)[0];
      out.push({
        juzNumber,
        weakestPage: weakest.pageNumber,
        avgStrength: Math.round(avg * 10) / 10,
        pageCount: list.length,
      });
    });

    const sorted = out.sort((a, b) => a.avgStrength - b.avgStrength);
    if (strengthFilter === null) return sorted;
    return sorted.filter((r) => Math.round(r.avgStrength) === strengthFilter);
  }, [rows, strengthFilter]);

  const availableJuz = useMemo(() => {
    const set = new Set<number>();
    for (const row of rows) set.add(row.juzNumber);
    return Array.from(set).sort((a, b) => a - b);
  }, [rows]);

  const handleJuzRowTap = (juzNumber: number) => {
    setJuzFilter(juzNumber);
    setBrowseMode('pages');
  };

  const filterLabel = juzFilter === null ? t('insights.allJuz') : t('common.juzN', { n: juzFilter });
  const strengthFilterLabel = strengthFilter === null ? t('insights.allStrengths') : getRatingLabel(strengthFilter);
  const listRows =
    browseMode === 'pages' ? sortedPages.length : browseMode === 'surahs' ? sortedSurahs.length : sortedJuz.length;
  const expanded = !collapsed || expandedLists[browseMode];
  const limit = expanded ? Infinity : LIST_LIMIT;
  const emptyBrowse =
    browseMode === 'juz'
      ? t('insights.nothingMemorized')
      : browseMode === 'pages'
        ? t('insights.noMatchPages')
        : t('insights.noMatchSurahs');

  return (
    <>
      <View style={styles.controls}>
        <PillTabs<BrowseMode>
          options={[
            { value: 'pages', label: t('insights.pages') },
            { value: 'surahs', label: t('insights.surahs') },
            { value: 'juz', label: t('common.juz') },
          ]}
          value={browseMode}
          onChange={setBrowseMode}
          testID="browse-tabs"
          tone={activityTabs ? 'ink' : 'primary'}
          hug={activityTabs}
        />
        <View style={styles.filters}>
          {browseMode !== 'juz' && (
            <PillButton
              title={filterLabel}
              icon="filter-outline"
              size="sm"
              variant={juzFilter !== null ? 'solid' : 'outline'}
              onPress={() => setJuzPickerOpen(true)}
              accessibilityLabel={t('insights.juzFilterLabel', { filter: filterLabel })}
              testID="filter-juz"
            />
          )}
          <PillButton
            title={strengthFilterLabel}
            icon="pulse-outline"
            size="sm"
            variant={strengthFilter !== null ? 'solid' : 'outline'}
            onPress={() => setStrengthPickerOpen(true)}
            accessibilityLabel={t('insights.strengthLabel', { value: strengthFilterLabel })}
            testID="filter-strength"
          />
        </View>
      </View>
      <Hairline />
      {listRows === 0 ? (
        <QuietLine testID="browse-empty">{emptyBrowse}</QuietLine>
      ) : (
        // Kept as a view of its own: on iOS a wrapper with only a testID is flattened away, and E2E
        // waits for this id (Pages by strength).
        <View testID={`browse-${browseMode}`} collapsable={false}>
          {browseMode === 'pages' &&
            sortedPages.slice(0, limit).map((row) => {
              const rowText = pageRowText(row.pageNumber, (page) =>
                t('insights.pageRow', {
                  rating: getRatingLabel(row.strength),
                  juz: row.juzNumber,
                  page,
                  ago: revisedAgo(row.daysSinceRevision),
                }),
              );
              return (
                <InsightRow
                  key={`page-${row.pageNumber}`}
                  number={row.surahNumber}
                  name={rowText.name}
                  rating={row.strength}
                  text={rowText.text}
                  onPress={() => onOpenPage(row.pageNumber)}
                  accessibilityLabel={rowText.spoken}
                  testID={`browse-page-${row.pageNumber}`}
                  firstWords={firstWordsOfPage(row.pageNumber)}
                />
              );
            })}
          {browseMode === 'surahs' &&
            sortedSurahs.slice(0, limit).map((row) => (
              <InsightRow
                key={`surah-${row.surahNumber}`}
                number={row.surahNumber}
                name={row.surahName}
                rating={Math.round(row.avgStrength)}
                text={t('insights.surahRow', { count: row.pageCount, average: row.avgStrength.toFixed(1) })}
                onPress={() => onOpenPage(row.weakestPage)}
                accessibilityLabel={t('insights.surahLabel', { name: row.surahName, count: row.pageCount, average: row.avgStrength.toFixed(1) })}
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
                accessibilityLabel={t('insights.juzLabel', { juz: row.juzNumber, count: row.pageCount, average: row.avgStrength.toFixed(1) })}
                testID={`browse-juz-${row.juzNumber}`}
              />
            ))}
          {collapsed && listRows > LIST_LIMIT ? (
            <ShowMore
              expanded={expandedLists[browseMode]}
              hidden={listRows - LIST_LIMIT}
              onToggle={() => toggleListExpansion(browseMode)}
            />
          ) : null}
        </View>
      )}

      <ActionSheet
        visible={juzPickerOpen}
        onClose={() => setJuzPickerOpen(false)}
        title={t('insights.filterByJuz')}
        actions={[
          { key: 'all', label: t('insights.allJuz'), selected: juzFilter === null, onPress: () => setJuzFilter(null) },
          ...availableJuz.map((juz) => ({
            key: `juz-${juz}`,
            label: t('common.juzN', { n: juz }),
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
        title={t('insights.filterByStrength')}
        actions={[
          { key: 'all', label: t('insights.allStrengths'), selected: strengthFilter === null, onPress: () => setStrengthFilter(null) },
          ...RATINGS.map((rating) => ({
            key: `strength-${rating.value}`,
            label: rating.label,
            selected: strengthFilter === rating.value,
            onPress: () => setStrengthFilter(rating.value),
          })),
        ]}
        testID="strength-picker"
      />
    </>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 12, gap: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
