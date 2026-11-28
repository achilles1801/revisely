import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { t } from '../../i18n';
import { ayahCount } from '../../lib/ayahKeys';
import { BEGINNER_SURAHS } from '../../lib/beginner/surahs';
import { surahNameIn } from '../../lib/passages';
import { typeV2 } from '../../theme/v2';
import { ProgressBar } from '../ProgressBar';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';

/** Chrome text: grows to this, then wraps (never clips). */
const MAX_SCALE = 1.6;
const MARK = 40;

/**
 * Learn next on a beginner's Home (BEGIN-6, Revisely Dev), under today's ring: the next surah on the path with its ayahs,
 * how far along the path they are ("7 of 38 learned"), and Learn, which opens it (BEGIN-7). The whole row opens it too.
 */
export function LearnNextRow({ sura, learned, onLearn }: { sura: number; learned: number; onLearn: () => void }) {
  const { palette } = useTheme();
  const name = surahNameIn(sura);
  const ayahs = t('beginner.surahs.ayahs', { count: ayahCount(sura) });
  const total = BEGINNER_SURAHS.length;
  return (
    <View style={[styles.wrap, { borderTopColor: palette.separator }]} testID="learn-next">
      <Tap
        onPress={onLearn}
        accessibilityRole="button"
        accessibilityLabel={t('beginner.learn.nextLabel', { surah: name, ayahs })}
        style={styles.row}
        testID="learn-next-row"
      >
        <View style={[styles.mark, { backgroundColor: palette.accentSubtle }]}>
          <Ionicons name="leaf-outline" size={20} color={palette.accentText} />
        </View>
        <View style={styles.text}>
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE} testID="learn-next-meta">
            {t('beginner.learn.nextMeta', { ayahs })}
          </Text>
          <Text style={[typeV2.barTitle, { color: palette.text }]} maxFontSizeMultiplier={MAX_SCALE} testID="learn-next-name">
            {name}
          </Text>
        </View>
        <PillButton title={t('beginner.learn.cta')} variant="outline" onPress={onLearn} testID="learn-next-cta" />
      </Tap>
      <View style={styles.progress}>
        <View style={styles.bar}>
          <ProgressBar progress={(learned / total) * 100} height={5} testID="learn-next-progress" />
        </View>
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE} testID="learn-next-learned">
          {t('beginner.learn.learned', { count: learned, total })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: MARK, height: MARK, borderRadius: MARK / 2, alignItems: 'center', justifyContent: 'center' },
  // minWidth 0: a long name wraps beside the button instead of pushing it off the row.
  text: { flex: 1, minWidth: 0 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginStart: MARK + 12 },
  bar: { flex: 1, minWidth: 40 },
});
