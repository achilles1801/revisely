// Memorized pages (MEM-9, Revisely Dev until lib/release/memorizedInSettings is on): the Settings-style editor. Named as its
// Settings row is, it opens ready to edit: how much is memorized, Show by Surahs | Juz | Hizb, and a row per surah, juz or
// hizb (its circle marks it all, the row opens it on a page of its own). Changes are drafts; a bar with Cancel and Save
// shows only once something changed, and Save asks when newly marked pages were memorized, as before.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { TopBar } from '../../components/v2/TopBar';
import { PillButton } from '../../components/v2/PillButton';
import { Sheet } from '../../components/v2/Sheet';
import { ActionBar, useTabBarFootprint } from '../../navigation/TabBar';
import { MemorizedGroupPage, MemorizedList, MemorizedSummary, groupTitle, type MemorizedGroup, type MemorizedMode } from '../../components/memorization/MemorizedEditor';
import { useMemorizationToggles } from '../../components/memorization/useMemorizationToggles';
import { useSaveMemorization } from '../../hooks/useSaveMemorization';
import { applyPendingChanges, type PageStatus } from '../../lib/memorizationChanges';
import { computeMemorizationStats, formatFractional } from '../../lib/memorizationStats';
import { formatPercent } from '../../lib/homeToday';
import { getSurahsForPage } from '../../lib/quranData';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2 } from '../../theme/v2';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { t } from '../../i18n';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Memorization'>;

export default function MemorizedPagesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<HomeStackParamList, 'Memorization'>>();
  const { user, pages } = useApp();
  const { palette } = useTheme();
  const barFootprint = useTabBarFootprint();
  const scrollRef = useRef<ScrollView>(null);

  // From a day's Memorized entry (Activity → Edit): its surah opened, its pages ringed.
  const focusPages = route.params?.focusPages;
  const focus = useMemo(() => new Set(focusPages ?? []), [focusPages]);
  const focusSurah = focusPages && focusPages.length > 0 ? getSurahsForPage(focusPages[0])[0]?.number ?? null : null;

  const [mode, setMode] = useState<MemorizedMode>(focusSurah != null ? 'chapter' : 'juz');
  const [group, setGroup] = useState<MemorizedGroup | null>(focusSurah != null ? { kind: 'surah', n: focusSurah } : null);
  const [pendingChanges, setPendingChanges] = useState<Map<number, PageStatus>>(new Map());
  const [pendingSurahChanges, setPendingSurahChanges] = useState<Map<number, PageStatus>>(new Map());
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const leaveAfterSave = useRef(false);

  const toggles = useMemorizationToggles({
    pages,
    pendingChanges,
    onChange: setPendingChanges,
    baseMemorizedSurahs: user?.memorizedSurahs ?? [],
    pendingSurahChanges,
    onSurahChange: setPendingSurahChanges,
  });
  const { save, saving, hasCustomPlan } = useSaveMemorization();
  // Something to save: a page, or a surah marked whole (which counts as its pages when they change too). The count is the
  // pages that change, as the person sees them, not the surah flag besides.
  const changeCount = pendingChanges.size > 0 ? pendingChanges.size : pendingSurahChanges.size;
  // The count above the list follows the drafts.
  const draft = useMemo(() => applyPendingChanges(pages, pendingChanges).updatedPages, [pages, pendingChanges]);
  const stats = useMemo(() => computeMemorizationStats(draft), [draft]);
  const fraction = stats.share / 604;

  const clear = () => {
    setPendingChanges(new Map());
    setPendingSurahChanges(new Map());
  };
  const open = (g: MemorizedGroup | null) => {
    setGroup(g);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const onSave = () =>
    save({ pages: pendingChanges, surahs: pendingSurahChanges }, (changed) => {
      clear();
      setLeaveOpen(false);
      if (leaveAfterSave.current) {
        leaveAfterSave.current = false;
        navigation.goBack();
      } else if (changed && hasCustomPlan) {
        setReviewOpen(true);
      }
    });

  // Back: an opened surah, juz or hizb returns to the list; unsaved changes ask first.
  const back = () => {
    if (group) open(null);
    else if (changeCount > 0) setLeaveOpen(true);
    else navigation.goBack();
  };
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!group) return false;
        open(null);
        return true;
      });
      return () => sub.remove();
    }, [group]),
  );

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar title={group ? groupTitle(group) : t('memorization.editor.title')} onBack={back} separator />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: changeCount > 0 ? barFootprint + layoutV2.rowPad : layoutV2.rowPad }}
        testID="memorized-pages"
      >
        {group ? (
          <MemorizedGroupPage group={group} toggles={toggles} focus={focus} />
        ) : (
          <>
            <MemorizedSummary
              pages={stats.pages}
              share={t('memorization.editor.ofQuran', { percent: formatPercent(fraction) })}
              juz={stats.juzFractions}
              juzCount={formatFractional(stats.fractionalJuz)}
              surahs={stats.surahs}
              percent={fraction}
            />
            <MemorizedList mode={mode} onMode={setMode} toggles={toggles} onOpen={open} />
          </>
        )}
      </ScrollView>

      {changeCount > 0 ? (
        <ActionBar>
          <PillButton title={t('common.cancel')} variant="outline" onPress={clear} disabled={saving} testID="memorized-cancel" />
          <View style={styles.flex} />
          <PillButton title={t('memorization.editor.saveChanges', { count: changeCount })} onPress={onSave} busy={saving} testID="memorized-save" />
        </ActionBar>
      ) : null}

      {/* Leaving with changes not saved. */}
      <Sheet
        visible={leaveOpen}
        onClose={saving ? () => undefined : () => setLeaveOpen(false)}
        title={t('memorization.screen.confirmTitle', { count: changeCount || 1 })}
        message={t('memorization.screen.confirmBody')}
        testID="memorized-leave"
      >
        <View style={styles.sheetActions}>
          <PillButton
            size="lg"
            title={t('common.save')}
            onPress={() => {
              leaveAfterSave.current = true;
              onSave();
            }}
            busy={saving}
            testID="memorized-leave-save"
          />
          <PillButton
            size="lg"
            variant="outline"
            title={t('memorization.screen.discard')}
            onPress={() => {
              setLeaveOpen(false);
              clear();
              navigation.goBack();
            }}
            disabled={saving}
            testID="memorized-leave-discard"
          />
        </View>
      </Sheet>

      <Sheet
        visible={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={t('memorization.screen.reviewTitle')}
        message={t('memorization.screen.reviewBody')}
        testID="memorized-review"
      >
        <View style={styles.sheetActions}>
          <PillButton
            size="lg"
            title={t('memorization.screen.review')}
            onPress={() => {
              setReviewOpen(false);
              navigation.navigate('PlanEdit');
            }}
            testID="memorized-review-now"
          />
          <PillButton size="lg" variant="outline" title={t('memorization.screen.later')} onPress={() => setReviewOpen(false)} />
        </View>
      </Sheet>
    </TopSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  flex: { flex: 1 },
  sheetActions: { gap: 10, paddingTop: 8 },
});
