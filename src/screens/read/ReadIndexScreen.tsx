import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../../components/PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
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
import { useTabBarFootprint } from '../../components/LiquidGlassTabBar';
import type { ReadStackParamList } from '../../navigation/MainNavigator';

type NavigationProp = NativeStackNavigationProp<ReadStackParamList, 'ReadIndex'>;
type Styles = ReturnType<typeof makeStyles>;

// Hardcoded so the Read tab keeps its iOS-style neutral look regardless of
// the app-wide Mihrab palette. If we ever want this to follow the global
// theme, swap these back to theme.* tokens.
const READ_PALETTE = {
  bg: '#000000',
  card: '#1C1C1E',
  divider: 'rgba(84, 84, 88, 0.35)',
  textPrimary: '#FFFFFF',
  textSecondary: '#AEAEB2',
  textMuted: '#8E8E93',
} as const;

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return diffSec <= 1 ? 'just now' : `${diffSec} seconds ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return diffHr === 1 ? '1 hour ago' : `${diffHr} hours ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return diffDay === 1 ? 'yesterday' : `${diffDay} days ago`;
  return new Date(iso).toLocaleDateString();
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

function fallbackDisplay(name: string, nameArabic: string): SurahDisplay {
  return {
    nameDisplay: name,
    nameArabicVoweled: nameArabic,
    revelationPlace: 'Makki',
    ayahCount: 0,
  };
}

export default function ReadIndexScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const tabFootprint = useTabBarFootprint();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [recent, setRecent] = useState<ReadingHistoryEntry[]>([]);

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

  const header = (
    <View style={styles.headerWrap}>
      <Text style={styles.displayTitle}>Surahs</Text>

      {recent.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RECENT PAGES</Text>
          <View style={styles.card}>
            {recent.map((entry, i) => (
              <RecentRow
                key={`recent-${entry.pageNumber}-${entry.lastReadAt}`}
                entry={entry}
                isLast={i === recent.length - 1}
                onPress={() => openPage(entry.pageNumber)}
                styles={styles}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={juzGroups}
        keyExtractor={(item) => `juz-group-${item.juz}`}
        ListHeaderComponent={header}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabFootprint + spacing.xl },
        ]}
        renderItem={({ item }) => (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>JUZ' {item.juz}</Text>
            <View style={styles.card}>
              {item.surahs.map((s, i) => (
                <SurahCardRow
                  key={s.key}
                  row={s}
                  isLast={i === item.surahs.length - 1}
                  onPress={() => openPage(s.startPage)}
                  styles={styles}
                />
              ))}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function getFirstSurahOnPage(pageNumber: number): SurahOnPage | undefined {
  return getSurahsForPage(pageNumber)[0];
}

function RecentRow({
  entry,
  isLast,
  onPress,
  styles,
}: {
  entry: ReadingHistoryEntry;
  isLast: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  const surah = getFirstSurahOnPage(entry.pageNumber);
  const display = surah
    ? getSurahDisplay(surah.number) ?? fallbackDisplay(surah.name, surah.nameArabic)
    : null;
  return (
    <PressableScale onPress={onPress} haptic="selection" scale={0.985}>
      <View
        style={[
          styles.row,
          !isLast && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: READ_PALETTE.divider,
          },
        ]}
      >
        <Ionicons
          name="time-outline"
          size={15}
          color={READ_PALETTE.textMuted}
          style={styles.rowLeadIcon}
        />
        <View style={styles.rowMain}>
          <Text style={styles.englishTitle} numberOfLines={1}>
            {display?.nameDisplay ?? `Page ${entry.pageNumber}`}
          </Text>
          <Text style={styles.rowSub}>{formatRelativeTime(entry.lastReadAt)}</Text>
        </View>
        <Text style={styles.endNumber}>{entry.pageNumber}</Text>
      </View>
    </PressableScale>
  );
}

function SurahCardRow({
  row,
  isLast,
  onPress,
  styles,
}: {
  row: SurahRow;
  isLast: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <PressableScale onPress={onPress} haptic="selection" scale={0.985}>
      <View
        style={[
          styles.row,
          !isLast && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: READ_PALETTE.divider,
          },
        ]}
      >
        <View style={styles.rowMain}>
          <Text style={styles.englishTitle} numberOfLines={1}>
            {row.number}. {row.nameDisplay}
          </Text>
          <Text style={styles.rowSub}>
            {row.revelationPlace} · {row.ayahCount} verses
          </Text>
        </View>
        <Text style={styles.endNumber}>{row.startPage}</Text>
      </View>
    </PressableScale>
  );
}

const makeStyles = (_theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: READ_PALETTE.bg },
    listContent: { paddingHorizontal: spacing.md },
    headerWrap: { paddingTop: spacing.xs, paddingBottom: spacing.xs },
    displayTitle: {
      fontSize: 28,
      fontWeight: '700',
      lineHeight: 34,
      letterSpacing: -0.4,
      color: READ_PALETTE.textPrimary,
      marginBottom: spacing.sm,
    },
    section: { marginBottom: spacing.md },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: READ_PALETTE.textMuted,
      marginBottom: 6,
      marginLeft: spacing.sm,
    },
    card: {
      backgroundColor: READ_PALETTE.card,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      minHeight: 52,
    },
    rowLeadIcon: {
      marginRight: spacing.xs,
    },
    rowMain: { flex: 1, justifyContent: 'center' },
    englishTitle: {
      fontSize: 15,
      fontWeight: '500',
      lineHeight: 20,
      color: READ_PALETTE.textPrimary,
    },
    rowSub: {
      fontSize: 12,
      lineHeight: 16,
      color: READ_PALETTE.textMuted,
      marginTop: 2,
    },
    endNumber: {
      fontSize: 14,
      color: READ_PALETTE.textSecondary,
      fontWeight: '400',
      marginLeft: spacing.sm,
      minWidth: 28,
      textAlign: 'right',
    },
  });
