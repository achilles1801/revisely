import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { fonts } from '../../theme/typography';
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
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { pages: allPages } = useApp();

  const { dayIndex, initialPages } = route.params;
  const [pages, setPages] = useState<number[]>([...initialPages]);
  const [editing, setEditing] = useState(false);

  const pickerRef = useRef<BottomSheetModal>(null);
  const [pickerTab, setPickerTab] = useState<PickerTabKey>('surah');
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [initialChecked, setInitialChecked] = useState<Set<string>>(new Set());

  const today = useMemo(() => new Date(), []);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.popTo('PlanEdit', { editedDay: { index: dayIndex, pages } }, { merge: true });
    } else {
      navigation.goBack();
    }
  }, [isDirty, navigation, dayIndex, pages]);

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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    Haptics.selectionAsync();
    setPages((prev) => prev.filter((p) => !remove.has(p)));
  };

  const makeRest = () => {
    setPages([]);
    setEditing(false);
  };

  const canPick = memorized.length > 0;
  const hasContent = pages.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navBar}>
        <Pressable
          onPress={commit}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.navBack}
          accessibilityRole="button"
          accessibilityLabel="Back to schedule"
        >
          {({ pressed }) => (
            <>
              <Ionicons
                name="chevron-back"
                size={24}
                color={theme.accent}
                style={{ opacity: pressed ? 0.5 : 1 }}
              />
              <Text style={[styles.navBackText, { opacity: pressed ? 0.5 : 1 }]}>Schedule</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.navSide} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, summary.isRest && styles.heroTitleRest]} numberOfLines={2}>
            {summary.title}
          </Text>
          <Text style={styles.heroSubtitle}>
            {hasContent
              ? `${pageCountLabel(pages.length)}${isDirty ? ' · Edited' : ''}`
              : `Nothing to revise ${dayIndex === 0 ? 'today' : 'on this day'}`}
          </Text>
        </View>

        {hasContent ? (
          <GroupedSection
            header="On this day"
            headerRight={
              <HeaderTextButton
                label={editing ? 'Done' : 'Edit'}
                bold={editing}
                onPress={() => setEditing((v) => !v)}
              />
            }
            separatorInset={editing ? spacing.md + 28 + spacing.sm : spacing.md}
          >
            {surahsOnDay.map((s) => (
              <GroupedRow
                key={s.number}
                title={s.name}
                subtitle={`${pageRangeLabel(s.pages)} · ${pageCountLabel(s.pages.length)}`}
                leading={
                  editing ? (
                    <Pressable
                      onPress={() => removeSurah(s)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${s.name}`}
                      style={styles.minusSlot}
                    >
                      <Ionicons name="remove-circle" size={24} color={theme.error} />
                    </Pressable>
                  ) : undefined
                }
                trailing={<Text style={styles.arabic}>{s.nameArabic}</Text>}
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
            title={hasContent ? 'Add or Remove Content' : 'Add Surahs or Ajzaʼ'}
            icon="add-circle"
            tone="accent"
            onPress={openPicker}
            disabled={!canPick}
          />
          {hasContent ? (
            <GroupedRow
              title="Make Rest Day"
              icon="moon-outline"
              tone="destructive"
              onPress={makeRest}
            />
          ) : null}
        </GroupedSection>
      </ScrollView>

      <ListPickerSheet
        ref={pickerRef}
        title={dayIndex === 0 ? "Today's Revision" : title}
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
    </SafeAreaView>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 44,
      paddingHorizontal: spacing.xs,
    },
    navBack: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 110,
    },
    navBackText: {
      fontSize: 17,
      color: theme.accent,
      marginLeft: -2,
    },
    navTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    navSide: { width: 110 },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.huge,
    },
    hero: {
      paddingHorizontal: spacing.xxs,
      paddingTop: spacing.sm,
    },
    heroTitle: {
      fontSize: 34,
      lineHeight: 41,
      fontWeight: '700',
      letterSpacing: 0.3,
      color: theme.textPrimary,
    },
    heroTitleRest: {
      color: theme.textMuted,
    },
    heroSubtitle: {
      fontSize: 15,
      lineHeight: 20,
      color: theme.textSecondary,
      marginTop: 2,
    },
    minusSlot: {
      width: 28,
      alignItems: 'center',
    },
    arabic: {
      fontFamily: fonts.arabic,
      fontSize: 18,
      color: theme.textMuted,
    },
  });
