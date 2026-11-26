import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { useReduceMotion } from '../../design/motion';
import { arabicFullV2, typeV2 } from '../../theme/v2';
import { Confetti } from '../v2/Confetti';
import { t } from '../../i18n';

/** How long it stays, its fades included. */
export const HASBUK_MS = 2500;
/** An E2E build holds it long enough for the flow's screenshot (flow 18, rl08c). */
const SHOWN_MS = process.env.EXPO_PUBLIC_E2E === '1' ? 8000 : HASBUK_MS;
const FADE_IN = 220;
const FADE_OUT = 360;
/** How far the page fades behind the word. */
const FADE_PAGE = 0.84;

/**
 * "Hasbuk" as a spot test reaches its end (RECITE-8; Majd, Nov 25 2026, option B of the boards: "option B the word for
 * hasbuk", after "it'd be better if it popped up on the center of the screen and was more prominent"). The page fades
 * and the word itself fills the middle, in the accent, with confetti around it; it takes no touches, the bar stays as
 * it is, and it goes by itself. With Reduce Motion it only fades. A screen reader is told by the layer.
 */
export function HasbukNote({ trigger, top, bottom }: { trigger: number; top: number; bottom: number }) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const reduceMotion = useReduceMotion();
  const [shownFor, setShownFor] = useState(0);
  const shown = useSharedValue(0);
  const colors = useMemo(() => [palette.done, palette.heat[2], palette.heat[3], palette.heat[4]], [palette]);

  useEffect(() => {
    if (trigger <= 0) return;
    setShownFor(trigger);
    haptics.success();
    // A fade is what Reduce Motion asks for, so it always runs: left to the system's setting, a sequence jumps straight
    // to its last value, 0, and the word is never seen (Android with animations off, flow 18).
    shown.value = 0;
    shown.value = withTiming(1, { duration: FADE_IN, reduceMotion: ReduceMotion.Never });
    const fade = setTimeout(() => {
      shown.value = withTiming(0, { duration: FADE_OUT, reduceMotion: ReduceMotion.Never });
    }, SHOWN_MS - FADE_OUT);
    const done = setTimeout(() => setShownFor(0), SHOWN_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
    // Only when a test reaches its end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const pageStyle = useAnimatedStyle(() => ({ opacity: shown.value * FADE_PAGE }));
  const wordStyle = useAnimatedStyle(() =>
    reduceMotion ? { opacity: shown.value } : { opacity: shown.value, transform: [{ scale: 0.92 + 0.08 * shown.value }] },
  );

  if (trigger <= 0 || shownFor !== trigger) return null;
  const word: string = t('reciteLive.test.hasbukWord');
  const latin: string = t('reciteLive.test.hasbuk');
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top, bottom }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="hasbuk"
    >
      <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }, pageStyle]} testID="hasbuk-fade" />
      <View style={styles.burst}>
        <Confetti trigger={trigger} colors={colors} count={44} reach={0.8} origin={{ x: 0.5, y: 0.5 }} />
      </View>
      <Reanimated.View style={[styles.word, wordStyle]}>
        <Text style={[arabicFullV2(88), { color: palette.accentText }]} maxFontSizeMultiplier={1.2}>
          {word}
        </Text>
        {latin !== word ? (
          <Text style={[typeV2.name, styles.latin, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
            {latin}
          </Text>
        ) : null}
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  burst: { ...StyleSheet.absoluteFillObject },
  word: { alignItems: 'center' },
  latin: { fontSize: 17, lineHeight: 22, marginTop: -18 },
});
