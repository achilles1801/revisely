import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PlanSheet } from './PlanSheet';
import { GroupedRow, GroupedSection } from './Grouped';
import { ListPickerSheet, PickerItem, PickerTab } from './ListPickerSheet';
import { dayTitle } from './DayRow';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { getSurahForPage } from '../../lib/quranData';
import { ayahsInSurah, describePassage } from '../../lib/passages';
import { applyGroupSelection, isGroupFullyIncluded, SelectableGroup } from '../../lib/planBuilder';
import { memorizedJuzGroups, memorizedSurahGroups, pageCountLabel, summarizeDay } from '../../lib/planDisplay';
import { layoutV2, typeV2 } from '../../theme/v2';
import { spacing } from '../../theme/spacing';
import { t } from '../../i18n';

export interface DaySheetHandle {
  /** `basePages`: the day as saved, when it opens already changed ("Add to your plan", ACT-24). */
  open: (day: { index: number; pages: number[]; basePages?: number[]; note?: string }) => void;
}

interface Props {
  memorized: number[];
  today: Date;
  /** The cycle has more than one day: the day can be deleted. */
  canDelete: boolean;
  onDone: (index: number, pages: number[]) => void;
  onDelete: (index: number) => void;
}

interface SurahOnDay {
  number: number;
  name: string;
  pages: number[];
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((p, i) => p === b[i]);

/**
 * A day of the schedule, tapped in Edit schedule (SCHED-8; the audit's mock B3): one sheet, no screen of its own and
 * no Edit mode. Its surahs are checked; unchecking one takes it off the day (it stays listed, to check again).
 * "Add a surah or juz" picks more, "Make it a rest day" empties it, "Delete this day" takes it out of the cycle.
 * Done hands the day back to the draft; nothing is saved until Save.
 */
export const DaySheet = forwardRef<DaySheetHandle, Props>(function DaySheet({ memorized, today, canDelete, onDone, onDelete }, ref) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const pickerRef = useRef<BottomSheetModal>(null);

  const [index, setIndex] = useState(0);
  const [base, setBase] = useState<number[]>([]);
  const [pages, setPages] = useState<number[]>([]);
  // Every page that has been on the day while the sheet is open, in order: an unchecked surah stays listed.
  const [listed, setListed] = useState<number[]>([]);
  const [note, setNote] = useState<string | undefined>();
  const [pickerTab, setPickerTab] = useState('surah');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [checkedBefore, setCheckedBefore] = useState<Set<string>>(new Set());

  useImperativeHandle(ref, () => ({
    open: ({ index: i, pages: p, basePages, note: n }) => {
      setIndex(i);
      setBase([...(basePages ?? p)]);
      setPages([...p]);
      setListed([...p]);
      setNote(n);
      sheetRef.current?.present();
    },
  }));

  const surahGroups = useMemo(() => memorizedSurahGroups(memorized), [memorized]);
  const juzGroups = useMemo(() => memorizedJuzGroups(memorized), [memorized]);
  const selectable = useMemo<SelectableGroup[]>(
    () => [
      ...surahGroups.map((g) => ({ key: `surah:${g.number}`, pages: g.pages })),
      ...juzGroups.map((g) => ({ key: `juz:${g.juz}`, pages: g.pages })),
    ],
    [surahGroups, juzGroups],
  );

  const surahs = useMemo<SurahOnDay[]>(() => {
    const map = new Map<number, SurahOnDay>();
    for (const p of listed) {
      const s = getSurahForPage(p);
      const entry = map.get(s.number);
      if (entry) entry.pages.push(p);
      else map.set(s.number, { number: s.number, name: s.name, pages: [p] });
    }
    return [...map.values()];
  }, [listed]);

  const onDay = useMemo(() => new Set(pages), [pages]);
  const toggle = (s: SurahOnDay) => {
    haptics.selection();
    const on = s.pages.every((p) => onDay.has(p));
    const these = new Set(s.pages);
    setPages(on ? pages.filter((p) => !these.has(p)) : listed.filter((p) => onDay.has(p) || these.has(p)));
  };

  const openPicker = () => {
    const now = new Set(selectable.filter((g) => isGroupFullyIncluded(pages, g)).map((g) => g.key));
    setCheckedBefore(now);
    setChecked(new Set(now));
    pickerRef.current?.present();
  };
  const togglePick = useCallback((key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const applyPicker = () => {
    const next = applyGroupSelection(pages, selectable, checkedBefore, checked);
    const had = new Set(listed);
    setPages(next);
    setListed([...listed, ...next.filter((p) => !had.has(p))]);
    haptics.success();
    pickerRef.current?.dismiss();
  };

  const pickerTabs = useMemo<PickerTab[]>(() => {
    const count = (groupPages: number[]) => groupPages.filter((p) => onDay.has(p)).length;
    const surahItems: PickerItem[] = surahGroups.map((g) => {
      const n = count(g.pages);
      return {
        key: `surah:${g.number}`,
        index: String(g.number),
        title: g.name,
        subtitle:
          n > 0 && n < g.pages.length
            ? t('plan.day.partOnDay', { n, total: g.pages.length })
            : g.pages.length === g.totalPages
              ? pageCountLabel(g.pages.length)
              : t('plan.day.partMemorized', { n: g.pages.length, total: g.totalPages }),
        trailing: g.nameArabic,
        search: String(g.number),
        checked: checked.has(`surah:${g.number}`),
      };
    });
    const juzItems: PickerItem[] = juzGroups.map((g) => {
      const n = count(g.pages);
      return {
        key: `juz:${g.juz}`,
        index: String(g.juz),
        title: t('common.juzN', { n: g.juz }),
        subtitle:
          n > 0 && n < g.pages.length
            ? t('plan.day.partOnDay', { n, total: g.pages.length })
            : `${describePassage(g.pages, { form: 'short', wholeJuz: false, max: 2 })} · ${pageCountLabel(g.pages.length)}`,
        trailing: g.name,
        search: String(g.juz),
        checked: checked.has(`juz:${g.juz}`),
      };
    });
    return [
      { key: 'surah', label: t('plan.day.surahs'), items: surahItems, emptyText: t('plan.day.noSurahs') },
      { key: 'juz', label: t('common.juz'), items: juzItems, emptyText: t('plan.day.noJuz') },
    ];
  }, [surahGroups, juzGroups, checked, onDay]);
  const pickChanged = checked.size !== checkedBefore.size || [...checked].some((k) => !checkedBefore.has(k));

  const changed = !same(pages, base);
  const summary = summarizeDay(pages);
  const done = () => {
    if (changed) {
      haptics.success();
      onDone(index, pages);
    }
    sheetRef.current?.dismiss();
  };
  const remove = () => {
    sheetRef.current?.dismiss();
    onDelete(index);
  };

  return (
    <>
      <PlanSheet
        ref={sheetRef}
        title={dayTitle(index, today)}
        leftLabel={t('common.cancel')}
        onLeft={() => sheetRef.current?.dismiss()}
        rightLabel={t('common.done')}
        onRight={done}
        snapPoints={['80%']}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm }}
          testID="day-sheet"
        >
          <View style={styles.head}>
            <Text style={[typeV2.name, { color: summary.isRest ? palette.secondary : palette.text }]} numberOfLines={2} testID="day-sheet-title">
              {summary.title}
            </Text>
            <Text style={[typeV2.meta, styles.line, { color: palette.secondary }]}>
              {pages.length > 0 ? pageCountLabel(pages.length) : index === 0 ? t('plan.day.nothingToday') : t('plan.day.nothingOnDay')}
            </Text>
            {note ? (
              <Text style={[typeV2.meta, styles.line, { color: palette.secondary }]} testID="plan-day-note">
                {note}
              </Text>
            ) : null}
          </View>
          {surahs.length > 0 ? (
            <GroupedSection header={t('plan.day.onThisDay')} footer={t('plan.day.uncheck')}>
              {surahs.map((s) => {
                const on = s.pages.every((p) => onDay.has(p));
                return (
                  <GroupedRow
                    key={s.number}
                    title={s.name}
                    subtitle={`${ayahsInSurah(s.number, s.pages)} · ${pageCountLabel(s.pages.length)}`}
                    leading={
                      <Ionicons
                        name={on ? 'checkmark-circle' : 'ellipse-outline'}
                        size={24}
                        color={on ? palette.accentText : palette.secondary}
                      />
                    }
                    onPress={() => toggle(s)}
                    accessibilityLabel={t(on ? 'plan.day.onLabel' : 'plan.day.offLabel', { name: s.name })}
                    testID={`surah-row-${s.number}`}
                  />
                );
              })}
            </GroupedSection>
          ) : null}
          <GroupedSection divider={false} footer={memorized.length === 0 ? t('plan.day.noneMemorized') : pages.length === 0 ? t('plan.day.restDay') : undefined}>
            <GroupedRow
              title={t('plan.day.addSurahOrJuz')}
              icon="add-circle-outline"
              onPress={openPicker}
              disabled={memorized.length === 0}
              testID="day-pick"
            />
            {pages.length > 0 ? (
              <GroupedRow title={t('plan.day.makeRest')} icon="cafe-outline" onPress={() => setPages([])} testID="day-make-rest" />
            ) : null}
            {canDelete ? (
              <GroupedRow title={t('plan.day.deleteDay')} icon="trash-outline" tone="destructive" onPress={remove} testID="day-delete-day" />
            ) : null}
          </GroupedSection>
        </BottomSheetScrollView>
      </PlanSheet>
      <ListPickerSheet
        ref={pickerRef}
        title={index === 0 ? t('plan.day.todaysRevision') : dayTitle(index, today)}
        tabs={pickerTabs}
        activeTab={pickerTab}
        onTabChange={setPickerTab}
        onSelect={togglePick}
        onLeft={() => pickerRef.current?.dismiss()}
        rightLabel={t('common.done')}
        onRight={applyPicker}
        rightDisabled={!pickChanged}
        searchPlaceholder={t('plan.day.search')}
        footer={t('plan.day.pickerFooter')}
        stackBehavior="push"
      />
    </>
  );
});

const styles = StyleSheet.create({
  head: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 4 },
  line: { marginTop: 2 },
});
