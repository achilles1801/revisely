import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import {
  getJuzForPage,
  getSurahForPage,
  JUZ_NAMES,
} from '../../lib/quranData';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'PlanDayEdit'>;
type RouteProps = RouteProp<HomeStackParamList, 'PlanDayEdit'>;
type PickerTab = 'surah' | 'juz';

function dayLabel(index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return `In ${index} days`;
}

interface MemorizedJuz { juz: number; pages: number[]; }
interface MemorizedSurah {
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

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<PickerTab>('surah');
  const [draftSurahs, setDraftSurahs] = useState<Set<number>>(new Set());
  const [draftJuz, setDraftJuz] = useState<Set<number>>(new Set());

  const memorizedPageNumbers = useMemo(
    () => allPages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber),
    [allPages],
  );

  const memorizedJuzList = useMemo<MemorizedJuz[]>(() => {
    const map = new Map<number, number[]>();
    for (const p of memorizedPageNumbers) {
      const juz = getJuzForPage(p);
      const arr = map.get(juz) ?? [];
      arr.push(p);
      map.set(juz, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([juz, pgs]) => ({ juz, pages: pgs.sort((a, b) => a - b) }));
  }, [memorizedPageNumbers]);

  const memorizedSurahList = useMemo<MemorizedSurah[]>(() => {
    const map = new Map<number, number[]>();
    for (const p of memorizedPageNumbers) {
      const surahNum = getSurahForPage(p).number;
      const arr = map.get(surahNum) ?? [];
      arr.push(p);
      map.set(surahNum, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([num, pgs]) => {
        const info = getSurahForPage(pgs[0]);
        return {
          number: num,
          name: info.name,
          nameArabic: info.nameArabic,
          pages: pgs.sort((a, b) => a - b),
        };
      });
  }, [memorizedPageNumbers]);

  const pagesSet = useMemo(() => new Set(pages), [pages]);

  const fullySelectedJuz = useMemo(
    () => memorizedJuzList.filter((j) => j.pages.every((p) => pagesSet.has(p))),
    [memorizedJuzList, pagesSet],
  );
  const fullySelectedSurahs = useMemo(() => {
    const inSelectedJuz = new Set<number>();
    for (const j of fullySelectedJuz) j.pages.forEach((p) => inSelectedJuz.add(p));
    return memorizedSurahList.filter((s) => {
      if (!s.pages.every((p) => pagesSet.has(p))) return false;
      return !s.pages.every((p) => inSelectedJuz.has(p));
    });
  }, [memorizedSurahList, pagesSet, fullySelectedJuz]);

  const summary = useMemo(() => {
    if (pages.length === 0) {
      return { primary: 'Rest day', secondary: null as string | null };
    }
    const surahNames = fullySelectedSurahs.map((s) => s.name);
    const juzNumbers = fullySelectedJuz.map((j) => j.juz);

    if (juzNumbers.length > 0) {
      const primary =
        juzNumbers.length === 1
          ? `Juz ${juzNumbers[0]}`
          : `Ajzaʼ ${juzNumbers.join(', ')}`;
      const secondary =
        surahNames.length > 0
          ? surahNames.slice(0, 3).join(', ') +
            (surahNames.length > 3 ? ` +${surahNames.length - 3}` : '')
          : null;
      return { primary, secondary };
    }
    if (surahNames.length > 0) {
      return {
        primary: surahNames[0],
        secondary:
          surahNames.length > 1 ? surahNames.slice(1).join(', ') : null,
      };
    }
    return { primary: `${pages.length} pages`, secondary: 'Custom selection' };
  }, [pages.length, fullySelectedSurahs, fullySelectedJuz]);

  const isDirty = useMemo(() => {
    if (pages.length !== initialPages.length) return true;
    for (let i = 0; i < pages.length; i++) {
      if (pages[i] !== initialPages[i]) return true;
    }
    return false;
  }, [pages, initialPages]);

  const isOff = pages.length === 0;

  const surahsOnThisDay = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const p of pages) {
      const surahNum = getSurahForPage(p).number;
      const arr = map.get(surahNum) ?? [];
      arr.push(p);
      map.set(surahNum, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([num, pgs]) => {
        const info = getSurahForPage(pgs[0]);
        return { number: num, name: info.name, nameArabic: info.nameArabic, pages: pgs };
      });
  }, [pages]);

  const openPicker = useCallback(
    (initialTab: PickerTab) => {
      Haptics.selectionAsync();
      setDraftSurahs(new Set(fullySelectedSurahs.map((s) => s.number)));
      setDraftJuz(new Set(fullySelectedJuz.map((j) => j.juz)));
      setPickerTab(initialTab);
      setPickerOpen(true);
    },
    [fullySelectedSurahs, fullySelectedJuz],
  );

  const applyPicker = () => {
    const newPages = new Set<number>();
    for (const num of draftSurahs) {
      const surah = memorizedSurahList.find((s) => s.number === num);
      surah?.pages.forEach((p) => newPages.add(p));
    }
    for (const num of draftJuz) {
      const juz = memorizedJuzList.find((j) => j.juz === num);
      juz?.pages.forEach((p) => newPages.add(p));
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPages(Array.from(newPages).sort((a, b) => a - b));
    setPickerOpen(false);
  };

  const togglePickerSurah = (num: number) => {
    Haptics.selectionAsync();
    setDraftSurahs((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };
  const togglePickerJuz = (num: number) => {
    Haptics.selectionAsync();
    setDraftJuz((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const removeSurahFromDay = (num: number) => {
    const surahPages = new Set(
      memorizedSurahList.find((s) => s.number === num)?.pages ?? [],
    );
    Haptics.selectionAsync();
    setPages((prev) => prev.filter((p) => !surahPages.has(p)));
  };
  const removeJuzFromDay = (num: number) => {
    const juzPages = new Set(
      memorizedJuzList.find((j) => j.juz === num)?.pages ?? [],
    );
    Haptics.selectionAsync();
    setPages((prev) => prev.filter((p) => !juzPages.has(p)));
  };

  const handleDone = () => {
    if (isDirty) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.popTo(
        'PlanEdit',
        { editedDay: { index: dayIndex, pages } },
        { merge: true },
      );
    } else {
      navigation.goBack();
    }
  };

  const draftCount = draftSurahs.size + draftJuz.size;
  const canPick = memorizedSurahList.length > 0 || memorizedJuzList.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale
          onPress={handleDone}
          haptic="light"
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
          <Text style={styles.backText}>Back</Text>
        </PressableScale>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.dayLabel}>{dayLabel(dayIndex)}</Text>
          <Text style={[styles.summary, isOff && styles.summaryOff]}>
            {summary.primary}
          </Text>
          {summary.secondary && (
            <Text style={styles.summarySecondary}>{summary.secondary}</Text>
          )}
          {!isOff && (
            <Text style={styles.pageCount}>
              {pages.length} page{pages.length === 1 ? '' : 's'}
            </Text>
          )}
        </View>

        <View style={styles.chipRow}>
          {fullySelectedJuz.map((j) => (
            <PressableScale
              key={`juz-${j.juz}`}
              onPress={() => removeJuzFromDay(j.juz)}
              haptic="light"
              scale={0.96}
              style={styles.chip}
              accessibilityLabel={`Remove Juz ${j.juz}`}
            >
              <Text style={styles.chipText}>Juz {j.juz}</Text>
              <Ionicons name="close" size={14} color={theme.textMuted} />
            </PressableScale>
          ))}
          {fullySelectedSurahs.map((s) => (
            <PressableScale
              key={`surah-${s.number}`}
              onPress={() => removeSurahFromDay(s.number)}
              haptic="light"
              scale={0.96}
              style={styles.chip}
              accessibilityLabel={`Remove ${s.name}`}
            >
              <Text style={styles.chipText}>{s.name}</Text>
              <Ionicons name="close" size={14} color={theme.textMuted} />
            </PressableScale>
          ))}
          {canPick && (
            <PressableScale
              onPress={() => openPicker(isOff ? 'surah' : pickerTab)}
              haptic="light"
              scale={0.96}
              style={[styles.chip, styles.chipAdd]}
            >
              <Text style={[styles.chipText, styles.chipAddText]}>
                {fullySelectedJuz.length === 0 && fullySelectedSurahs.length === 0
                  ? '+ Add content'
                  : '+ Add more'}
              </Text>
            </PressableScale>
          )}
        </View>

        {!isOff && surahsOnThisDay.length > 0 && (
          <View style={styles.onThisDay}>
            <Text style={styles.sectionLabel}>On this day</Text>
            <View>
              {surahsOnThisDay.map((s, idx) => {
                const isLast = idx === surahsOnThisDay.length - 1;
                return (
                  <View
                    key={s.number}
                    style={[styles.surahRow, !isLast && styles.surahRowDivider]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.surahName} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Text style={styles.surahMeta}>
                        {s.pages.length} page{s.pages.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text style={styles.surahArabic}>{s.nameArabic}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={styles.pickerCard}
          >
            <GlassCard style={StyleSheet.absoluteFillObject} />

            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Pick content</Text>
              <PressableScale
                onPress={() => setPickerOpen(false)}
                haptic="light"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.pickerClose}
              >
                <Ionicons name="close" size={20} color={theme.textMuted} />
              </PressableScale>
            </View>

            <Text style={styles.pickerHelper}>
              Pick as many surahs or ajzaʼ as you like.
            </Text>

            <View style={styles.tabSwitcher}>
              <Pressable
                style={[
                  styles.tabButton,
                  pickerTab === 'surah' && styles.tabButtonActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPickerTab('surah');
                }}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    pickerTab === 'surah' && styles.tabLabelActive,
                  ]}
                >
                  Surahs
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.tabButton,
                  pickerTab === 'juz' && styles.tabButtonActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPickerTab('juz');
                }}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    pickerTab === 'juz' && styles.tabLabelActive,
                  ]}
                >
                  Ajzaʼ
                </Text>
              </Pressable>
            </View>

            <ScrollView style={styles.pickerScroll}>
              {pickerTab === 'surah' &&
                memorizedSurahList.map((s) => {
                  const selected = draftSurahs.has(s.number);
                  return (
                    <PressableScale
                      key={s.number}
                      onPress={() => togglePickerSurah(s.number)}
                      haptic="none"
                      scale={0.99}
                      style={styles.pickerRow}
                    >
                      <CheckBubble selected={selected} theme={theme} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[
                            styles.pickerName,
                            selected && styles.pickerNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {s.name}
                        </Text>
                        <Text style={styles.pickerCount}>
                          {s.pages.length} memorized page
                          {s.pages.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <Text style={styles.pickerArabic}>{s.nameArabic}</Text>
                    </PressableScale>
                  );
                })}
              {pickerTab === 'juz' &&
                memorizedJuzList.map(({ juz, pages: juzPages }) => {
                  const selected = draftJuz.has(juz);
                  return (
                    <PressableScale
                      key={juz}
                      onPress={() => togglePickerJuz(juz)}
                      haptic="none"
                      scale={0.99}
                      style={styles.pickerRow}
                    >
                      <CheckBubble selected={selected} theme={theme} />
                      <View style={styles.pickerJuzBadge}>
                        <Text style={styles.pickerJuzBadgeText}>{juz}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.pickerName,
                            selected && styles.pickerNameSelected,
                          ]}
                        >
                          Juz {juz}
                        </Text>
                        <Text style={styles.pickerCount}>
                          {juzPages.length} memorized page
                          {juzPages.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <Text style={styles.pickerArabic}>
                        {JUZ_NAMES[juz - 1] ?? ''}
                      </Text>
                    </PressableScale>
                  );
                })}
            </ScrollView>

            <View style={styles.pickerFooter}>
              <Button
                title={draftCount === 0 ? 'Clear day' : `Done (${draftCount} selected)`}
                onPress={applyPicker}
                variant="primary"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function CheckBubble({ selected, theme }: { selected: boolean; theme: ThemeColors }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: selected ? 0 : 2,
        borderColor: theme.border,
        backgroundColor: selected ? theme.accent : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected && (
        <Ionicons name="checkmark" size={14} color={theme.textInverse} />
      )}
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      height: 56,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs,
      marginLeft: -spacing.xs,
    },
    backText: {
      ...typography.bodySmall,
      color: theme.textSecondary,
    },

    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },

    hero: {
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    dayLabel: {
      ...typography.label,
      color: theme.accent,
      marginBottom: spacing.xs,
    },
    summary: {
      ...typography.displaySmall,
      color: theme.textPrimary,
    },
    summaryOff: {
      color: theme.textMuted,
      fontStyle: 'italic',
    },
    summarySecondary: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      marginTop: 4,
    },
    pageCount: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: spacing.xs,
    },

    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.lg,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      backgroundColor: theme.bgAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: radius.sm,
    },
    chipText: {
      ...typography.bodySmall,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
    },
    chipAdd: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent + '33',
    },
    chipAddText: {
      color: theme.accent,
    },

    onThisDay: {
      marginTop: spacing.sm,
    },
    sectionLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginBottom: spacing.sm,
    },
    surahRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    surahRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    surahName: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
    },
    surahMeta: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: 2,
    },
    surahArabic: {
      ...typography.bodyLarge,
      color: theme.textMuted,
    },

    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.40)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
    },
    pickerCard: {
      width: '100%',
      maxWidth: 440,
      maxHeight: '80%',
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    pickerTitle: {
      fontFamily: 'Georgia',
      fontSize: 20,
      lineHeight: 26,
      color: theme.textPrimary,
    },
    pickerClose: {
      padding: 4,
      marginRight: -4,
    },
    pickerHelper: {
      ...typography.bodySmall,
      color: theme.textMuted,
      paddingHorizontal: spacing.base,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },

    tabSwitcher: {
      flexDirection: 'row',
      marginHorizontal: spacing.base,
      marginBottom: spacing.sm,
      backgroundColor: theme.bgAlt,
      borderRadius: radius.sm,
      padding: 4,
    },
    tabButton: {
      flex: 1,
      paddingVertical: spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.xs,
    },
    tabButtonActive: {
      backgroundColor: theme.bg,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    tabLabel: {
      ...typography.bodySmall,
      fontFamily: 'Inter_500Medium',
      color: theme.textMuted,
    },
    tabLabelActive: {
      color: theme.textPrimary,
    },

    pickerScroll: {
      maxHeight: 380,
      paddingHorizontal: spacing.xs,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.sm,
    },
    pickerJuzBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.bgAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerJuzBadgeText: {
      ...typography.bodySmall,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    pickerName: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
    },
    pickerNameSelected: {
      fontFamily: 'Inter_500Medium',
    },
    pickerCount: {
      ...typography.caption,
      color: theme.textMuted,
      marginTop: 1,
    },
    pickerArabic: {
      ...typography.bodyMedium,
      color: theme.textMuted,
    },
    pickerFooter: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
  });
