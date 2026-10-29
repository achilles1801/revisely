import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from '../../components/SafeAreaView';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useActivitySources } from '../../components/activity/useActivitySources';
import { ActivityCalendar } from '../../components/activity/ActivityCalendar';
import { ActivityItemRow, RecentSection } from '../../components/activity/ActivityItemRow';
import { ActivityItem, buildActivityItems } from '../../lib/activityItems';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { buildActivityDays } from '../../lib/activity';
import { journalFirstDay } from '../../lib/journal';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { IconButton, TopBar } from '../../components/v2/TopBar';
import { Tap } from '../../components/v2/Tap';
import { layoutV2, typeV2 } from '../../theme/v2';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Activity'>;

// Recent is the last few things done; the rest is "See all".
const RECENT_ITEMS = 3;

/**
 * Everything you did, day by day: revision sessions, timed reading sessions,
 * recordings and the daily log. A calendar, a month by default or a week (a
 * cell per day, darker the more it held; tap one to see that day in a line
 * under it), then the last few things done. Everything else is behind "See
 * all", searchable.
 */
export default function ActivityScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, logs } = useApp();
  const { palette } = useTheme();
  const tabFootprint = useTabBarFootprint();

  // The day picked in the calendar (today until one is tapped).
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const { day: today } = useRevisionDay(user);
  const { readings, journal, recordings, loading, refreshing, loadError, load, onRefresh } = useActivitySources();
  const recordingDays = useMemo(() => recordings.map((rec) => rec.day), [recordings]);

  const days = useMemo(
    () => buildActivityDays({ logs, readings, journal, recordingDays }, user),
    [logs, readings, journal, recordingDays, user],
  );
  const items = useMemo(
    () => buildActivityItems({ logs, readings, journal, recordings }, user),
    [logs, readings, journal, recordings, user],
  );
  // The calendar steps back no further than the account's first day.
  const firstDay = useMemo(() => journalFirstDay(user, days), [user, days]);

  const openDay = (date: string) => navigation.navigate('ActivityDay', { date });
  const logToday = () => navigation.navigate('JournalEntry', { date: today });

  const recentItems = items.slice(0, RECENT_ITEMS);
  const openItem = (it: ActivityItem) =>
    navigation.navigate('ActivityDay', { date: it.day, ...(it.recordingId ? { focusRecordingId: it.recordingId } : {}) });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar
        title="Activity"
        onBack={() => navigation.goBack()}
        right={<IconButton icon="add" label="Log today" onPress={logToday} size={28} />}
        separator
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.secondary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.secondary} />}
          testID="activity-v2"
        >
          {loadError && (
            <Tap onPress={load} style={[v2.banner, { borderBottomColor: palette.separator }]} accessibilityRole="button">
              <Ionicons name="cloud-offline-outline" size={18} color={palette.secondary} />
              <Text style={[typeV2.body, { color: palette.text, flex: 1 }]}>Couldn't load all of your activity. Tap to retry.</Text>
            </Tap>
          )}
          <View style={v2.graph}>
            <ActivityCalendar
              days={days}
              today={today}
              firstDay={firstDay}
              selected={pickedDay ?? today}
              onSelect={setPickedDay}
              onOpenDay={openDay}
            />
          </View>
          <View style={{ height: layoutV2.hairline, backgroundColor: palette.separator }} />
          <RecentSection
            count={recentItems.length}
            emptyText="No sessions yet. Start your first revision from Home."
            onSeeAll={() => navigation.navigate('ActivityAll')}
            testID="activity-recent"
          >
            {recentItems.map((it, i) => (
              <ActivityItemRow
                key={it.key}
                item={it}
                today={today}
                onPress={() => openItem(it)}
                separator={i < recentItems.length - 1}
              />
            ))}
          </RecentSection>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
});

// The new design.
const v2 = StyleSheet.create({
  graph: { paddingHorizontal: layoutV2.gutter, paddingTop: layoutV2.rowPad, paddingBottom: layoutV2.rowPad },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 12,
    borderBottomWidth: layoutV2.hairline,
  },
});
