import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
// Gesture Handler's list, so a sideways swipe on it can move to the next tab
// (navigation/PagerTabs): over React Native's own, the swipe never started.
import { FlatList } from 'react-native-gesture-handler';
import { useNavigation, useFocusEffect, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { quranSearchEnabled, voiceSearchEnabled } from '../../lib/search/availability';
import { arabicV2, layoutV2, typeV2 } from '../../theme/v2';
import { Mark } from '../../components/v2/Mark';
import { Tap } from '../../components/v2/Tap';
import {
  getAllSurahs,
  getJuzForPage,
  getSurahDisplay,
  getSurahsForPage,
  SurahDisplay,
  SurahOnPage,
} from '../../lib/quranData';
import {
  getRecentReadingPages,
  ReadingHistoryEntry,
} from '../../lib/readingHistory';
import { useTabBarFootprint } from '../../navigation/TabBar';
import type { ReadStackParamList } from '../../navigation/MainNavigator';
import { arabicLabelLines } from '../../lib/platformUi';
import { ayahsInSurah, spokenText } from '../../lib/passages';
import { formatDate, t, formatNumber } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<ReadStackParamList, 'ReadIndex'>;


function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return diffSec <= 1 ? t('read.index.justNow') : t('read.index.secondsAgo', { count: diffSec });
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return t('read.index.minutesAgo', { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t('read.index.hoursAgo', { count: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return diffDay === 1 ? t('read.index.yesterday') : t('read.index.daysAgo', { count: diffDay });
  return formatDate(new Date(iso), {}, 'device');
}

interface SurahRow {
  key: string;
  number: number;
  nameDisplay: string;
  nameArabicVoweled: string;
  revelationPlace: string;
  ayahCount: number;
  startPage: number;
}

interface JuzGroup {
  juz: number;
  surahs: SurahRow[];
}

/** Makki or Madani, in the app's language. */
function placeWord(place: string): string {
  return place === 'Madani' ? t('read.index.madani') : t('read.index.makki');
}

function fallbackDisplay(name: string, nameArabic: string): SurahDisplay {
  return {
    nameDisplay: name,
    nameArabicVoweled: nameArabic,
    revelationPlace: 'Makki', // i18n-ignore (the data's value; shown through placeWord)
    ayahCount: 0,
  };
}

export default function ReadIndexScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { isDark, palette: v2Palette } = useTheme();
  const { user } = useApp();
  // Search the Qur'an: typed for everyone, recited too on an iPhone that can listen.
  const searchOn = quranSearchEnabled(user);
  const voiceSearch = searchOn && voiceSearchEnabled(user);
  // Room for the tab bar (and the mini player). Revo's button isn't on the Read tab (REVO-25).
  const tabFootprint = useTabBarFootprint();

  const [recent, setRecent] = useState<ReadingHistoryEntry[]>([]);
  // Tapping the Read tab while on it scrolls the index back to the top.
  const listRef = useRef<FlatList<JuzGroup>>(null);
  useScrollToTop(listRef);

  const refreshRecent = useCallback(async () => {
    const entries = await getRecentReadingPages(3);
    setRecent(entries);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshRecent();
    }, [refreshRecent]),
  );

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  const openPage = (pageNumber: number) => {
    navigation.navigate('QuranReader', { pageNumber, source: 'index' });
  };

  const juzGroups = useMemo<JuzGroup[]>(() => {
    const groups = new Map<number, JuzGroup>();
    for (const s of getAllSurahs()) {
      const juz = getJuzForPage(s.startPage);
      const display = getSurahDisplay(s.number) ?? fallbackDisplay(s.name, s.nameArabic);
      let group = groups.get(juz);
      if (!group) {
        group = { juz, surahs: [] };
        groups.set(juz, group);
      }
      group.surahs.push({
        key: `surah-${s.number}`,
        number: s.number,
        nameDisplay: display.nameDisplay,
        nameArabicVoweled: display.nameArabicVoweled,
        revelationPlace: display.revelationPlace,
        ayahCount: display.ayahCount,
        startPage: s.startPage,
      });
    }
    return Array.from(groups.values()).sort((a, b) => a.juz - b.juz);
  }, []);

  // A large title, then flat rows on hairlines under a bold header per juz. A
  // surah's number sits in its mark, its Arabic name (in Amiri) at the end.
  const headerV2 = (
    <View>
      <View style={v2.titleBlock}>
        <Text style={[typeV2.largeTitle, { color: v2Palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {t('read.index.title')}
        </Text>
      </View>
      {searchOn ? (
        <View style={v2.searchRow}>
          <Tap
            onPress={() => navigation.navigate('QuranSearch')}
            accessibilityRole="button"
            accessibilityLabel={t('read.search.label')}
            style={[v2.searchField, { backgroundColor: v2Palette.fill }]}
            testID="read-search"
          >
            <Ionicons name="search" size={18} color={v2Palette.secondary} />
            <Text style={[typeV2.body, { color: v2Palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              {t('read.search.label')}
            </Text>
          </Tap>
          {voiceSearch ? (
            <Tap
              onPress={() => navigation.navigate('QuranSearch', { listen: true })}
              accessibilityRole="button"
              accessibilityLabel={t('read.search.voice')}
              hitSlop={6}
              style={[v2.searchMic, { backgroundColor: v2Palette.primary }]}
              testID="read-search-voice"
            >
              <Ionicons name="mic" size={20} color={v2Palette.onPrimary} />
            </Tap>
          ) : null}
        </View>
      ) : null}
      {recent.length > 0 && (
        <View testID="read-recent">
          <SectionTitleV2 title={t('read.index.recent')} />
          {recent.map((entry) => (
            <RecentRowV2
              key={`recent-${entry.pageNumber}-${entry.lastReadAt}`}
              entry={entry}
              onPress={() => openPage(entry.pageNumber)}
            />
          ))}
        </View>
      )}
    </View>
  );
  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: v2Palette.bg }]}>
      <FlatList
        ref={listRef}
        data={juzGroups}
        // Long list: keep the scroll indicator visible, in a colour that
        // reads on both the black and white grounds.
        showsVerticalScrollIndicator
        indicatorStyle={isDark ? 'white' : 'black'}
        keyExtractor={(item) => `juz-group-${item.juz}`}
        ListHeaderComponent={headerV2}
        contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: tabFootprint + layoutV2.rowPad }}
        renderItem={({ item }) => (
          <View testID={`read-juz-${item.juz}`}>
            <SectionTitleV2 title={t('read.index.juzSection', { n: item.juz })} />
            {item.surahs.map((s) => (
              <SurahRowV2 key={s.key} row={s} onPress={() => openPage(s.startPage)} />
            ))}
          </View>
        )}
        testID="read-index-v2"
      />
    </TopSafeAreaView>
  );
}

function getFirstSurahOnPage(pageNumber: number): SurahOnPage | undefined {
  return getSurahsForPage(pageNumber)[0];
}

function SectionTitleV2({ title }: { title: string }) {
  const { palette } = useTheme();
  return (
    <View style={v2.sectionTitle}>
      <Text style={[typeV2.name, { color: palette.text }]} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

function RecentRowV2({ entry, onPress }: { entry: ReadingHistoryEntry; onPress: () => void }) {
  const { palette } = useTheme();
  const surah = getFirstSurahOnPage(entry.pageNumber);
  const display = surah
    ? getSurahDisplay(surah.number) ?? fallbackDisplay(surah.name, surah.nameArabic)
    : null;
  const name = display?.nameDisplay ?? t('common.pageN', { n: entry.pageNumber });
  const when = formatRelativeTime(entry.lastReadAt);
  // The surah's ayahs on that page first, the page number a quiet detail (surahs and juz first, CLAUDE.md).
  const ayahs = surah ? ayahsInSurah(surah.number, [entry.pageNumber]) : '';
  const meta = [ayahs, t('common.pageShort', { n: entry.pageNumber }), when].filter(Boolean).join(' · ');
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        ayahs
          ? t('read.index.recentLabel', { name, ayahs: spokenText(ayahs), page: entry.pageNumber, when })
          : t('read.index.recentLabelNoAyahs', { name, page: entry.pageNumber, when })
      }
      style={[v2.row, { borderBottomColor: palette.separator }]}
      testID={`recent-${entry.pageNumber}`}
    >
      <Mark size="reply" icon="time-outline" />
      <View style={v2.main}>
        <Text style={[typeV2.name, { color: palette.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{meta}</Text>
      </View>
      {display?.nameArabicVoweled ? (
        <Text style={[arabicV2(20), v2.arabic, { color: palette.text }]} accessibilityLanguage="ar" numberOfLines={arabicLabelLines}>
          {display.nameArabicVoweled}
        </Text>
      ) : null}
    </Tap>
  );
}

function SurahRowV2({ row, onPress }: { row: SurahRow; onPress: () => void }) {
  const { palette } = useTheme();
  const place = placeWord(row.revelationPlace);
  const meta =
    row.ayahCount > 0
      ? t('read.index.surahMeta', { place, count: row.ayahCount, page: row.startPage })
      : t('read.index.surahMetaNoVerses', { place, page: row.startPage });
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${formatNumber(row.number)}. ${row.nameDisplay}, ${meta}`}
      style={[v2.row, { borderBottomColor: palette.separator }]}
      testID={`surah-${row.number}`}
    >
      <Mark size="reply" label={formatNumber(row.number)} />
      <View style={v2.main}>
        <Text style={[typeV2.name, { color: palette.text }]} numberOfLines={1}>
          {row.nameDisplay}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{meta}</Text>
      </View>
      <Text style={[arabicV2(20), v2.arabic, { color: palette.text }]} accessibilityLanguage="ar" numberOfLines={arabicLabelLines}>
        {row.nameArabicVoweled}
      </Text>
    </Tap>
  );
}

const v2 = StyleSheet.create({
  titleBlock: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 4 },
  searchField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: 999, paddingHorizontal: 12 },
  searchMic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { paddingHorizontal: layoutV2.gutter, paddingTop: layoutV2.rowPad + 8, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutV2.markGap,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: layoutV2.gutter,
    borderBottomWidth: layoutV2.hairline,
  },
  main: { flex: 1, minWidth: 0 },
  arabic: { maxWidth: 140, textAlign: 'right' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
});
