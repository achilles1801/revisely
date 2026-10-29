import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from '../../components/SafeAreaView';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MemorizationBrowser } from '../../components/MemorizationBrowser';
import {
  PageStatus,
  applyPendingChanges,
  applyPendingSurahChanges,
  pruneCustomPlanForMemorized,
} from '../../lib/memorizationChanges';
import { ActionBar, useTabBarFootprint } from '../../navigation/TabBar';
import { ProgressBar } from '../../components/ProgressBar';
import { IconButton, TopBar } from '../../components/v2/TopBar';
import { PillButton } from '../../components/v2/PillButton';
import { Sheet } from '../../components/v2/Sheet';
import { computeMemorizationStats, formatFractional } from '../../lib/memorizationStats';
import { layoutV2, typeV2 } from '../../theme/v2';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import type { User } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Memorization'>;

export default function MemorizationScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, pages, updatePages, saveUser } = useApp();
  const { palette } = useTheme();
  const barFootprint = useTabBarFootprint();
  // "Schedule needs review" opens once the save sheet has gone (iOS can't
  // present a sheet while another is being dismissed).
  const reviewAfterSave = useRef(false);

  const [markMode, setMarkMode] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<
    Map<number, PageStatus>
  >(new Map());
  const [pendingSurahChanges, setPendingSurahChanges] = useState<
    Map<number, PageStatus>
  >(new Map());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewPromptOpen, setReviewPromptOpen] = useState(false);

  // The tab bar is hidden here (HIDE_TAB_BAR_ON in navigation/MainNavigator).

  const changeCount = pendingChanges.size + pendingSurahChanges.size;

  const handleCancel = () => {
    setPendingChanges(new Map());
    setPendingSurahChanges(new Map());
    setMarkMode(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { updatedPages, changedPageNumbers } = applyPendingChanges(
        pages,
        pendingChanges,
      );
      if (changedPageNumbers.length > 0) {
        await updatePages(updatedPages, changedPageNumbers);
      }

      if (user) {
        const userUpdates: Partial<User> = {};
        if (pendingSurahChanges.size > 0) {
          userUpdates.memorizedSurahs = applyPendingSurahChanges(
            user.memorizedSurahs ?? [],
            pendingSurahChanges,
          );
        }
        // Strip un-memorized pages from the custom plan so the schedule
        // doesn't surface pages the user no longer knows. We don't auto-add
        // newly-memorized pages — the user slots those in the plan editor.
        if (user.customPlan) {
          const memorizedNumbers = updatedPages
            .filter((p) => p.status === 'memorized')
            .map((p) => p.pageNumber);
          const { plan } = pruneCustomPlanForMemorized(
            user.customPlan,
            memorizedNumbers,
          );
          userUpdates.customPlan = plan;
        }
        if (Object.keys(userUpdates).length > 0) {
          await saveUser({ ...user, ...userUpdates });
        }
      }

      const hadAnyChange = changedPageNumbers.length > 0 || pendingSurahChanges.size > 0;
      setPendingChanges(new Map());
      setPendingSurahChanges(new Map());
      setMarkMode(false);
      setConfirmOpen(false);

      if (hadAnyChange && user?.customPlan) {
        reviewAfterSave.current = true;
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReviewSchedule = () => {
    setReviewPromptOpen(false);
    navigation.navigate('PlanEdit');
  };

  const stats = useMemo(() => computeMemorizationStats(pages), [pages]);
  // The save sheet keeps its count while it slides away after saving.
  const confirmCount = useRef(changeCount);
  if (confirmOpen) confirmCount.current = changeCount;

  // A top bar (back, the title, edit), how much is memorized with its bar,
  // then the browser's flat rows. Editing marks pages as drafts; a flat bar at
  // the foot holds Cancel and Save.
  const backV2 = () => {
    if (markMode && changeCount > 0) setConfirmOpen(true);
    else navigation.goBack();
  };
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar
        title="Memorization"
        onBack={backV2}
        right={
          markMode ? null : (
            <IconButton
              icon="create-outline"
              label="Edit memorized pages"
              onPress={() => setMarkMode(true)}
              testID="memorization-edit"
            />
          )
        }
        separator
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: markMode ? barFootprint + layoutV2.rowPad : layoutV2.rowPad }}
        testID="memorization-v2"
      >
        <View style={[v2.summary, { borderBottomColor: palette.separator }]} testID="memorization-summary">
          <Text style={[typeV2.title, typeV2.numeral, { color: palette.text }]}>
            {`${stats.pages} of 604 pages`}
          </Text>
          <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}>
            {`${formatFractional(stats.fractionalJuz)} of 30 juz · ${stats.surahs} of 114 surahs`}
          </Text>
          <View style={v2.bar}>
            <ProgressBar progress={(stats.pages / 604) * 100} height={6} testID="memorization-progress" />
          </View>
        </View>
        <MemorizationBrowser
          pages={pages}
          pendingChanges={pendingChanges}
          onChange={setPendingChanges}
          baseMemorizedSurahs={user?.memorizedSurahs ?? []}
          pendingSurahChanges={pendingSurahChanges}
          onSurahChange={setPendingSurahChanges}
          markMode={markMode}
          onMarkModeChange={setMarkMode}
          hideMarkToggle
        />
      </ScrollView>

      {markMode && (
        <ActionBar>
          <PillButton title="Cancel" variant="outline" onPress={handleCancel} testID="memorization-cancel" />
          <View style={{ flex: 1 }} />
          <PillButton
            title={changeCount === 0 ? 'No changes' : `Save (${changeCount})`}
            onPress={() => setConfirmOpen(true)}
            disabled={changeCount === 0}
            testID="memorization-save"
          />
        </ActionBar>
      )}

      <Sheet
        visible={confirmOpen}
        onClose={saving ? () => undefined : () => setConfirmOpen(false)}
        title={`Save ${confirmCount.current} change${confirmCount.current === 1 ? '' : 's'}?`}
        message="Your revision schedule follows what's memorized."
        onHidden={() => {
          if (!reviewAfterSave.current) return;
          reviewAfterSave.current = false;
          setReviewPromptOpen(true);
        }}
        testID="memorization-confirm"
      >
        <View style={v2.sheetActions}>
          <PillButton size="lg" title="Save" onPress={handleSave} busy={saving} testID="confirm-save" />
          <PillButton
            size="lg"
            variant="outline"
            title="Discard changes"
            onPress={() => {
              setConfirmOpen(false);
              handleCancel();
            }}
            disabled={saving}
            testID="confirm-discard"
          />
        </View>
      </Sheet>

      <Sheet
        visible={reviewPromptOpen}
        onClose={() => setReviewPromptOpen(false)}
        title="Schedule needs review"
        message="Your custom schedule doesn't adjust itself. Pages you un-memorized were taken out; new ones aren't scheduled until you add them."
        testID="memorization-review"
      >
        <View style={v2.sheetActions}>
          <PillButton size="lg" title="Review schedule" onPress={handleReviewSchedule} testID="review-now" />
          <PillButton size="lg" variant="outline" title="Later" onPress={() => setReviewPromptOpen(false)} testID="review-later" />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const v2 = StyleSheet.create({
  summary: {
    paddingHorizontal: layoutV2.gutter,
    paddingTop: layoutV2.rowPad,
    paddingBottom: layoutV2.rowPad,
    gap: 2,
    borderBottomWidth: layoutV2.hairline,
  },
  bar: { marginTop: 10 },
  sheetActions: { gap: 10, paddingTop: 8 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
});
