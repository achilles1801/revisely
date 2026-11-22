import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from '../../components/SafeAreaView';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { getSurahForPage } from '../../lib/quranData';
import {
  memorizedJuzGroups,
  memorizedSurahGroups,
  pageCountLabel,
  summarizeDay,
} from '../../lib/planDisplay';
import { ayahsInSurah, describePassage } from '../../lib/passages';
import {
  applyGroupSelection,
  isGroupFullyIncluded,
  SelectableGroup,
} from '../../lib/planBuilder';
import {
  GroupedRow,
  GroupedSection,
  HeaderTextButton,
} from '../../components/plan/Grouped';
import {
  ListPickerSheet,
  PickerItem,
  PickerTab,
} from '../../components/plan/ListPickerSheet';
import { dayTitle } from '../../components/plan/DayRow';
import { IconButton, TopBar } from '../../components/v2/TopBar';
import { Tap } from '../../components/v2/Tap';
import { useHaptics } from '../../design/haptics';
import { arabicV2, layoutV2, typeV2 } from '../../theme/v2';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { arabicLabelLines } from '../../lib/platformUi';
import { revisablePages } from '../../lib/memorizedAyahs';
import { t } from '../../i18n';
import { backIcon } from '../../i18n/direction';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'PlanDayEdit'>;
type RouteProps = RouteProp<HomeStackParamList, 'PlanDayEdit'>;
type PickerTabKey = 'surah' | 'juz';

interface SurahOnDay {
  number: number;
  name: string;
  nameArabic: string;
  pages: number[];
}

export default function PlanDayEditScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { palette } = useTheme();
  const haptics = useHaptics();
  const { pages: allPages, user } = useApp();
  const { date: today } = useRevisionDay(user);

  const { dayIndex, initialPages, basePages, note } = route.params;
  const [pages, setPages] = useState<number[]>([...initialPages]);
  const [editing, setEditing] = useState(false);

  const pickerRef = useRef<BottomSheetModal>(null);
  const [pickerTab, setPickerTab] = useState<PickerTabKey>('surah');
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [initialChecked, setInitialChecked] = useState<Set<string>>(new Set());

  const title = dayTitle(dayIndex, today);

  const memorized = useMemo(
    () =>
      revisablePages(allPages)
        .map((p) => p.pageNumber)
        .sort((a, b) => a - b),
    [allPages],
  );
  const surahGroups = useMemo(() => memorizedSurahGroups(memorized), [memorized]);
  const juzGroups = useMemo(() => memorizedJuzGroups(memorized), [memorized]);

  const selectable = useMemo<SelectableGroup[]>(
    () => [
      ...surahGroups.map((g) => ({ key: `surah:${g.number}`, pages: g.pages })),
      ...juzGroups.map((g) => ({ key: `juz:${g.juz}`, pages: g.pages })),
    ],
    [surahGroups, juzGroups],
  );

  // Against the day as saved: "Add to plan" opens with pages already added, which is an edit.
  const isDirty = useMemo(() => {
    const saved = basePages ?? initialPages;
    if (pages.length !== saved.length) return true;
    return pages.some((p, i) => p !== saved[i]);
  }, [pages, initialPages, basePages]);

  const summary = summarizeDay(pages);

  // Surahs on this day, in the order they're revised.
  const surahsOnDay = useMemo<SurahOnDay[]>(() => {
    const map = new Map<number, SurahOnDay>();
    for (const p of pages) {
      const s = getSurahForPage(p);
      const entry = map.get(s.number);
      if (entry) entry.pages.push(p);
      else map.set(s.number, { number: s.number, name: s.name, nameArabic: s.nameArabic, pages: [p] });
    }
    return Array.from(map.values());
  }, [pages]);

  useEffect(() => {
    if (surahsOnDay.length === 0) setEditing(false);
  }, [surahsOnDay.length]);

  // ---- Leaving: hand the edited day back to the schedule draft -------------
  const committingRef = useRef(false);
  const commit = useCallback(() => {
    committingRef.current = true;
    if (isDirty) {
      haptics.success();
      navigation.popTo('PlanEdit', { editedDay: { index: dayIndex, pages } }, { merge: true });
    } else {
      navigation.goBack();
    }
  }, [isDirty, navigation, dayIndex, pages, haptics]);

  // Swipe-back can't be intercepted on native-stack, so disable it while there
  // are edits; Android back / programmatic pops are routed through commit().
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !isDirty });
  }, [navigation, isDirty]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!isDirty || committingRef.current) return;
        e.preventDefault();
        commit();
      }),
    [navigation, isDirty, commit],
  );

  // ---- Picker ---------------------------------------------------------------
  const openPicker = () => {
    const checked = new Set(
      selectable.filter((g) => isGroupFullyIncluded(pages, g)).map((g) => g.key),
    );
    setInitialChecked(checked);
    setDraft(new Set(checked));
    pickerRef.current?.present();
  };

  const toggleDraft = useCallback((key: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const applyPicker = () => {
    setPages((prev) => applyGroupSelection(prev, selectable, initialChecked, draft));
    haptics.success();
    pickerRef.current?.dismiss();
  };

  const pickerTabs = useMemo<PickerTab[]>(() => {
    const pageSet = new Set(pages);
    const onDayCount = (groupPages: number[]) =>
      groupPages.filter((p) => pageSet.has(p)).length;
    const surahItems: PickerItem[] = surahGroups.map((g) => {
      const onDay = onDayCount(g.pages);
      const partial = onDay > 0 && onDay < g.pages.length;
      return {
        key: `surah:${g.number}`,
        index: String(g.number),
        title: g.name,
        subtitle: partial
          ? t('plan.day.partOnDay', { n: onDay, total: g.pages.length })
          : g.pages.length === g.totalPages
            ? pageCountLabel(g.pages.length)
            : t('plan.day.partMemorized', { n: g.pages.length, total: g.totalPages }),
        trailing: g.nameArabic,
        search: String(g.number),
        checked: draft.has(`surah:${g.number}`),
      };
    });
    const juzItems: PickerItem[] = juzGroups.map((g) => {
      const onDay = onDayCount(g.pages);
      const partial = onDay > 0 && onDay < g.pages.length;
      return {
        key: `juz:${g.juz}`,
        index: String(g.juz),
        title: t('common.juzN', { n: g.juz }),
        subtitle: partial
          ? t('plan.day.partOnDay', { n: onDay, total: g.pages.length })
          : `${describePassage(g.pages, { form: 'short', wholeJuz: false, max: 2 })} · ${pageCountLabel(g.pages.length)}`,
        trailing: g.name,
        search: String(g.juz),
        checked: draft.has(`juz:${g.juz}`),
      };
    });
    return [
      { key: 'surah', label: t('plan.day.surahs'), items: surahItems, emptyText: t('plan.day.noSurahs') },
      { key: 'juz', label: t('common.juz'), items: juzItems, emptyText: t('plan.day.noJuz') },
    ];
  }, [surahGroups, juzGroups, draft, pages]);

  const draftChanged =
    draft.size !== initialChecked.size || Array.from(draft).some((k) => !initialChecked.has(k));

  // ---- Direct edits -----------------------------------------------------------
  const removeSurah = (s: SurahOnDay) => {
    const remove = new Set(s.pages);
    haptics.selection();
    setPages((prev) => prev.filter((p) => !remove.has(p)));
  };

  const makeRest = () => {
    setPages([]);
    setEditing(false);
  };

  const canPick = memorized.length > 0;
  const hasContent = pages.length > 0;

  const picker = (
    <ListPickerSheet
      ref={pickerRef}
      title={dayIndex === 0 ? t('plan.day.todaysRevision') : title}
      tabs={pickerTabs}
      activeTab={pickerTab}
      onTabChange={(k) => setPickerTab(k as PickerTabKey)}
      onSelect={toggleDraft}
      onLeft={() => pickerRef.current?.dismiss()}
      rightLabel={t('common.done')}
      onRight={applyPicker}
      rightDisabled={!draftChanged}
      searchPlaceholder={t('plan.day.search')}
      footer={t('plan.day.pickerFooter')}
    />
  );

  // A v2 top bar (back to the schedule, the date), what's on the day as the
  // screen's title, then flat sections like v2 Settings.
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar
        left={
          <IconButton icon={backIcon()} onPress={commit} label={t('plan.day.back')} size={26} testID="back" />
        }
        title={title}
        separator
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={v2.content}
        showsVerticalScrollIndicator={false}
        testID="plan-day-v2"
      >
        <View style={v2.hero}>
          <Text
            style={[typeV2.title, { color: summary.isRest ? palette.secondary : palette.text }]}
            numberOfLines={2}
            accessibilityRole="header"
          >
            {summary.title}
          </Text>
          <Text style={[typeV2.body, v2.heroSubtitle, { color: palette.secondary }]}>
            {hasContent
              ? isDirty
                ? t('plan.day.edited', { pages: pageCountLabel(pages.length) })
                : pageCountLabel(pages.length)
              : dayIndex === 0
                ? t('plan.day.nothingToday')
                : t('plan.day.nothingOnDay')}
          </Text>
          {note ? (
            <Text style={[typeV2.meta, v2.heroNote, { color: palette.secondary }]} testID="plan-day-note">
              {note}
            </Text>
          ) : null}
        </View>

        {hasContent ? (
          <GroupedSection
            header={t('plan.day.onThisDay')}
            headerRight={
              <HeaderTextButton label={editing ? t('common.done') : t('common.edit')} bold={editing} onPress={() => setEditing((v) => !v)} />
            }
          >
            {surahsOnDay.map((s) => (
              <GroupedRow
                key={s.number}
                title={s.name}
                subtitle={`${ayahsInSurah(s.number, s.pages)} · ${pageCountLabel(s.pages.length)}`}
                leading={
                  editing ? (
                    <Tap
                      onPress={() => removeSurah(s)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('plan.day.remove', { name: s.name })}
                      testID={`remove-surah-${s.number}`}
                    >
                      <Ionicons name="remove-circle-outline" size={24} color={palette.red} />
                    </Tap>
                  ) : undefined
                }
                trailing={
                  <Text style={[arabicV2(18), { color: palette.secondary }]} accessibilityLanguage="ar" numberOfLines={arabicLabelLines}>
                    {s.nameArabic}
                  </Text>
                }
                testID={`surah-row-${s.number}`}
              />
            ))}
          </GroupedSection>
        ) : null}

        <GroupedSection
          footer={
            !canPick
              ? t('plan.day.noneMemorized')
              : hasContent
                ? t('plan.day.onlyMemorized')
                : t('plan.day.restDay')
          }
        >
          <GroupedRow
            title={hasContent ? t('plan.day.addOrRemove') : t('plan.day.add')}
            icon="add-circle-outline"
            onPress={openPicker}
            disabled={!canPick}
            testID="day-pick"
          />
          {hasContent ? (
            <GroupedRow
              title={t('plan.day.makeRest')}
              icon="moon-outline"
              tone="destructive"
              onPress={makeRest}
              testID="day-make-rest"
            />
          ) : null}
        </GroupedSection>
      </ScrollView>
      {picker}
    </SafeAreaView>
  );
}

const v2 = StyleSheet.create({
  content: { paddingBottom: spacing.huge },
  hero: { paddingHorizontal: layoutV2.gutter, paddingTop: layoutV2.rowPad, paddingBottom: 8 },
  heroSubtitle: { marginTop: 2 },
  heroNote: { marginTop: 6 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
});
