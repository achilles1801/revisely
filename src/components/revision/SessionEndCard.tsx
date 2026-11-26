import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { typeV2 } from '../../theme/v2';
import { Confetti } from '../v2/Confetti';
import { PillButton } from '../v2/PillButton';
import { NewBadgeRow } from '../account/NewBadgeRow';
import type { Milestone } from '../../lib/badges';
import { Tap } from '../v2/Tap';
import { t } from '../../i18n';
import { chevron } from '../../i18n/direction';
import { Crescent } from '../ramadan/art';
import { EndCardDecor } from '../ramadan/EndCardDecor';
import { useRamadanEndCard } from '../ramadan/useRamadanEndCard';
import { ramadanV2 } from '../../theme/v2';

/**
 * After a revision session's last page, as one more page: swiping onto it
 * marks the last page done (ActiveRevisionScreen). Every page done: "Revision
 * complete"; when the swipe finished the session (`celebrate` goes
 * up) a burst of confetti in the accent's colours, or with Reduce Motion the
 * check fading in. Pages left: how many are done. The session is saved as it
 * goes, and Back leaves it. When every page is done and a next revision day
 * exists, Keep going continues into its pages (#168). A session that was
 * recorded offers Listen back: the recording over its pages. After a good
 * moment, one quiet line asks for a rating (SESS-8, lib/rateAsk). In Ramadan, with the theme on (THEME-7), gold
 * falling light and lanterns take the confetti's place, a line says the day of the month, and once a Ramadan a card
 * marks the khatmah.
 */
export function SessionEndCard({
  total,
  done,
  celebrate,
  forDay,
  what,
  next,
  onKeepGoing,
  onListenBack,
  onRate,
  onDismissRate,
  newBadge,
}: {
  total: number;
  done: number;
  /** Goes up each time a swipe finished the session. */
  celebrate: number;
  /** The weekday of a day revised ahead ("Tue"); left out, today. */
  forDay?: string;
  /** What was revised, by surah or juz (lib/passages): "Al-Mujadila to At-Tahrim", "Juz 28". */
  what?: string;
  /**
   * The next revision day (Keep going): its weekday, its surahs and how many pages. `cycle`: it begins the
   * next cycle (AHEAD-3: revising ahead goes on past the cycle's end), named "Next cycle" for its weekday.
   */
  next?: { label: string; what?: string; pages: number; cycle?: boolean } | null;
  onKeepGoing?: () => void;
  /** The session was recorded: play it back over its pages. */
  onListenBack?: () => void;
  /** It's the moment to ask for a rating (lib/rateAsk): "Enjoying Revisely? Rate it ›" opens the store. */
  onRate?: () => void;
  /** The line's ✕: never ask again on this phone. */
  onDismissRate?: () => void;
  /** A badge this session won (ACCOUNT-6): one quiet row under the totals, this once. */
  newBadge?: Milestone | null;
}) {
  const { palette, isDark } = useTheme();
  const reduceMotion = useReduceMotion();
  const complete = total > 0 && done >= total;
  const ramadan = useRamadanEndCard(complete);
  const gold = ramadanV2(isDark, palette.accent);
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
      {ramadan.dressed ? (
        <EndCardDecor khatmah={ramadan.khatmah} />
      ) : complete ? (
        <Confetti trigger={celebrate} colors={colors} origin={{ x: 0.5, y: 0.38 }} />
      ) : null}
      <View style={styles.body} accessible accessibilityRole="summary" testID="session-end-summary">
        {complete ? (
          <Reanimated.View style={[styles.check, { borderColor: palette.done }, checkStyle]} testID="session-end-check">
            <Ionicons name="checkmark" size={34} color={palette.doneText} />
          </Reanimated.View>
        ) : null}
        <Text style={[typeV2.title, styles.center, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {complete ? t('revision.end.complete') : t('revision.end.progress', { done, total })}
        </Text>
        {complete && what ? (
          <Text style={[typeV2.body, styles.center, { color: palette.text }]} maxFontSizeMultiplier={1.4} testID="session-end-what">
            {what}
          </Text>
        ) : null}
        <Text style={[typeV2.body, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {complete
            ? forDay
              ? t('revision.end.revisedFor', { count: total, day: forDay })
              : t('revision.end.revisedToday', { count: total })
            : t('revision.end.swipeBack')}
        </Text>
        {ramadan.line ? (
          <View style={styles.ramadanLine} testID="session-end-ramadan">
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Crescent size={14} tokens={gold} />
            </View>
            <Text style={[typeV2.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {ramadan.line}
            </Text>
          </View>
        ) : null}
        {ramadan.khatmah ? (
          <View style={[styles.khatmah, { borderColor: gold.gold }]} testID="session-end-khatmah">
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Crescent size={28} tokens={gold} />
            </View>
            <Text style={[typeV2.name, styles.center, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
              {t('ramadan.khatmah.title')}
            </Text>
            <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {t('ramadan.khatmah.line')}
            </Text>
          </View>
        ) : null}
      </View>
      {complete && newBadge ? <NewBadgeRow milestone={newBadge} /> : null}
      {complete && next && onKeepGoing ? (
        <View style={styles.keep}>
          <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
            {[next.cycle ? t('revision.end.nextCycle') : t('revision.end.next', { day: next.label }), next.what, t('common.pages', { count: next.pages })]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <PillButton title={t('revision.end.keepGoing')} onPress={onKeepGoing} testID="session-end-keep-going" />
        </View>
      ) : null}
      {onListenBack ? (
        <PillButton
          title={t('revision.end.listenBack')}
          icon="headset-outline"
          variant="outline"
          onPress={onListenBack}
          testID="session-end-listen-back"
        />
      ) : null}
      {complete && onRate ? (
        <View style={styles.rate}>
          <Tap
            onPress={onRate}
            accessibilityRole="link"
            accessibilityLabel={t('revision.end.rateAskLabel')}
            hitSlop={8}
            testID="session-end-rate"
          >
            <Text style={[typeV2.meta, styles.center, { color: palette.link }]} maxFontSizeMultiplier={1.4}>
              {`${t('revision.end.rateAsk')} ${chevron()}`}
            </Text>
          </Tap>
          {onDismissRate ? (
            <Tap
              onPress={onDismissRate}
              accessibilityRole="button"
              accessibilityLabel={t('revision.end.rateAskDismiss')}
              hitSlop={12}
              testID="session-end-rate-dismiss"
            >
              <Ionicons name="close" size={16} color={palette.secondary} />
            </Tap>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 28 },
  body: { alignItems: 'center', gap: 8 },
  keep: { alignItems: 'center', gap: 12 },
  rate: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ramadanLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  khatmah: { alignItems: 'center', gap: 4, marginTop: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1 },
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
