import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
// Gesture Handler's: the tab pager's swipe must be able to start on this screen (over React Native's own, the pager's
// pan never started; CLAUDE.md, UI traps).
import { ScrollView } from 'react-native-gesture-handler';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import { setRevoActivityView } from '../../lib/revo/place';
import { useActivitySources } from '../../components/activity/useActivitySources';
import { ActivityCalendar } from '../../components/activity/ActivityCalendar';
import { ActivityBlocksViews, type ViewKind } from '../../components/activity/ActivityBlocksViews';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useReduceMotion } from '../../design/motion';
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
import { firstNoteText, journalFirstDay } from '../../lib/journal';
import { activityOneTabEnabled } from '../../lib/release/activityOneTab';
import { useInsightsActions } from './useInsightsActions';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { IconButton, TopBar } from '../../components/v2/TopBar';
import { Tap } from '../../components/v2/Tap';
import { layoutV2, typeV2 } from '../../theme/v2';
import { t } from '../../i18n';

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
  // Room for the tab bar (and the mini player) and for Revo's button.
  const tabFootprint = useTabBarFootprint() + useRevoFootprint();

  // The day picked in the calendar (today until one is tapped).
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const { day: today } = useRevisionDay(user);
  // Insights' buttons (the weak pages first tomorrow, with its toast; the reader; Settings), shared with a section's page.
  const { props: insightsActions, toast: carryToast } = useInsightsActions(tabFootprint);
  const oneTab = activityOneTabEnabled();
  const { readings, journal, recordings, loading, loadError, load } = useActivitySources();
  // Pull to refresh reads everything again (ACT-27): the readings and notes, and Overview's and Insights'
  // items (they were left out, so a pull never changed Coverage). The spinner always ends (usePullToRefresh).
  const blocksRefresh = useRef<(() => Promise<unknown>) | null>(null);
  const refreshAll = useCallback(() => Promise.all([load(), blocksRefresh.current?.()]), [load]);
  const { refreshing, onRefresh } = usePullToRefresh(refreshAll);
  // Insights opening Overview's calendar (the longest gap, a month's bar) starts it at the top: the two views share
  // this scroll, so from deep in Insights the calendar's title was left under the header (ACT-28).
  const scrollRef = useRef<ScrollView>(null);
  // A press on the Activity tab while it shows scrolls to the top, as Home's and Read's do.
  useScrollToTop(scrollRef);
  const reduceMotion = useReduceMotion();
  const showTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion }), [reduceMotion]);
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
  // Today's day, whose + adds a note (the old log page is gone, ACT-6).
  const logToday = () => navigation.navigate('ActivityDay', { date: today });
  // Days with a note in the log (the flagged calendar's note dot).
  const noteDays = useMemo(
    () => new Set((journal ?? []).filter((d) => d.entries.some((n) => n.kind === 'note' && n.text.trim() !== '')).map((d) => d.date)),
    [journal],
  );
  // Each day's note, for its entry under the calendar (ACT-34).
  const noteTexts = useMemo(() => new Map((journal ?? []).map((d) => [d.date, firstNoteText(d)])), [journal]);
  const noteOf = useCallback((day: string) => noteTexts.get(day) ?? null, [noteTexts]);
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
        title={t('activity.screen.title')}
        right={
          blocks ? (
            <>
              {/* Its help (HELP-1) explains the tab on show. */}
              <HelpButton screen={view === 'insights' && !oneTab ? 'insights' : 'activity'} />
              <IconButton icon="search" label={t('common.search')} onPress={() => navigation.navigate('ActivityAll')} size={22} />
            </>
          ) : (
            <IconButton icon="add" label={t('activity.screen.logToday')} onPress={logToday} size={28} />
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
          ref={scrollRef}
          style={styles.scroll}
          contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
          refreshControl={
            // Transparent, as Home's: iOS paints the pull area opaque otherwise.
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.secondary} style={{ backgroundColor: 'transparent' }} />
          }
          testID="activity-v2"
        >
          {loadError && (
            <Tap onPress={load} style={[v2.banner, { borderBottomColor: palette.separator }]} accessibilityRole="button">
              <Ionicons name="cloud-offline-outline" size={18} color={palette.secondary} />
              <Text style={[typeV2.body, { color: palette.text, flex: 1 }]}>{t('activity.screen.couldntLoad')}</Text>
            </Tap>
          )}
          {blocks ? (
            <ActivityBlocksViews
              {...insightsActions}
              today={today}
              noteDays={noteDays}
              noteOf={noteOf}
              onAddNote={(date) => navigation.navigate('ActivityDay', { date, addNote: true })}
              onOpenDay={openDay}
              onViewChange={setView}
              onShowTop={showTop}
              refreshRef={blocksRefresh}
              // The one tab's rows (ACT-35): each section on a page of its own.
              onOpenSection={(section) => navigation.navigate('ActivitySection', { section })}
              // This week's "Month ›" (Majd's T1): the full calendar on its own page.
              onOpenMonth={() => navigation.navigate('ActivityMonth')}
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
            emptyText={t('activity.all.noSessions')}
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
      {carryToast}
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
