import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ActivityItemRow } from '../../components/activity/ActivityItemRow';
import { useActivitySources } from '../../components/activity/useActivitySources';
import { useTabBarFootprint } from '../../components/LiquidGlassTabBar';
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

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ActivityAll'>;
type Kind = ActivityKind | 'all';

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
  const tabFootprint = useTabBarFootprint();
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
  const shown = useMemo(() => filterActivityItems(items, { kind, range, query }, today), [items, kind, range, query, today]);
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
        {(['all', ...ACTIVITY_KINDS] as Kind[]).map((k) => (
          <PillButton
            key={k}
            title={k === 'all' ? 'All' : ACTIVITY_KIND_LABELS[k]}
            size="sm"
            variant={kind === k ? 'solid' : 'outline'}
            onPress={() => setKind(k)}
            accessibilityLabel={`Show ${k === 'all' ? 'everything' : ACTIVITY_KIND_LABELS[k]}`}
            testID={`filter-${k}`}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar title="All activity" onBack={() => navigation.goBack()} separator />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.secondary} />
        </View>
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
          contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
          initialNumToRender={15}
          testID="activity-all"
        />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  controls: { paddingTop: 12, borderBottomWidth: layoutV2.hairline },
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
