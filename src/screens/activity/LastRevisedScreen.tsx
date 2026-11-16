// Last revised (ACT-30): when each memorized surah, juz, hizb or page was last revised, longest waiting first.
// Reached from Insights' Gaps ("When did I last revise…?", and its full revision line). Surah | Juz | Hizb |
// Page as Activity's ink tabs (Surah at first; the choice kept on the phone); a surah, juz or hizb opens to its
// pages; a page opens the reader there. Recency only (ACT-19). The rows come from lib/lastRevised.

import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { TopBar } from '../../components/v2/TopBar';
import { PillTabs } from '../../components/v2/PillTabs';
import { ThreadRow } from '../../components/v2/ThreadRow';
import { Mark } from '../../components/v2/Mark';
import { ChromeText } from '../../components/activity/ChromeText';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { layoutV2, typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { revisablePages } from '../../lib/memorizedAyahs';
import { coverageSince, lastRevisedDay } from '../../lib/recency';
import { journalFirstDay } from '../../lib/journal';
import { describePassage, pagesNote, spokenText } from '../../lib/passages';
import { getSurahForPage } from '../../lib/quranData';
import {
  LAST_REVISED_VIEW_KEY,
  lastRevisedRows,
  parseLastRevisedView,
  recencyText,
  rowName,
  type LastRevisedRow,
  type LastRevisedView,
  type PageRecency,
} from '../../lib/lastRevised';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'LastRevised'>;

/** A list item: a row, or one of an opened row's pages. */
type Item = { kind: 'row'; row: LastRevisedRow } | { kind: 'page'; page: PageRecency; under: string };

export default function LastRevisedScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, pages } = useApp();
  const { palette } = useTheme();
  const { day: today } = useRevisionDay(user);
  const footprint = useTabBarFootprint() + useRevoFootprint();
  const [view, setViewState] = useState<LastRevisedView>('surah');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(LAST_REVISED_VIEW_KEY)
      .then((v) => setViewState(parseLastRevisedView(v)))
      .catch(() => undefined);
  }, []);
  const setView = (next: LastRevisedView) => {
    setViewState(next);
    setOpen(new Set());
    AsyncStorage.setItem(LAST_REVISED_VIEW_KEY, next).catch(() => undefined);
  };

  const rows = useMemo(() => {
    const memorized = revisablePages(pages);
    const firstDay = journalFirstDay(user, []);
    const last = new Map(memorized.filter((p) => p.lastRevisedDate).map((p) => [p.pageNumber, lastRevisedDay(user, p.lastRevisedDate as string)]));
    const since = new Map(memorized.map((p) => [p.pageNumber, coverageSince(p.dateMemorized, firstDay)]));
    return lastRevisedRows(view, {
      memorized: memorized.map((p) => p.pageNumber),
      last: (p) => last.get(p) ?? null,
      since: (p) => since.get(p) ?? null,
      today,
    });
  }, [view, pages, user, today]);

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const row of rows) {
      out.push({ kind: 'row', row });
      const key = `${row.view}-${row.number}`;
      if (row.view !== 'page' && open.has(key)) for (const page of row.pages) out.push({ kind: 'page', page, under: key });
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
      const name = describePassage([p.page], { form: 'compact' });
      const when = recencyText(p);
      return (
        <ThreadRow
          depth={1}
          mark={<Mark size="reply" label={String(p.page)} />}
          name={name}
          nameAfter={<ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{`  ${pagesNote([p.page])}`}</ChromeText>}
          meta={when}
          metaBelow
          figure={<Ionicons name="chevron-forward" size={16} color={palette.secondary} />}
          onPress={() => openPage(p.page)}
          accessibilityLabel={`${spokenText(name)}, page ${p.page}. ${when}. ${t('insights.lastRevised.openPage')}`}
          testID={`last-revised-page-${item.under}-${p.page}`}
        />
      );
    }
    const row = item.row;
    const name = rowName(row);
    const when = recencyText(row.oldest);
    if (row.view === 'page') {
      return (
        <ThreadRow
          mark={<Mark label={String(getSurahForPage(row.number)?.number ?? row.number)} />}
          name={name}
          nameAfter={<ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{`  ${pagesNote([row.number])}`}</ChromeText>}
          meta={when}
          metaBelow
          figure={<Ionicons name="chevron-forward" size={16} color={palette.secondary} />}
          onPress={() => openPage(row.number)}
          accessibilityLabel={`${spokenText(name)}, page ${row.number}. ${when}. ${t('insights.lastRevised.openPage')}`}
          testID={`last-revised-row-page-${row.number}`}
        />
      );
    }
    const key = `${row.view}-${row.number}`;
    const isOpen = open.has(key);
    return (
      <ThreadRow
        mark={<Mark label={String(row.number)} />}
        name={name}
        meta={when}
        metaBelow
        figure={<Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={palette.secondary} />}
        onPress={() => toggle(key)}
        accessibilityLabel={`${spokenText(name)}. ${when}. ${isOpen ? t('insights.lastRevised.hidePages') : t('insights.lastRevised.showPages')}`}
        testID={`last-revised-row-${key}`}
      />
    );
  };

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar title={t('insights.lastRevised.title')} onBack={() => navigation.goBack()} separator />
      <FlatList
        style={styles.container}
        data={items}
        keyExtractor={(it) => (it.kind === 'row' ? `${it.row.view}-${it.row.number}` : `${it.under}:${it.page.page}`)}
        renderItem={renderItem}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: footprint + layoutV2.rowPad }}
        testID="last-revised"
        ListHeaderComponent={
          <View style={styles.head}>
            <PillTabs<LastRevisedView>
              options={[
                { value: 'surah', label: t('insights.lastRevised.surah') },
                { value: 'juz', label: t('insights.lastRevised.juzTab') },
                { value: 'hizb', label: t('insights.lastRevised.hizbTab') },
                { value: 'page', label: t('insights.lastRevised.page') },
              ]}
              value={view}
              onChange={setView}
              tone="ink"
              hug
              testID="last-revised-views"
            />
            <ChromeText style={[typeV2.meta, styles.detail, { color: palette.secondary }]}>{t('insights.lastRevised.detail')}</ChromeText>
          </View>
        }
        ListEmptyComponent={
          <ChromeText style={[typeV2.body, styles.empty, { color: palette.secondary }]} testID="last-revised-empty">
            {t('insights.lastRevised.empty')}
          </ChromeText>
        }
      />
    </TopSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  head: { paddingHorizontal: layoutV2.gutter, paddingTop: layoutV2.rowPad, paddingBottom: 6 },
  detail: { marginTop: 10 },
  empty: { paddingHorizontal: layoutV2.gutter, paddingTop: 16 },
});
