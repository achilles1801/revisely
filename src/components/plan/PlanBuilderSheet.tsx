import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { PlanSheet } from './PlanSheet';
import { ListPickerSheet, PickerItem, PickerTab } from './ListPickerSheet';
import { GroupedRow, GroupedSection } from './Grouped';
import { InlineStepper } from './InlineStepper';
import { DayRow, DAY_ROW_INSET } from './DayRow';
import { LiquidGlassSegmentedControl } from '../LiquidGlassSegmentedControl';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import type { UserPage } from '../../types';
import {
  buildBalancedPlanFromStart,
  buildJuzPlanFromStart,
  PlanDirection,
  planStats,
  resolveStartPage,
} from '../../lib/planBuilder';
import {
  describeStartPage,
  memorizedJuzGroups,
  memorizedSurahGroups,
  pageCountLabel,
} from '../../lib/planDisplay';
import { getJuzForPage, getSurahForPage } from '../../lib/quranData';

export type BuilderMode = 'balanced' | 'juz' | 'weakest';

export interface PlanBuilderHandle {
  present: () => void;
  dismiss: () => void;
}

interface Props {
  memorizedPages: UserPage[];
  defaultPagesPerDay: number;
  defaultJuzPerDay: number;
  defaultStartPage: number | null;
  defaultDirection: PlanDirection;
  defaultMode: BuilderMode;
  /** When false, smart-tracking-only templates (Weakest First) are hidden. */
  smartTrackingEnabled: boolean;
  buildWeakest: (pagesPerDay: number) => number[][];
  onApply: (days: number[][], direction: PlanDirection) => void;
  longCycleDays: number;
}

const PREVIEW_DAYS = 4;
const MAX_PAGES_PER_DAY = 60;
const MAX_JUZ_PER_DAY = 5;

/**
 * "Build a plan" configure sheet. One place to generate a fresh cycle:
 * Balanced (auto-balance from a chosen start), By Juz, or Weakest First
 * (smart tracking only), with a live preview. Nothing is saved until the user
 * taps Save on the schedule screen.
 */
export const PlanBuilderSheet = forwardRef<PlanBuilderHandle, Props>(function PlanBuilderSheet(
  {
    memorizedPages,
    defaultPagesPerDay,
    defaultJuzPerDay,
    defaultStartPage,
    defaultDirection,
    defaultMode,
    smartTrackingEnabled,
    buildWeakest,
    onApply,
    longCycleDays,
  },
  ref,
) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const startSheetRef = useRef<BottomSheetModal>(null);

  const memorizedNumbers = useMemo(
    () => memorizedPages.map((p) => p.pageNumber).sort((a, b) => a - b),
    [memorizedPages],
  );
  const total = memorizedNumbers.length;
  const surahGroups = useMemo(() => memorizedSurahGroups(memorizedNumbers), [memorizedNumbers]);
  const juzGroups = useMemo(() => memorizedJuzGroups(memorizedNumbers), [memorizedNumbers]);

  const safeMode = (m: BuilderMode): BuilderMode =>
    m === 'weakest' && !smartTrackingEnabled ? 'balanced' : m;

  const [mode, setMode] = useState<BuilderMode>(safeMode(defaultMode));
  const [pagesPerDay, setPagesPerDay] = useState(defaultPagesPerDay);
  const [juzPerDay, setJuzPerDay] = useState(defaultJuzPerDay);
  const [direction, setDirection] = useState<PlanDirection>(defaultDirection);
  // The start point is kept as a key ("surah:2", "juz:3", "page:40") so a
  // surah/juz pick can re-resolve to its last page when order is reversed.
  const [startKey, setStartKey] = useState<string | null>(
    defaultStartPage != null ? `page:${defaultStartPage}` : null,
  );
  const [startTab, setStartTab] = useState('surah');

  const maxPages = Math.max(1, Math.min(MAX_PAGES_PER_DAY, total));
  const maxJuz = Math.max(1, Math.min(MAX_JUZ_PER_DAY, juzGroups.length));

  useImperativeHandle(ref, () => ({
    present: () => {
      setMode(safeMode(defaultMode));
      setPagesPerDay(Math.min(Math.max(1, defaultPagesPerDay), maxPages));
      setJuzPerDay(Math.min(Math.max(1, defaultJuzPerDay), maxJuz));
      setDirection(defaultDirection);
      setStartKey(defaultStartPage != null ? `page:${defaultStartPage}` : null);
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  const startPage = useMemo(() => {
    if (!startKey) return null;
    const [kind, raw] = startKey.split(':');
    const n = Number(raw);
    const pick = (pages: number[] | undefined) =>
      pages && pages.length
        ? direction === 'reverse'
          ? pages[pages.length - 1]
          : pages[0]
        : null;
    if (kind === 'surah') return pick(surahGroups.find((g) => g.number === n)?.pages);
    if (kind === 'juz') return pick(juzGroups.find((g) => g.juz === n)?.pages);
    return n;
  }, [startKey, direction, surahGroups, juzGroups]);

  const resolvedStart = useMemo(
    () => resolveStartPage(memorizedNumbers, startPage, direction),
    [memorizedNumbers, startPage, direction],
  );

  const preview = useMemo<number[][]>(() => {
    if (total === 0) return [];
    if (mode === 'balanced') {
      return buildBalancedPlanFromStart(memorizedNumbers, {
        pagesPerDay,
        startPage: resolvedStart,
        direction,
      });
    }
    if (mode === 'juz') {
      return buildJuzPlanFromStart(memorizedPages, {
        juzPerDay,
        startPage: resolvedStart,
        direction,
      });
    }
    return buildWeakest(pagesPerDay);
  }, [
    total,
    mode,
    memorizedNumbers,
    memorizedPages,
    pagesPerDay,
    juzPerDay,
    resolvedStart,
    direction,
    buildWeakest,
  ]);

  const stats = planStats(preview);
  const today = useMemo(() => new Date(), []);

  const apply = () => {
    if (preview.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApply(preview, mode === 'weakest' ? 'forward' : direction);
    sheetRef.current?.dismiss();
  };

  const modeOptions = [
    { value: 'balanced' as BuilderMode, label: 'Balanced' },
    { value: 'juz' as BuilderMode, label: 'By Juz' },
    ...(smartTrackingEnabled ? [{ value: 'weakest' as BuilderMode, label: 'Weakest' }] : []),
  ];

  const modeFooter =
    mode === 'balanced'
      ? 'Your memorized pages in order, split into even days that never go over your daily amount. Choose where today starts — it continues from there and wraps around.'
      : mode === 'juz'
        ? 'Each day covers whole ajzaʼ you have memorized. Choose which juz is today.'
        : 'Your shakiest and most overdue pages come first, based on your ratings and missed revisions.';

  const perDayLabel =
    stats.minPerDay === stats.maxPerDay
      ? pageCountLabel(stats.maxPerDay)
      : `${stats.minPerDay}–${stats.maxPerDay} pages`;
  const previewFooter =
    stats.dayCount === 0
      ? undefined
      : `${stats.dayCount}-day cycle · ${perDayLabel} a day. It starts today and repeats every ${stats.dayCount === 1 ? 'day' : `${stats.dayCount} days`}.`;

  const start = describeStartPage(resolvedStart);

  // ---- Start-point picker --------------------------------------------------
  const startTabs = useMemo<PickerTab[]>(() => {
    const surahItems: PickerItem[] = surahGroups.map((g) => ({
      key: `surah:${g.number}`,
      index: String(g.number),
      title: g.name,
      subtitle:
        g.pages.length === g.totalPages
          ? pageCountLabel(g.pages.length)
          : `${g.pages.length} of ${g.totalPages} pages memorized`,
      trailing: g.nameArabic,
      search: `${g.number}`,
      checked: startKey === `surah:${g.number}`,
    }));
    const juzItems: PickerItem[] = juzGroups.map((g) => ({
      key: `juz:${g.juz}`,
      index: String(g.juz),
      title: `Juz ${g.juz}`,
      subtitle: `${getSurahForPage(g.pages[0]).name} · ${pageCountLabel(g.pages.length)}`,
      trailing: g.name,
      search: `${g.juz}`,
      checked: startKey === `juz:${g.juz}`,
    }));
    const pageItems: PickerItem[] = memorizedNumbers.map((p) => ({
      key: `page:${p}`,
      title: `Page ${p}`,
      subtitle: `${getSurahForPage(p).name} · Juz ${getJuzForPage(p)}`,
      checked: startKey === `page:${p}`,
    }));
    return [
      { key: 'surah', label: 'Surah', items: surahItems },
      { key: 'juz', label: 'Juz', items: juzItems },
      { key: 'page', label: 'Page', items: pageItems },
    ];
  }, [surahGroups, juzGroups, memorizedNumbers, startKey]);

  const openStartPicker = () => {
    if (startKey?.startsWith('juz:')) setStartTab('juz');
    else if (startKey?.startsWith('page:')) setStartTab('page');
    else setStartTab('surah');
    startSheetRef.current?.present();
  };

  const onPickStart = useCallback((key: string) => {
    setStartKey(key);
    startSheetRef.current?.dismiss();
  }, []);

  const showStart = mode !== 'weakest';
  const showOrder = mode !== 'weakest';

  return (
    <>
      <PlanSheet
        ref={sheetRef}
        title="New Plan"
        leftLabel="Cancel"
        onLeft={() => sheetRef.current?.dismiss()}
        rightLabel="Apply"
        onRight={apply}
        rightDisabled={preview.length === 0}
        snapPoints={['90%']}
      >
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {modeOptions.length > 1 ? (
            <View style={styles.segment}>
              <LiquidGlassSegmentedControl<BuilderMode>
                options={modeOptions}
                value={mode}
                onChange={setMode}
              />
            </View>
          ) : null}

          <GroupedSection footer={modeFooter}>
            {mode === 'juz' ? (
              <GroupedRow
                title="Juz per day"
                trailing={
                  <InlineStepper
                    value={juzPerDay}
                    min={1}
                    max={maxJuz}
                    onChange={setJuzPerDay}
                    label="juz per day"
                  />
                }
              />
            ) : (
              <GroupedRow
                title="Pages per day"
                trailing={
                  <InlineStepper
                    value={pagesPerDay}
                    min={1}
                    max={maxPages}
                    onChange={setPagesPerDay}
                    label="pages per day"
                  />
                }
              />
            )}
            {showStart ? (
              <GroupedRow
                title="Today starts at"
                subtitle={start.subtitle || undefined}
                value={start.title}
                accessory="chevron"
                onPress={openStartPicker}
                accessibilityLabel={`Today starts at ${start.title}, ${start.subtitle}`}
              />
            ) : null}
            {showOrder ? (
              <GroupedRow
                title="Reverse order"
                subtitle={direction === 'reverse' ? 'An-Nas back to Al-Fatiha' : 'Al-Fatiha to An-Nas'}
                trailing={
                  <Switch
                    value={direction === 'reverse'}
                    onValueChange={(v) => {
                      Haptics.selectionAsync();
                      setDirection(v ? 'reverse' : 'forward');
                    }}
                    trackColor={{ false: theme.border, true: theme.accent }}
                    thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
                    accessibilityLabel="Reverse order"
                  />
                }
              />
            ) : null}
          </GroupedSection>

          {preview.length > 0 ? (
            <GroupedSection
              header="Preview"
              footer={
                stats.dayCount > longCycleDays
                  ? `${previewFooter} Gaps longer than about two weeks usually need more reinforcement — consider more pages per day.`
                  : previewFooter
              }
              footerTone={stats.dayCount > longCycleDays ? 'warning' : 'default'}
              separatorInset={DAY_ROW_INSET}
            >
              {preview.slice(0, PREVIEW_DAYS).map((pages, i) => (
                <DayRow key={i} index={i} pages={pages} today={today} showChevron={false} />
              ))}
              {preview.length > PREVIEW_DAYS ? (
                <GroupedRow
                  title={`${preview.length - PREVIEW_DAYS} more day${preview.length - PREVIEW_DAYS === 1 ? '' : 's'}`}
                  tone="muted"
                />
              ) : null}
            </GroupedSection>
          ) : (
            <GroupedSection footer="Mark pages as memorized first — there's nothing to schedule yet.">
              {null}
            </GroupedSection>
          )}
        </BottomSheetScrollView>
      </PlanSheet>

      <ListPickerSheet
        ref={startSheetRef}
        title="Today Starts At"
        tabs={startTabs}
        activeTab={startTab}
        onTabChange={setStartTab}
        onSelect={onPickStart}
        onLeft={() => startSheetRef.current?.dismiss()}
        searchPlaceholder="Search surahs, ajzaʼ or pages"
        stackBehavior="push"
        footer="Revision starts here today and carries on in order, wrapping back around to the beginning."
      />
    </>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
  },
  segment: {
    marginTop: spacing.xs,
  },
});
