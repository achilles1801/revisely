// One section of Activity on a page of its own (ACT-35, version A): its name and the range chip at the top, then the section
// as Insights drew it (Coverage's juz tiles, Consistency's days, and so on). Opened from its row on the one Activity tab.

import React, { useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
// Gesture Handler's, as Activity's own: the tab pager's swipe must be able to start (CLAUDE.md, UI traps).
import { ScrollView } from 'react-native-gesture-handler';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { BarTitle, IconButton, TopBar } from '../../components/v2/TopBar';
import { t } from '../../i18n';
import { backIcon } from '../../i18n/direction';
import { ActivityBlocksViews } from '../../components/activity/ActivityBlocksViews';
import { InsightsRangeChip } from '../../components/activity/InsightsRangeChip';
import { HelpButton } from '../../components/help/HelpButton';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import { SECTION_LABELS, sectionBar } from '../../lib/activitySections';
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
  const { width, fontScale } = useWindowDimensions();
  const bar = sectionBar(width, fontScale);
  const chip = <InsightsRangeChip firstDay={journalFirstDay(user, [])} testID="section-range" />;
  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="activity-section">
      {/* Back and help on one side, the range on the other, so the name has the middle: with both on the right (sides of
          150 pt) it had 70 pt on a 402 pt iPhone and every name was cut ("Memo…", "Cover…"; the iOS E2E shots, Nov 28).
          With large text the range goes to the top of the page instead (sectionBar). */}
      <TopBar
        center={<BarTitle title={SECTION_LABELS.insights[section]} fit />}
        left={
          <>
            <IconButton icon={backIcon()} onPress={() => navigation.goBack()} label={t('common.back')} size={26} testID="back" />
            <HelpButton screen="insights" />
          </>
        }
        right={bar.chipInBar ? chip : undefined}
        sideWidth={bar.side}
        separator
      />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottom + layoutV2.rowPad }} contentInsetAdjustmentBehavior="never">
        {bar.chipInBar ? null : (
          <View style={styles.chipRow} testID="section-range-row">
            {chip}
          </View>
        )}
        <ActivityBlocksViews
          {...props}
          section={section}
          noteDays={new Set()}
          onOpenDay={(date) => navigation.navigate('ActivityDay', { date })}
          // Consistency's figure and a gap (ACT-23, ACT-28): the full calendar, at that month, the gap marked.
          onOpenCalendar={(month, gap) => navigation.navigate('ActivityMonth', { calendarAt: { month, ...(gap ? { gap } : {}) } })}
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
  // The range chip where the bar has no room for it (large text): the top of the page, at its end.
  chipRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: layoutV2.gutter, paddingTop: 10 },
});
