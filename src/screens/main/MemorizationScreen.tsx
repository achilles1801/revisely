import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MemorizationBrowser } from '../../components/MemorizationBrowser';
import type { PageStatus } from '../../lib/memorizationChanges';
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
import { t } from '../../i18n';
import { useSaveMemorization } from '../../hooks/useSaveMemorization';
import { memorizedInSettingsEnabled } from '../../lib/release/memorizedInSettings';
import MemorizedPagesScreen from './MemorizedPagesScreen';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Memorization'>;

/** The memorized pages: the Settings-style editor in Revisely Dev (MEM-9), the store app's Memorization otherwise. */
export default function MemorizationScreen() {
  return memorizedInSettingsEnabled() ? <MemorizedPagesScreen /> : <MemorizationClassic />;
}

function MemorizationClassic() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<HomeStackParamList, 'Memorization'>>();
  const { user, pages } = useApp();
  const { palette } = useTheme();
  const barFootprint = useTabBarFootprint();
  // "Schedule needs review" opens once the save sheet has gone (iOS can't
  // present a sheet while another is being dismissed).
  const reviewAfterSave = useRef(false);

  // From Home's Memorized line (and its menu), straight to editing.
  const [markMode, setMarkMode] = useState(route.params?.edit === true);
  // From Activity's Memorized → Edit: the entry's pages, scrolled to once the rows are laid out.
  const focusPages = route.params?.focusPages;
  const scrollRef = useRef<ScrollView>(null);
  const [browserY, setBrowserY] = useState<number | null>(null);
  const [focusY, setFocusY] = useState<number | null>(null);
  const scrolledToFocus = useRef(false);
  useEffect(() => {
    if (scrolledToFocus.current || browserY == null || focusY == null) return;
    scrolledToFocus.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, browserY + focusY - 8), animated: true });
  }, [browserY, focusY]);
  const [pendingChanges, setPendingChanges] = useState<
    Map<number, PageStatus>
  >(new Map());
  const [pendingSurahChanges, setPendingSurahChanges] = useState<
    Map<number, PageStatus>
  >(new Map());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { save, saving, hasCustomPlan } = useSaveMemorization();
  const [reviewPromptOpen, setReviewPromptOpen] = useState(false);

  // The tab bar is hidden here (HIDE_TAB_BAR_ON in navigation/MainNavigator).

  const changeCount = pendingChanges.size + pendingSurahChanges.size;

  const handleCancel = () => {
    setPendingChanges(new Map());
    setPendingSurahChanges(new Map());
    setMarkMode(false);
  };

  // Saves the manager's changes (useSaveMemorization): "When did you memorize these?" for pages newly marked.
  const handleSave = () =>
    save({ pages: pendingChanges, surahs: pendingSurahChanges }, (changed) => {
      setPendingChanges(new Map());
      setPendingSurahChanges(new Map());
      setMarkMode(false);
      setConfirmOpen(false);
      if (changed && hasCustomPlan) reviewAfterSave.current = true;
    });

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
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar
        title={t('memorization.screen.title')}
        onBack={backV2}
        right={
          markMode ? null : (
            <IconButton
              icon="create-outline"
              label={t('memorization.screen.edit')}
              onPress={() => setMarkMode(true)}
              testID="memorization-edit"
            />
          )
        }
        separator
      />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: markMode ? barFootprint + layoutV2.rowPad : layoutV2.rowPad }}
        testID="memorization-v2"
      >
        <View style={[v2.summary, { borderBottomColor: palette.separator }]} testID="memorization-summary">
          <Text style={[typeV2.title, typeV2.numeral, { color: palette.text }]}>
            {t('memorization.screen.pagesOf', { n: stats.pages })}
          </Text>
          <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}>
            {t('memorization.screen.juzAndSurahs', { juz: formatFractional(stats.fractionalJuz), surahs: stats.surahs })}
          </Text>
          <View style={v2.bar}>
            <ProgressBar progress={(stats.share / 604) * 100} height={6} testID="memorization-progress" />
          </View>
        </View>
        <View onLayout={(e) => setBrowserY(e.nativeEvent.layout.y)} testID="memorization-browser">
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
          focusPages={focusPages}
          onFocusOffset={setFocusY}
        />
        </View>
      </ScrollView>

      {markMode && (
        <ActionBar>
          <PillButton title={t('common.cancel')} variant="outline" onPress={handleCancel} testID="memorization-cancel" />
          <View style={{ flex: 1 }} />
          <PillButton
            title={changeCount === 0 ? t('memorization.screen.noChanges') : t('memorization.screen.saveCount', { n: changeCount })}
            onPress={() => setConfirmOpen(true)}
            disabled={changeCount === 0}
            testID="memorization-save"
          />
        </ActionBar>
      )}

      <Sheet
        visible={confirmOpen}
        onClose={saving ? () => undefined : () => setConfirmOpen(false)}
        title={t('memorization.screen.confirmTitle', { count: confirmCount.current })}
        message={t('memorization.screen.confirmBody')}
        onHidden={() => {
          if (!reviewAfterSave.current) return;
          reviewAfterSave.current = false;
          setReviewPromptOpen(true);
        }}
        testID="memorization-confirm"
      >
        <View style={v2.sheetActions}>
          <PillButton size="lg" title={t('common.save')} onPress={handleSave} busy={saving} testID="confirm-save" />
          <PillButton
            size="lg"
            variant="outline"
            title={t('memorization.screen.discard')}
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
        title={t('memorization.screen.reviewTitle')}
        message={t('memorization.screen.reviewBody')}
        testID="memorization-review"
      >
        <View style={v2.sheetActions}>
          <PillButton size="lg" title={t('memorization.screen.review')} onPress={handleReviewSchedule} testID="review-now" />
          <PillButton size="lg" variant="outline" title={t('memorization.screen.later')} onPress={() => setReviewPromptOpen(false)} testID="review-later" />
        </View>
      </Sheet>
    </TopSafeAreaView>
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
