import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { typeV2 } from '../../theme/v2';
import { Confetti } from '../v2/Confetti';
import { PillButton } from '../v2/PillButton';

/**
 * After a revision session's last page, as one more page: swiping onto it
 * marks the last page done (ActiveRevisionScreen). Every page done: "Revision
 * complete"; when the swipe finished the session (`celebrate` goes
 * up) a burst of confetti in the accent's colours, or with Reduce Motion the
 * check fading in. Pages left: how many are done. The session is saved as it
 * goes, and Back leaves it. When every page is done and a next revision day
 * exists, Keep going continues into its pages (#168). A session that was
 * recorded offers Listen back: the recording over its pages.
 */
export function SessionEndCard({
  total,
  done,
  celebrate,
  dayLabel = 'today',
  what,
  next,
  onKeepGoing,
  onListenBack,
}: {
  total: number;
  done: number;
  /** Goes up each time a swipe finished the session. */
  celebrate: number;
  /** What this card closes: "today", or the weekday of a day revised ahead. */
  dayLabel?: string;
  /** What was revised, by surah or juz (lib/passages): "Al-Mujadila to At-Tahrim", "Juz 28". */
  what?: string;
  /** The next revision day (Keep going): its weekday, its surahs and how many pages; none at the end of the cycle. */
  next?: { label: string; what?: string; pages: number } | null;
  onKeepGoing?: () => void;
  /** The session was recorded: play it back over its pages. */
  onListenBack?: () => void;
}) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const complete = total > 0 && done >= total;
  const colors = useMemo(
    () => [palette.done, palette.heat[2], palette.heat[3], palette.heat[4], palette.heat[1]],
    [palette],
  );

  // The check pops in as the session completes (fades in with Reduce Motion).
  const pop = useSharedValue(1);
  useEffect(() => {
    if (celebrate <= 0) return;
    pop.value = 0;
    pop.value = reduceMotion ? withTiming(1, { duration: 250 }) : withSpring(1, { damping: 11, stiffness: 180 });
  }, [celebrate, reduceMotion, pop]);
  const checkStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: pop.value }
      : { opacity: Math.min(1, pop.value * 2), transform: [{ scale: 0.6 + 0.4 * pop.value }] },
  );

  return (
    <View style={styles.card} testID="session-end-card">
      {complete ? <Confetti trigger={celebrate} colors={colors} origin={{ x: 0.5, y: 0.38 }} /> : null}
      <View style={styles.body} accessible accessibilityRole="summary" testID="session-end-summary">
        {complete ? (
          <Reanimated.View style={[styles.check, { borderColor: palette.done }, checkStyle]} testID="session-end-check">
            <Ionicons name="checkmark" size={34} color={palette.doneText} />
          </Reanimated.View>
        ) : null}
        <Text style={[typeV2.title, styles.center, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {complete ? 'Revision complete' : `${done} of ${total} revised`}
        </Text>
        {complete && what ? (
          <Text style={[typeV2.body, styles.center, { color: palette.text }]} maxFontSizeMultiplier={1.4} testID="session-end-what">
            {what}
          </Text>
        ) : null}
        <Text style={[typeV2.body, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {complete
            ? `${total} ${total === 1 ? 'page' : 'pages'} revised ${dayLabel}`
            : 'Swipe back for the pages left.'}
        </Text>
      </View>
      {complete && next && onKeepGoing ? (
        <View style={styles.keep}>
          <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
            {[`Next: ${next.label}`, next.what, `${next.pages} ${next.pages === 1 ? 'page' : 'pages'}`].filter(Boolean).join(' · ')}
          </Text>
          <PillButton title="Keep going" onPress={onKeepGoing} testID="session-end-keep-going" />
        </View>
      ) : null}
      {onListenBack ? (
        <PillButton
          title="Listen back"
          icon="headset-outline"
          variant="outline"
          onPress={onListenBack}
          testID="session-end-listen-back"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 28 },
  body: { alignItems: 'center', gap: 8 },
  keep: { alignItems: 'center', gap: 12 },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  center: { textAlign: 'center' },
});
