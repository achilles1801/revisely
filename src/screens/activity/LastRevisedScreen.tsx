// Last revised (ACT-30): when each memorized surah, juz, hizb or page was last revised. Reached from Insights' Gaps
// ("When did I last revise…?", and its full revision line). Recency only (ACT-19). The rows come from lib/lastRevised.
//
// Majd, after trying the first version (Nov 16 2026): "it's hard to tell which card falls under what when a user opens
// up a surah … showing recents with either surah/juz/hizb/page depending on what makes the most sense for each user
// then there should be a filter and sort options like by date". So (board ~/Documents/revisely-today-mocks/last-revised/):
// - three chips, as Insights' range and Overview's Week | Month: the unit (the one that suits the account until the
//   user picks one), the sort (recent first) and the filter (All each visit; filled in ink when it narrows);
// - a group opened shows its pages as part of it: no disc, indented to its name, one line each, joined to its disc by
//   the thread line, with no separator until the group ends; a surah's pages are named by their ayahs alone.

import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { TopBar } from '../../components/v2/TopBar';
import { ThreadRow } from '../../components/v2/ThreadRow';
import { Mark } from '../../components/v2/Mark';
import { Tap } from '../../components/v2/Tap';
import { ActionSheet } from '../../components/v2/ActionSheet';
import { ChoiceChip } from '../../components/activity/ChoiceChip';
import { ChromeText } from '../../components/activity/ChromeText';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { layoutV2, markV2, typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { revisablePages } from '../../lib/memorizedAyahs';
import { coverageSince, lastRevisedDay } from '../../lib/recency';
import { journalFirstDay } from '../../lib/journal';
import { ayahsInSurah, describePassage, pagesNote, spokenText } from '../../lib/passages';
import {
  lastRevisedPrefsKey,
  lastRevisedRows,
  OLD_LAST_REVISED_VIEW_KEY,
  parseLastRevisedPrefs,
  recencyShort,
  recencyText,
  rowName,
  suggestedView,
  type LastRevisedFilter,
  type LastRevisedPrefs,
  type LastRevisedRow,
  type LastRevisedSort,
  type LastRevisedView,
  type PageRecency,
} from '../../lib/lastRevised';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'LastRevised'>;

/** A list item: a row, or one of an opened row's pages (`last`: the group ends after it). */
type Item = { kind: 'row'; row: LastRevisedRow; open: boolean } | { kind: 'page'; page: PageRecency; row: LastRevisedRow; last: boolean };

const UNIT_LABEL: Record<LastRevisedView, () => string> = {
  surah: () => t('insights.lastRevised.unitSurah'),
  juz: () => t('insights.lastRevised.unitJuz'),
  hizb: () => t('insights.lastRevised.unitHizb'),
  page: () => t('insights.lastRevised.unitPage'),
};
const SORT_LABEL: Record<LastRevisedSort, () => string> = {
  recent: () => t('insights.lastRevised.sortRecent'),
  waiting: () => t('insights.lastRevised.sortWaiting'),
  mushaf: () => t('insights.lastRevised.sortMushaf'),
};
const FILTER_LABEL: Record<LastRevisedFilter, () => string> = {
  all: () => t('insights.lastRevised.filterAll'),
  week: () => t('insights.lastRevised.filterWeek'),
  waiting: () => t('insights.lastRevised.filterWaiting'),
  never: () => t('insights.lastRevised.filterNever'),
};

/** "5 surahs", "3 of 15 juz". */
function countLine(view: LastRevisedView, shown: number, total: number): string {
  const base = view === 'surah' ? 'surahs' : view === 'juz' ? 'juzCount' : view === 'hizb' ? 'hizbs' : 'pages';
  return shown === total
    ? t(`insights.lastRevised.${base}` as 'insights.lastRevised.surahs', { count: total })
    : t(`insights.lastRevised.${base}Of` as 'insights.lastRevised.surahsOf', { shown, count: total });
}

export default function LastRevisedScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<HomeStackParamList, 'LastRevised'>>();
  const { user, pages } = useApp();
  const { palette } = useTheme();
  const { day: today } = useRevisionDay(user);
  const footprint = useTabBarFootprint() + useRevoFootprint();
  const uid = user?.id ?? null;
  // What the user picked, kept on the phone for the account; until then the unit that suits them, recent first.
  const [prefs, setPrefs] = useState<LastRevisedPrefs>({});
  // Gaps' full revision line asks for longest waiting first, for this visit.
  const [sortThisVisit, setSortThisVisit] = useState<LastRevisedSort | undefined>(route.params?.sort);
  const [filter, setFilter] = useState<LastRevisedFilter>('all');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<'unit' | 'sort' | 'filter' | null>(null);
  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(lastRevisedPrefsKey(uid))
      .then((v) => setPrefs((now) => ({ ...parseLastRevisedPrefs(v), ...now })))
      .catch(() => undefined);
    AsyncStorage.removeItem(OLD_LAST_REVISED_VIEW_KEY).catch(() => undefined);
  }, [uid]);
  const keep = (next: LastRevisedPrefs) => {
    setPrefs(next);
    if (uid) AsyncStorage.setItem(lastRevisedPrefsKey(uid), JSON.stringify(next)).catch(() => undefined);
  };

  const memorized = useMemo(() => revisablePages(pages), [pages]);
  const suggested = useMemo(
    () => suggestedView({ memorized: memorized.map((p) => p.pageNumber), juzPlan: user?.scheduleMode === 'juz' }),
    [memorized, user?.scheduleMode],
  );
  const view = prefs.view ?? suggested;
  const sort = sortThisVisit ?? prefs.sort ?? 'recent';

  const input = useMemo(() => {
    const firstDay = journalFirstDay(user, []);
    const last = new Map(memorized.filter((p) => p.lastRevisedDate).map((p) => [p.pageNumber, lastRevisedDay(user, p.lastRevisedDate as string)]));
    const since = new Map(memorized.map((p) => [p.pageNumber, coverageSince(p.dateMemorized, firstDay)]));
    return {
      memorized: memorized.map((p) => p.pageNumber),
      last: (p: number) => last.get(p) ?? null,
      since: (p: number) => since.get(p) ?? null,
      today,
    };
  }, [memorized, user, today]);
  const rows = useMemo(() => lastRevisedRows(view, input, { sort, filter }), [view, input, sort, filter]);
  const allCount = useMemo(() => (filter === 'all' ? rows.length : lastRevisedRows(view, input).length), [filter, rows, view, input]);

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const row of rows) {
      const key = `${row.view}-${row.number}`;
      const isOpen = row.view !== 'page' && open.has(key);
      out.push({ kind: 'row', row, open: isOpen });
      if (isOpen) row.pages.forEach((page, i) => out.push({ kind: 'page', page, row, last: i === row.pages.length - 1 }));
    }
    return out;
  }, [rows, open]);

  const openPage = (page: number) => navigation.navigate('QuranReader', { pageNumber: page });
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'page') {
      const p = item.page;
      const row = item.row;
      // A surah's page by its ayahs (the row names the surah); a juz's or hizb's by its surah and ayahs.
      const name = (row.view === 'surah' ? ayahsInSurah(row.number, [p.page]) : '') || describePassage([p.page], { form: 'compact' });
      return (
        <PageLine
          name={name}
          page={p.page}
          when={recencyShort(p)}
          thread
          last={item.last}
          onPress={() => openPage(p.page)}
          accessibilityLabel={t('activity.lastRevised.pageRow', { name: spokenText(name), page: p.page, when: recencyText(p), open: t('insights.lastRevised.openPage') })}
          testID={`last-revised-page-${row.view}-${row.number}-${p.page}`}
        />
      );
    }
    const row = item.row;
    const when = recencyText(row.oldest);
    if (row.view === 'page') {
      const name = describePassage([row.number]);
      return (
        <PageLine
          name={name}
          page={row.number}
          when={when}
          onPress={() => openPage(row.number)}
          accessibilityLabel={t('activity.lastRevised.pageRow', { name: spokenText(name), page: row.number, when, open: t('insights.lastRevised.openPage') })}
          testID={`last-revised-row-page-${row.number}`}
        />
      );
    }
    const name = rowName(row);
    const key = `${row.view}-${row.number}`;
    // Filtered: how many of its pages are shown ("6 of 20 pages").
    const part = row.pages.length < row.total ? t('insights.lastRevised.pagesOf', { shown: row.pages.length, count: row.total }) : null;
    const meta = part ? `${when} · ${part}` : when;
    return (
      <ThreadRow
        mark={<Mark label={String(row.number)} />}
        name={name}
        meta={meta}
        metaBelow
        lineBelow={item.open}
        separator={!item.open}
        figure={<Ionicons name={item.open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.secondary} />}
        onPress={() => toggle(key)}
        accessibilityLabel={`${spokenText(name)}. ${meta}. ${item.open ? t('insights.lastRevised.hidePages') : t('insights.lastRevised.showPages')}`}
        testID={`last-revised-row-${key}`}
      />
    );
  };

  const header = (
    <View style={styles.head}>
      <View style={styles.chips} testID="last-revised-controls">
        <ChoiceChip
          size="md"
          label={UNIT_LABEL[view]()}
          onPress={() => setMenu('unit')}
          accessibilityLabel={t('insights.lastRevised.unitA11y', { unit: UNIT_LABEL[view]() })}
          accessibilityHint={t('insights.lastRevised.unitHint')}
          testID="last-revised-unit"
        />
        <ChoiceChip
          size="md"
          label={SORT_LABEL[sort]()}
          onPress={() => setMenu('sort')}
          accessibilityLabel={t('insights.lastRevised.sortA11y', { sort: SORT_LABEL[sort]() })}
          accessibilityHint={t('insights.lastRevised.sortHint')}
          testID="last-revised-sort"
        />
        <ChoiceChip
          size="md"
          label={FILTER_LABEL[filter]()}
          on={filter !== 'all'}
          onPress={() => setMenu('filter')}
          accessibilityLabel={t('insights.lastRevised.filterA11y', { filter: FILTER_LABEL[filter]() })}
          accessibilityHint={t('insights.lastRevised.filterHint')}
          testID="last-revised-filter"
        />
      </View>
      {allCount > 0 ? (
        <ChromeText style={[typeV2.meta, styles.count, { color: palette.secondary }]} testID="last-revised-count">
          {countLine(view, rows.length, allCount)}
        </ChromeText>
      ) : null}
    </View>
  );

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar title={t('insights.lastRevised.title')} onBack={() => navigation.goBack()} separator />
      <FlatList
        style={styles.container}
        data={items}
        keyExtractor={(it) => (it.kind === 'row' ? `${it.row.view}-${it.row.number}` : `${it.row.view}-${it.row.number}:${it.page.page}`)}
        renderItem={renderItem}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: footprint + layoutV2.rowPad }}
        testID="last-revised"
        ListHeaderComponent={header}
        ListEmptyComponent={
          allCount > 0 ? (
            <View style={styles.empty} testID="last-revised-empty-filter">
              <ChromeText style={[typeV2.body, { color: palette.secondary }]}>{t('insights.lastRevised.emptyFilter')}</ChromeText>
              <Tap onPress={() => setFilter('all')} accessibilityRole="button" hitSlop={8} style={styles.showAll} testID="last-revised-show-all">
                <ChromeText style={[typeV2.name, { color: palette.link }]}>{t('insights.lastRevised.showAll')}</ChromeText>
              </Tap>
            </View>
          ) : (
            <ChromeText style={[typeV2.body, styles.empty, { color: palette.secondary }]} testID="last-revised-empty">
              {t('insights.lastRevised.empty')}
            </ChromeText>
          )
        }
      />
      <ActionSheet
        visible={menu === 'unit'}
        onClose={() => setMenu(null)}
        title={t('insights.lastRevised.unitTitle')}
        actions={(['surah', 'juz', 'hizb', 'page'] as const).map((v) => ({
          key: `unit-${v}`,
          label: t(`insights.lastRevised.${v === 'juz' ? 'juzTab' : v === 'hizb' ? 'hizbTab' : v}` as 'insights.lastRevised.surah'),
          subtitle: v === suggested ? t('insights.lastRevised.suggested') : v === 'hizb' ? t('insights.lastRevised.hizbDetail') : undefined,
          selected: v === view,
          onPress: () => {
            setOpen(new Set());
            keep({ ...prefs, view: v });
          },
        }))}
        testID="last-revised-unit-menu"
      />
      <ActionSheet
        visible={menu === 'sort'}
        onClose={() => setMenu(null)}
        title={t('insights.lastRevised.sortTitle')}
        actions={[
          { key: 'sort-recent', label: SORT_LABEL.recent(), subtitle: t('insights.lastRevised.sortRecentDetail'), selected: sort === 'recent' },
          { key: 'sort-waiting', label: SORT_LABEL.waiting(), subtitle: t('insights.lastRevised.sortWaitingDetail'), selected: sort === 'waiting' },
          { key: 'sort-mushaf', label: SORT_LABEL.mushaf(), selected: sort === 'mushaf' },
        ].map((a) => ({
          ...a,
          onPress: () => {
            setSortThisVisit(undefined);
            keep({ ...prefs, sort: a.key.slice(5) as LastRevisedSort });
          },
        }))}
        testID="last-revised-sort-menu"
      />
      <ActionSheet
        visible={menu === 'filter'}
        onClose={() => setMenu(null)}
        title={t('insights.lastRevised.filterTitle')}
        actions={[
          { key: 'filter-all', label: FILTER_LABEL.all(), subtitle: undefined },
          { key: 'filter-week', label: FILTER_LABEL.week(), subtitle: t('insights.lastRevised.filterWeekDetail') },
          { key: 'filter-waiting', label: FILTER_LABEL.waiting(), subtitle: t('insights.lastRevised.filterWaitingDetail') },
          { key: 'filter-never', label: FILTER_LABEL.never(), subtitle: t('insights.lastRevised.filterNeverDetail') },
        ].map((a) => {
          const value = a.key.slice(7) as LastRevisedFilter;
          return { ...a, selected: value === filter, onPress: () => setFilter(value) };
        })}
        testID="last-revised-filter-menu"
      />
    </TopSafeAreaView>
  );
}

/**
 * A page as one line: its passage, the page number as a quiet detail, and when (wrapping under it when the line is
 * full). Under an opened row (`thread`) it sits indented to the row's name, with the thread line from the row's disc
 * running through it (to its middle on the last), and no separator until the group ends; in Pages it is a row of its
 * own.
 */
function PageLine({
  name,
  page,
  when,
  thread = false,
  last = false,
  onPress,
  accessibilityLabel,
  testID,
}: {
  name: string;
  page: number;
  when: string;
  thread?: boolean;
  last?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View>
      <Tap onPress={onPress} pressedOpacity={0.7} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[styles.line, thread ? styles.lineIn : styles.lineTop]} testID={testID}>
        {thread ? (
          <View
            style={[styles.thread, { backgroundColor: palette.separator }, last ? styles.threadEnd : styles.threadThrough]}
            testID={last ? 'last-revised-thread-end' : 'last-revised-thread'}
          />
        ) : null}
        <View style={styles.lineText}>
          <Text style={[thread ? typeV2.body : typeV2.name, styles.lineName, { color: palette.text }]}>
            {name}
            <Text style={[typeV2.meta, { color: palette.secondary }]}>{`  ${pagesNote([page])}`}</Text>
          </Text>
          <Text style={[typeV2.meta, styles.when, { color: palette.secondary }]}>{when}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={palette.secondary} />
      </Tap>
      {!thread || last ? <View style={{ height: layoutV2.hairline, backgroundColor: palette.separator }} /> : null}
    </View>
  );
}

/** Where a row's disc is centred: the thread line runs down from it. */
const THREAD_X = layoutV2.gutter + markV2.top / 2 - layoutV2.threadLine / 2;

const styles = StyleSheet.create({
  container: { flex: 1 },
  head: { paddingHorizontal: layoutV2.gutter, paddingTop: 14, paddingBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  count: { marginTop: 12 },
  empty: { paddingHorizontal: layoutV2.gutter, paddingTop: 16 },
  showAll: { alignSelf: 'flex-start', marginTop: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: layoutV2.gutter },
  lineIn: { minHeight: 44, paddingVertical: 10, paddingLeft: layoutV2.gutter + markV2.top + layoutV2.markGap },
  lineTop: { minHeight: 52, paddingVertical: 14, paddingLeft: layoutV2.gutter },
  // The name wraps in its own column and the recency keeps the right one, level with the name's first line, so a
  // long name ("Adh-Dhariyat 52 to At-Tur 14") never pushes it down a line on its own. At the largest text it may
  // wrap too, within its share of the row.
  lineText: { flex: 1, flexDirection: 'row', alignItems: 'baseline', columnGap: 10 },
  lineName: { flex: 1 },
  when: { flexShrink: 0, maxWidth: '45%', textAlign: 'right' },
  thread: { position: 'absolute', left: THREAD_X, width: layoutV2.threadLine, borderRadius: 1, top: 0 },
  threadThrough: { bottom: 0 },
  threadEnd: { height: '50%' },
});
