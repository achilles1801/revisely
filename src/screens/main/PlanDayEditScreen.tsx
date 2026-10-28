import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { getSurahForPage } from '../../lib/quranData';
import {
  memorizedJuzGroups,
  memorizedSurahGroups,
  pageCountLabel,
  pageRangeLabel,
  summarizeDay,
} from '../../lib/planDisplay';
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

  const { dayIndex, initialPages } = route.params;
  const [pages, setPages] = useState<number[]>([...initialPages]);
  const [editing, setEditing] = useState(false);

  const pickerRef = useRef<BottomSheetModal>(null);
  const [pickerTab, setPickerTab] = useState<PickerTabKey>('surah');
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [initialChecked, setInitialChecked] = useState<Set<string>>(new Set());

  const title = dayTitle(dayIndex, today);

  const memorized = useMemo(
    () =>
      allPages
        .filter((p) => p.status === 'memorized')
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

  const isDirty = useMemo(() => {
    if (pages.length !== initialPages.length) return true;
    return pages.some((p, i) => p !== initialPages[i]);
  }, [pages, initialPages]);

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
          ? `${onDay} of ${g.pages.length} pages already on this day`
          : g.pages.length === g.totalPages
            ? pageCountLabel(g.pages.length)
            : `${g.pages.length} of ${g.totalPages} pages memorized`,
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
        title: `Juz ${g.juz}`,
        subtitle: partial
          ? `${onDay} of ${g.pages.length} pages already on this day`
          : `${getSurahForPage(g.pages[0]).name} · ${pageCountLabel(g.pages.length)}`,
        trailing: g.name,
        search: String(g.juz),
        checked: draft.has(`juz:${g.juz}`),
      };
    });
    return [
      { key: 'surah', label: 'Surahs', items: surahItems, emptyText: 'No memorized surahs yet.' },
      { key: 'juz', label: 'Juz', items: juzItems, emptyText: 'No memorized ajzaʼ yet.' },
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
      title={dayIndex === 0 ? "Today's revision" : title}
      tabs={pickerTabs}
      activeTab={pickerTab}
      onTabChange={(k) => setPickerTab(k as PickerTabKey)}
      onSelect={toggleDraft}
      onLeft={() => pickerRef.current?.dismiss()}
      rightLabel="Done"
      onRight={applyPicker}
      rightDisabled={!draftChanged}
      searchPlaceholder="Search surahs or ajzaʼ"
      footer="Checked items are fully on this day. Unchecking one removes it."
    />
  );

  // A v2 top bar (back to the schedule, the date), what's on the day as the
  // screen's title, then flat sections like v2 Settings.
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar
        left={
          <IconButton icon="chevron-back" onPress={commit} label="Back to schedule" size={26} testID="back" />
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
              ? `${pageCountLabel(pages.length)}${isDirty ? ' · Edited' : ''}`
              : `Nothing to revise ${dayIndex === 0 ? 'today' : 'on this day'}`}
          </Text>
        </View>

        {hasContent ? (
          <GroupedSection
            header="On this day"
            headerRight={
              <HeaderTextButton label={editing ? 'Done' : 'Edit'} bold={editing} onPress={() => setEditing((v) => !v)} />
            }
          >
            {surahsOnDay.map((s) => (
              <GroupedRow
                key={s.number}
                title={s.name}
                subtitle={`${pageRangeLabel(s.pages)} · ${pageCountLabel(s.pages.length)}`}
                leading={
                  editing ? (
                    <Tap
                      onPress={() => removeSurah(s)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${s.name}`}
                      testID={`remove-surah-${s.number}`}
                    >
                      <Ionicons name="remove-circle-outline" size={24} color={palette.red} />
                    </Tap>
                  ) : undefined
                }
                trailing={
                  <Text style={[arabicV2(18), { color: palette.secondary }]} accessibilityLanguage="ar">
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
              ? "You haven't marked any pages as memorized yet."
              : hasContent
                ? 'Only content you have memorized is listed.'
                : 'This is a rest day. Add a surah or juz to revise on it.'
          }
        >
          <GroupedRow
            title={hasContent ? 'Add or remove content' : 'Add surahs or ajzaʼ'}
            icon="add-circle-outline"
            onPress={openPicker}
            disabled={!canPick}
            testID="day-pick"
          />
          {hasContent ? (
            <GroupedRow
              title="Make rest day"
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
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
});
