import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ActivityItemRow } from '../../components/activity/ActivityItemRow';
import { useActivitySources } from '../../components/activity/useActivitySources';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import { OptionSheet } from '../../components/OptionSheet';
import { PillButton } from '../../components/v2/PillButton';
import { Tap } from '../../components/v2/Tap';
import { TopBar } from '../../components/v2/TopBar';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import {
  ACTIVITY_KIND_LABELS,
  ACTIVITY_KINDS,
  ActivityItem,
  ActivityKind,
  buildActivityItems,
  filterActivityItems,
} from '../../lib/activityItems';
import { JournalFilter, journalFilterLabel } from '../../lib/journal';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { reciteLiveForAccount } from '../../lib/reciteLive/availability';
import { useMemoryRecords } from '../../lib/reciteMemory/store';
import type { TakeRecord } from '../../lib/reciteMemory/record';
import { takeWhen } from '../../lib/reciteMemory/describe';
import { useTakeRecordings } from '../../lib/reciteMemory/takeAudio';
import { TakeListRow, useQuranWordsWhen } from '../../components/reciteMemory/TakeRows';
import { passageOf } from '../../components/reciteLive/TakeSummarySheet';
import { plainText } from '../../lib/passages';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ActivityAll'>;
/** `recitation`: Recite's takes (Revisely Dev), listed from its memory rather than the activity items. */
type Kind = ActivityKind | 'all' | 'recitation';
type TakesFilter = 'all' | 'mistakes' | 'hidden';
const TAKES_FILTERS: { value: TakesFilter; label: string }[] = [
  { value: 'all', label: 'All takes' },
  { value: 'mistakes', label: 'With mistakes' },
  { value: 'hidden', label: 'Page hidden' },
];

/** The ISO day `n` days from `day`. */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/**
 * Everything done, newest first, behind "See all" on Activity and Home (new
 * design only): a search over pages, surahs, dates and notes, a filter by kind
 * and one by date. An item opens its day.
 */
export default function ActivityAllScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<HomeStackParamList, 'ActivityAll'>>();
  const { user, logs } = useApp();
  const { palette } = useTheme();
  // Room for the tab bar (and the mini player) and for Revo's button.
  const tabFootprint = useTabBarFootprint() + useRevoFootprint();
  const { day: today } = useRevisionDay(user);
  const { readings, journal, recordings, loading } = useActivitySources();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>(route.params?.kind ?? 'all');
  const [range, setRange] = useState<JournalFilter>('all');
  const [rangeOpen, setRangeOpen] = useState(false);

  const items = useMemo(
    () => buildActivityItems({ logs, readings, journal, recordings }, user),
    [logs, readings, journal, recordings, user],
  );
  const shown = useMemo(
    () => (kind === 'recitation' ? [] : filterActivityItems(items, { kind, range, query }, today)),
    [items, kind, range, query, today],
  );
  // Recite's takes (Revisely Dev): every take with Mark mistakes, newest first, with their own choices.
  const memoryOn = reciteLiveForAccount(user);
  const memoryRecords = useMemoryRecords(user?.id, memoryOn);
  const reciting = kind === 'recitation';
  const takeWords = useQuranWordsWhen(reciting);
  const takeRecordings = useTakeRecordings(reciting);
  const [takesFilter, setTakesFilter] = useState<TakesFilter>('all');
  const now = Date.now();
  const takesShown = useMemo(() => {
    if (!reciting) return [];
    const q = query.trim().toLowerCase();
    return memoryRecords
      .filter((r): r is TakeRecord => r.kind === 'take' && !r.deleted)
      .filter((t) => (takesFilter === 'mistakes' ? t.mistakes > 0 : takesFilter === 'hidden' ? t.hidden : true))
      .filter((t) =>
        range === 'all'
          ? true
          : range === 'last7'
            ? t.day >= addDays(today, -6)
            : range === 'last30'
              ? t.day >= addDays(today, -29)
              : t.day.startsWith(range),
      )
      .filter((t) => {
        if (!q) return true;
        const name = takeWords ? plainText(passageOf(takeWords, t.from, t.to)).toLowerCase() : '';
        return name.includes(q) || t.day.includes(q) || takeWhen(t.createdAt, now).toLowerCase().includes(q);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    // `now` moves every render; the list needn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciting, memoryRecords, takesFilter, range, query, today, takeWords]);
  const months = useMemo(() => [...new Set(items.map((i) => i.day.slice(0, 7)))].sort().reverse(), [items]);

  const open = (it: ActivityItem) =>
    navigation.navigate('ActivityDay', { date: it.day, ...(it.recordingId ? { focusRecordingId: it.recordingId } : {}) });

  const filtered = query.trim() !== '' || kind !== 'all' || range !== 'all';

  const header = (
    <View style={[styles.controls, { borderBottomColor: palette.separator }]}>
      <View style={[styles.search, { backgroundColor: palette.fill }]}>
        <Ionicons name="search" size={18} color={palette.secondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search pages, surahs, dates"
          placeholderTextColor={palette.secondary}
          style={[typeV2.body, styles.input, { color: palette.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
          accessibilityLabel="Search activity"
          testID="activity-search"
        />
        {query !== '' ? (
          <Tap onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={palette.secondary} />
          </Tap>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} keyboardShouldPersistTaps="handled">
        <PillButton
          title={journalFilterLabel(range)}
          icon="calendar-outline"
          size="sm"
          variant={range !== 'all' ? 'solid' : 'outline'}
          onPress={() => setRangeOpen(true)}
          accessibilityLabel={`Dates: ${journalFilterLabel(range)}`}
          testID="filter-range"
        />
        {(['all', ...ACTIVITY_KINDS.flatMap((x) => (x === 'revision' && memoryOn ? [x, 'recitation'] : [x]))] as Kind[]).map((k) => (
          <PillButton
            key={k}
            title={k === 'all' ? 'All' : k === 'recitation' ? 'Recitations' : ACTIVITY_KIND_LABELS[k]}
            size="sm"
            variant={kind === k ? 'solid' : 'outline'}
            onPress={() => setKind(k)}
            accessibilityLabel={`Show ${k === 'all' ? 'everything' : k === 'recitation' ? 'Recitations' : ACTIVITY_KIND_LABELS[k]}`}
            testID={`filter-${k}`}
          />
        ))}
      </ScrollView>
      {reciting ? (
        <>
          <View style={styles.pills}>
            {TAKES_FILTERS.map((f) => (
              <PillButton
                key={f.value}
                title={f.label}
                size="sm"
                variant={takesFilter === f.value ? 'solid' : 'outline'}
                onPress={() => setTakesFilter(f.value)}
                accessibilityLabel={`Show ${f.label.toLowerCase()}`}
                testID={`filter-takes-${f.value}`}
              />
            ))}
          </View>
          <Text style={[typeV2.meta, styles.takesCount, { color: palette.secondary }]} testID="activity-all-takes-count">
            {`${takesShown.length} ${takesShown.length === 1 ? 'take' : 'takes'} · ${takesShown.reduce((n, t) => n + t.mistakes, 0)} mistakes`}
          </Text>
        </>
      ) : null}
    </View>
  );

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar title="All activity" onBack={() => navigation.goBack()} separator />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.secondary} />
        </View>
      ) : (
        reciting ? (
          <FlatList
            data={takesShown}
            keyExtractor={(t) => t.id}
            renderItem={({ item, index }) => (
              <TakeListRow
                take={item}
                words={takeWords}
                now={now}
                first={index === 0}
                playable={item.recordingId != null && takeRecordings.has(item.recordingId)}
                onPlay={() => item.recordingId && navigation.navigate('ListenBack', { recordingId: item.recordingId })}
                onPress={() => navigation.navigate('ActivityDay', { date: item.day })}
              />
            )}
            ListHeaderComponent={header}
            ListEmptyComponent={
              <Text style={[typeV2.body, styles.empty, { color: palette.secondary }]} testID="all-empty">
                {filtered ? 'Nothing matches.' : 'No takes yet.'}
              </Text>
            }
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
            testID="activity-all-takes"
          />
        ) : (
        <FlatList
          data={shown}
          keyExtractor={(it) => it.key}
          renderItem={({ item }) => <ActivityItemRow item={item} today={today} onPress={() => open(item)} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={[typeV2.body, styles.empty, { color: palette.secondary }]} testID="all-empty">
              {filtered ? 'Nothing matches.' : 'No sessions yet. Start your first revision from Home.'}
            </Text>
          }
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
          initialNumToRender={15}
          testID="activity-all"
        />
        )
      )}
      <OptionSheet<JournalFilter>
        visible={rangeOpen}
        title="Dates"
        sections={[
          { options: (['all', 'last7', 'last30'] as JournalFilter[]).map((f) => ({ value: f, label: journalFilterLabel(f) })) },
          ...(months.length > 0
            ? [{ title: 'By month', options: months.map((m) => ({ value: m, label: journalFilterLabel(m) })) }]
            : []),
        ]}
        value={range}
        onSelect={setRange}
        onClose={() => setRangeOpen(false)}
      />
    </TopSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  controls: { paddingTop: 12, borderBottomWidth: layoutV2.hairline },
  takesCount: { paddingHorizontal: layoutV2.gutter, paddingBottom: 10 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: layoutV2.gutter,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radiusV2.media,
  },
  input: { flex: 1, paddingVertical: 0 },
  pills: { flexDirection: 'row', gap: 8, paddingHorizontal: layoutV2.gutter, paddingVertical: 12 },
  empty: { paddingHorizontal: layoutV2.gutter, paddingVertical: layoutV2.rowPad },
});
