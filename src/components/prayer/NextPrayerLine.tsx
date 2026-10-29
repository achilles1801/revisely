import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { countdown, formatTime, TIME_LABELS } from '../../lib/prayer/times';
import type { PrayerTimesNow } from './usePrayerTimes';

/**
 * "Asr 2:11 PM · in 1h 12m" under Home's header (Settings → Home screen → Next
 * prayer); opens the Prayer sheet on Times. One line, not a post: Home keeps
 * its one Today post. Nothing opaque and no hairline, so Home's glow carries
 * on behind it without an edge.
 */
export function NextPrayerLine({ times, onPress }: { times: PrayerTimesNow; onPress: () => void }) {
  const { palette } = useTheme();
  const { next, now } = times;
  if (!next) return null;
  const name = TIME_LABELS[next.name].en;
  const time = formatTime(next.time);
  const left = countdown(next.time.getTime() - now.getTime());
  return (
    <Tap
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`Next prayer: ${name} at ${time}, ${left}`}
      accessibilityHint="Opens prayer times"
      testID="next-prayer-line"
    >
      <Ionicons name="time-outline" size={20} color={palette.accentText} />
      <Text style={[typeV2.body, typeV2.numeral, styles.main, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
        <Text style={[styles.name, { color: palette.accentText }]}>{name}</Text> {time}
      </Text>
      <View style={styles.right}>
        <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {left}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={palette.secondary} />
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 8,
  },
  main: { flex: 1 },
  name: { fontWeight: '600' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
