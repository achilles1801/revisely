import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { TopBar } from '../../components/v2/TopBar';
import { BrowseByStrength, usePageStrengthRows } from '../../components/insights/BrowseByStrength';
import { PagePreviewSheet, QuietLine, SectionHeader } from '../../components/insights/InsightsV2';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { useRevoFootprint } from '../../lib/revo/presence';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { layoutV2 } from '../../theme/v2';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'PagesByStrength'>;

/**
 * Every revised page by strength, weakest first (the Insights tab's Browse), behind "See all
 * pages by strength" at the foot of Activity's Weak spots (ACT-12). Pages, surahs or juz (as
 * Activity's ink tabs), the juz and strength filters, every row; a row opens its page in a sheet.
 */
export default function PagesByStrengthScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useApp();
  const { palette } = useTheme();
  // Room for the tab bar (and the mini player) and for Revo's button, so the last row scrolls clear.
  const tabFootprint = useTabBarFootprint() + useRevoFootprint();
  const { rows } = usePageStrengthRows();
  const [previewPage, setPreviewPage] = useState<number | null>(null);

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar title="Pages by strength" onBack={() => navigation.goBack()} separator />
      {!user ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.secondary} />
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
          testID="pages-by-strength"
        >
          {rows.length === 0 ? (
            <QuietLine testID="pages-by-strength-empty">No revised pages yet</QuietLine>
          ) : (
            <>
              <SectionHeader title={`${rows.length} revised page${rows.length === 1 ? '' : 's'}`} detail="Weakest first" />
              <BrowseByStrength rows={rows} onOpenPage={setPreviewPage} collapsed={false} activityTabs />
            </>
          )}
        </ScrollView>
      )}
      <PagePreviewSheet pageNumber={previewPage} onClose={() => setPreviewPage(null)} />
    </TopSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
