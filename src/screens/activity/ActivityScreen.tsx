import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import { setRevoActivityView } from '../../lib/revo/place';
import { useActivitySources } from '../../components/activity/useActivitySources';
import { ActivityCalendar } from '../../components/activity/ActivityCalendar';
import { ActivityBlocksViews, type ViewKind } from '../../components/activity/ActivityBlocksViews';
import { HelpButton } from '../../components/help/HelpButton';
import { HelpToast } from '../../components/help/HelpToast';
import type { PreviewBlock } from '../../components/activity/CalendarMonth';
import { activityBlocksEnabled } from '../../components/activity/DayBlocks';
import { ActivityItemRow, RecentSection } from '../../components/activity/ActivityItemRow';
import { ActivityItem, buildActivityItems } from '../../lib/activityItems';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { buildActivityDays } from '../../lib/activity';
import { journalFirstDay, shiftDay } from '../../lib/journal';
import { addToPlanParams, firstTomorrowPages, putFirstTomorrow } from '../../lib/weakSpotActions';
import { revisablePages } from '../../lib/memorizedAyahs';
import { describePassage } from '../../lib/passages';
import { logger } from '../../lib/logger';
import { UndoToast } from '../../components/revision/UndoToast';
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
  const { user, logs, pages, saveUser } = useApp();
  const { palette } = useTheme();
  // Room for the tab bar (and the mini player) and for Revo's button.
  const tabFootprint = useTabBarFootprint() + useRevoFootprint();

  // The day picked in the calendar (today until one is tapped).
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  // "Revise these first tomorrow" (Insights): the weak pages lead tomorrow's session, labelled From Insights,
  // in front of its own pages (ACT-24). A toast says so, with Undo (it put the carry back as it was);
  // before, the tap saved with no sign of it and read as a dead button (Majd, Nov 8 2026).
  const [carryToast, setCarryToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const reviseTomorrow = (weak: number[]) => {
    if (!user || weak.length === 0) return;
    putFirstTomorrow({ user, saveUser, today, pages: weak, name: describePassage(weak, { form: 'short' }), latest: () => userRef.current })
      .then(({ text, undo }) =>
        setCarryToast({ text, undo: () => void undo().catch((err) => logger.warn('Could not undo "first tomorrow"', err)) }),
      )
      .catch((err) => {
        logger.warn('Could not put pages first tomorrow', err);
        setCarryToast({ text: "Couldn't put them first tomorrow. Try again." });
      });
  };

  const { day: today, date: revisionDate } = useRevisionDay(user);
  // "Add to plan" (a custom plan, under "First tomorrow"): tomorrow's day of the plan with the pages
  // added; the plan changes only when it is saved (ACT-24).
  const addToPlan = (added: number[]) => {
    if (user?.customPlan) navigation.navigate('PlanDayEdit', addToPlanParams(user, revisablePages(pages), revisionDate, added));
  };
  // Pages already first tomorrow: their buttons say so ("First tomorrow ✓") and can't be tapped again.
  const firstTomorrow = useMemo(() => firstTomorrowPages(user, shiftDay(today, 1)), [user, today]);
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

  const openDay = (date: string, focusBlock?: PreviewBlock) => navigation.navigate('ActivityDay', { date, ...(focusBlock ? { focusBlock } : {}) });
  const logToday = () => navigation.navigate('JournalEntry', { date: today });
  // Days with a note in the log (the flagged calendar's note dot).
  const noteDays = useMemo(
    () => new Set((journal ?? []).filter((d) => d.entries.some((n) => n.kind === 'note' && n.text.trim() !== '')).map((d) => d.date)),
    [journal],
  );
  const blocks = activityBlocksEnabled(user);
  const [view, setView] = useState<ViewKind>('calendar');
  // Revo opened from here starts on the tab on show (REVO-38).
  useEffect(() => {
    setRevoActivityView(view);
    return () => setRevoActivityView('calendar');
  }, [view]);

  const recentItems = items.slice(0, RECENT_ITEMS);
  const openItem = (it: ActivityItem) =>
    navigation.navigate('ActivityDay', { date: it.day, ...(it.recordingId ? { focusRecordingId: it.recordingId } : {}) });

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar
        title="Activity"
        onBack={() => navigation.goBack()}
        right={
          blocks ? (
            <>
              {/* Its help (HELP-1) explains the tab on show. */}
              <HelpButton screen={view === 'insights' ? 'insights' : 'activity'} />
              <IconButton icon="search" label="Search" onPress={() => navigation.navigate('ActivityAll')} size={22} />
            </>
          ) : (
            <IconButton icon="add" label="Log today" onPress={logToday} size={28} />
          )
        }
        separator
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.secondary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.secondary} />}
          testID="activity-v2"
        >
          {loadError && (
            <Tap onPress={load} style={[v2.banner, { borderBottomColor: palette.separator }]} accessibilityRole="button">
              <Ionicons name="cloud-offline-outline" size={18} color={palette.secondary} />
              <Text style={[typeV2.body, { color: palette.text, flex: 1 }]}>Couldn't load all of your activity. Tap to retry.</Text>
            </Tap>
          )}
          {blocks ? (
            <ActivityBlocksViews
              today={today}
              noteDays={noteDays}
              onOpenDay={openDay}
              onReviseTomorrow={reviseTomorrow}
              firstTomorrow={firstTomorrow}
              // The reader over Activity, so back returns here (as a day's strip does, ACT-20).
              onOpenPage={(pageNumber) => navigation.navigate('QuranReader', { pageNumber })}
              onSeeAllPages={() => navigation.navigate('PagesByStrength')}
              onTurnOnSmartTracking={() => navigation.navigate('Settings', { section: 'revision' })}
              onViewChange={setView}
              // First tomorrow on every plan, for that day only (Majd, Nov 8 2026: a custom plan's day
              // used to open, and saving it replaced that day in every cycle).
              onPlanIt={reviseTomorrow}
              onAddToPlan={user?.customPlan ? addToPlan : undefined}
            />
          ) : (
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
          )}
          {!blocks ? (
          <>
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
          </>
          ) : null}
        </ScrollView>
      )}
      <UndoToast
        visible={carryToast != null}
        message={carryToast?.text ?? ''}
        onUndo={carryToast?.undo ? () => {
          const undo = carryToast.undo;
          setCarryToast(null);
          undo?.();
        } : undefined}
        actionLabel="Undo"
        duration={6000}
        onDismiss={() => setCarryToast(null)}
        bottomInset={tabFootprint}
      />
      <HelpToast screen="activity" bottomInset={tabFootprint} />
      <HelpToast screen="insights" bottomInset={tabFootprint} />
    </TopSafeAreaView>
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
