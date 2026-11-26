// The one Activity tab's full calendar (ACT-35; Majd's T1, Nov 26 2026): "Month ›" over this week opens it. The month (or a
// week), Week | Month, Today and the arrows, its totals and key, then the picked day in C2's form. A section's Consistency
// figure or a gap opens it at that month, the gap marked (ACT-23, ACT-28).

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
// Gesture Handler's, as Activity's own (CLAUDE.md, UI traps).
import { ScrollView } from 'react-native-gesture-handler';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { TopBar } from '../../components/v2/TopBar';
import { ActivityBlocksViews } from '../../components/activity/ActivityBlocksViews';
import { useActivitySources } from '../../components/activity/useActivitySources';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2 } from '../../theme/v2';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { useInsightsActions } from './useInsightsActions';
import { t } from '../../i18n';

export default function ActivityMonthScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ActivityMonth'>>();
  const calendarAt = useRoute<RouteProp<HomeStackParamList, 'ActivityMonth'>>().params?.calendarAt ?? null;
  const { palette } = useTheme();
  const bottom = useTabBarFootprint() + useRevoFootprint();
  const { props } = useInsightsActions(bottom);
  const { journal } = useActivitySources();
  // Days with a note (the calendar's note mark).
  const noteDays = useMemo(
    () => new Set((journal ?? []).filter((d) => d.entries.some((n) => n.kind === 'note' && n.text.trim() !== '')).map((d) => d.date)),
    [journal],
  );
  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="activity-month">
      <TopBar title={t('activity.oneTab.calendar')} onBack={() => navigation.goBack()} separator />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottom + layoutV2.rowPad }} contentInsetAdjustmentBehavior="never">
        <ActivityBlocksViews
          {...props}
          monthPage
          calendarAt={calendarAt}
          noteDays={noteDays}
          onOpenDay={(date, block) => navigation.navigate('ActivityDay', { date, ...(block ? { focusBlock: block } : {}) })}
        />
      </ScrollView>
    </TopSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
});
