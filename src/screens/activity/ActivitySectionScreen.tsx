// One section of Activity on a page of its own (ACT-35, version A): its name and the range chip at the top, then the section
// as Insights drew it (Coverage's juz tiles, Consistency's days, and so on). Opened from its row on the one Activity tab.

import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
// Gesture Handler's, as Activity's own: the tab pager's swipe must be able to start (CLAUDE.md, UI traps).
import { ScrollView } from 'react-native-gesture-handler';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { TopBar } from '../../components/v2/TopBar';
import { ActivityBlocksViews } from '../../components/activity/ActivityBlocksViews';
import { InsightsRangeChip } from '../../components/activity/InsightsRangeChip';
import { HelpButton } from '../../components/help/HelpButton';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import { SECTION_LABELS } from '../../lib/activitySections';
import { journalFirstDay } from '../../lib/journal';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2 } from '../../theme/v2';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { useInsightsActions } from './useInsightsActions';

export default function ActivitySectionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ActivitySection'>>();
  const { section } = useRoute<RouteProp<HomeStackParamList, 'ActivitySection'>>().params;
  const { user } = useApp();
  const { palette } = useTheme();
  const bottom = useTabBarFootprint() + useRevoFootprint();
  const { props, toast } = useInsightsActions(bottom);
  const refresh = useRef<(() => Promise<unknown>) | null>(null);
  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="activity-section">
      <TopBar
        title={SECTION_LABELS.insights[section]}
        onBack={() => navigation.goBack()}
        right={
          <>
            <HelpButton screen="insights" />
            <InsightsRangeChip firstDay={journalFirstDay(user, [])} testID="section-range" />
          </>
        }
        sideWidth={150}
        separator
      />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottom + layoutV2.rowPad }} contentInsetAdjustmentBehavior="never">
        <ActivityBlocksViews
          {...props}
          section={section}
          noteDays={new Set()}
          onOpenDay={(date) => navigation.navigate('ActivityDay', { date })}
          // Consistency's figure and a gap (ACT-23, ACT-28): the tab's calendar, at that month, the gap marked.
          onOpenCalendar={(month, gap) => navigation.navigate('Activity', { calendarAt: { month, ...(gap ? { gap } : {}) } })}
          refreshRef={refresh}
        />
      </ScrollView>
      {toast}
    </TopSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
});
