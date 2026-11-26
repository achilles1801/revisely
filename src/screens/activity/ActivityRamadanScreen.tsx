// The Ramadan row's own page (BEHAVIOUR.md THEME-6; Majd's pick of the v2 mocks, Nov 26 2026): the ayah of the month, the
// days revised, a moon for each day with the last ten nights marked, the khatmah (pages revised or read since 1 Ramadan,
// of 604), and what was revised and read. Its figures are lib/ramadanStats', the same as the row's and the end card's.

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { TopBar } from '../../components/v2/TopBar';
import { MoonStrip } from '../../components/ramadan/MoonStrip';
import { useRamadanMonth } from '../../components/ramadan/useRamadanMonth';
import { useTheme } from '../../context/ThemeContext';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { formatDayLong, formatMinutesLong } from '../../lib/activityFormat';
import { daysBetween } from '../../lib/dayKeys';
import { getQuranWords, loadQuranWords } from '../../lib/recite/quranWords';
import { QURAN_PAGES } from '../../lib/ramadanStats';
import { arabicFullV2, layoutV2, typeV2 } from '../../theme/v2';
import { formatNumber, t } from '../../i18n';

/** Al-Baqarah 185's first words, in the mushaf's script from the app's word data: "the month of Ramadan in which the Qur'an was sent down". */
const AYAH = { sura: 2, ayah: 185, words: 6 };

function useAyahWords(): string | null {
  const [words, setWords] = useState(getQuranWords());
  useEffect(() => {
    if (!words) loadQuranWords().then(setWords).catch(() => undefined);
  }, [words]);
  if (!words) return null;
  const [start, end] = words.verseRange(AYAH.sura, AYAH.ayah);
  return Array.from({ length: Math.min(AYAH.words, end - start) }, (_, i) => words.uthmani(start + i)).join(' ');
}

export default function ActivityRamadanScreen() {
  const navigation = useNavigation();
  const { palette } = useTheme();
  const month = useRamadanMonth();
  const ayah = useAyahWords();
  const footprint = useTabBarFootprint();
  if (!month) {
    return (
      <TopSafeAreaView style={[styles.fill, { backgroundColor: palette.bg }]}>
        <TopBar title={t('ramadan.page.title')} onBack={() => navigation.goBack()} separator />
      </TopSafeAreaView>
    );
  }
  const { phase, stats, dates, today } = month;
  const length = daysBetween(dates.start, dates.eid);
  const day = phase.kind === 'during' ? phase.day : phase.kind === 'eid' ? length + 1 : 0;
  const soFar = stats.daysSoFar;
  const done = stats.revisedDays.length;
  const share = Math.min(1, stats.covered / QURAN_PAGES);
  const row = (label: string, pages: number, minutes: number, testID: string) => (
    <View style={[styles.factRow, { borderBottomColor: palette.separator }]} testID={testID}>
      <View style={styles.factWords}>
        <Text style={[styles.factTitle, { color: palette.text }]}>{label}</Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{formatMinutesLong(minutes)}</Text>
      </View>
      <Text style={[typeV2.body, { color: palette.text }]}>{t('common.pages', { count: pages })}</Text>
    </View>
  );
  return (
    <TopSafeAreaView style={[styles.fill, { backgroundColor: palette.bg }]}>
      <TopBar title={t('ramadan.page.title')} onBack={() => navigation.goBack()} separator />
      <ScrollView contentContainerStyle={{ paddingBottom: footprint + layoutV2.rowPad }} testID="ramadan-page">
        {ayah ? (
          <View style={styles.ayah}>
            <Text style={[arabicFullV2(22), styles.center, { color: palette.text }]} testID="ramadan-ayah">
              {ayah}
            </Text>
            <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]}>{t('ramadan.page.ayahCite')}</Text>
          </View>
        ) : null}
        <View style={styles.block}>
          <View style={styles.big}>
            <Text style={[styles.bigNumber, { color: palette.text }]} testID="ramadan-page-days">
              {t('ramadan.page.ofDays', { done, days: soFar })}
            </Text>
            <Text style={[typeV2.body, { color: palette.secondary }]}>{t('ramadan.page.daysRevised')}</Text>
          </View>
          {phase.kind === 'during' ? (
            <Text style={[typeV2.meta, { color: palette.secondary }]}>{t('ramadan.page.sub', { day: phase.day, date: formatDayLong(today) })}</Text>
          ) : null}
          <MoonStrip
            length={length}
            today={day}
            revised={stats.revisedDays}
            size={18}
            gap={0}
            stars
            numbers={{
              perRow: 15,
              render: (d) => (
                <Text style={[styles.dayNumber, { color: palette.secondary }]} maxFontSizeMultiplier={1.2}>
                  {formatNumber(d)}
                </Text>
              ),
            }}
            testID="ramadan-page-moons"
          />
          <Text style={[typeV2.meta, styles.end, { color: palette.secondary }]}>{t('ramadan.page.lastTen')}</Text>
        </View>
        <View style={[styles.block, { borderTopWidth: layoutV2.hairline, borderTopColor: palette.separator }]} testID="ramadan-khatmah">
          <View style={styles.factRowPlain}>
            <Text style={[styles.factTitle, { color: palette.text, flex: 1 }]}>{t('ramadan.page.khatmah')}</Text>
            <Text style={[styles.factNumber, { color: palette.text }]}>{formatNumber(stats.covered)}</Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>{t('ramadan.page.khatmahUnit')}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: palette.separator }]}>
            <View style={[styles.fillBar, { width: `${share * 100}%`, backgroundColor: palette.doneText }]} />
          </View>
          <Text style={[typeV2.meta, { color: palette.secondary }]}>{t('ramadan.page.khatmahLine')}</Text>
        </View>
        <View style={[styles.gap, { backgroundColor: palette.fill }]} />
        {row(t('ramadan.page.revised'), stats.pagesRevised, stats.minutesRevised, 'ramadan-page-revised')}
        {row(t('ramadan.page.read'), stats.pagesRead, stats.minutesRead, 'ramadan-page-read')}
      </ScrollView>
    </TopSafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  end: { textAlign: 'right', alignSelf: 'flex-end' },
  ayah: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, alignItems: 'center' },
  block: { paddingHorizontal: layoutV2.gutter, paddingVertical: 14, gap: 6 },
  big: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  bigNumber: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  dayNumber: { fontSize: 10, lineHeight: 12 },
  factRowPlain: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, marginStart: layoutV2.gutter, paddingEnd: layoutV2.gutter, borderBottomWidth: StyleSheet.hairlineWidth },
  factWords: { flex: 1, gap: 2 },
  factTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  factNumber: { fontSize: 20, lineHeight: 24, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  fillBar: { height: 6, borderRadius: 3 },
  gap: { height: 6 },
});
