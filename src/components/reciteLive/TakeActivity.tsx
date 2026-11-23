import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { TakeClock, useTakeSeconds } from '../../lib/reciteLive/takeClock';
import { t } from '../../i18n';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * A take on an immersive page (the header and the bar put away): its time beside the page number, with the red dot
 * while it records, as on the bar. A tap brings the controls back.
 */
export function TakeActivity({ clock: takeClock, recording, onPress }: { clock: TakeClock; recording: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  const seconds = useTakeSeconds(takeClock);
  return (
    <Tap
      onPress={onPress}
      hitSlop={10}
      style={[styles.pill, { backgroundColor: palette.fill, borderColor: palette.separator }]}
      accessibilityRole="button"
      accessibilityLabel={t(recording ? 'reciteLive.activityRecording' : 'reciteLive.activity', { time: clock(seconds) })}
      testID="reader-take-activity"
    >
      {recording ? <View style={[styles.dot, { backgroundColor: palette.red }]} /> : null}
      <Text style={[typeV2.numeral, styles.text, { color: palette.secondary }]} maxFontSizeMultiplier={1.2} testID="reader-take-time">
        {clock(seconds)}
      </Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: '600' },
});
