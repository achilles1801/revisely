import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { useReduceMotion } from '../../design/motion';
import { arabicFullV2, layoutV2, typeV2 } from '../../theme/v2';
import { Confetti } from '../v2/Confetti';
import { t } from '../../i18n';

/** How long the note stays, its fades included. */
export const HASBUK_MS = 2200;
const FADE_IN = 220;
const FADE_OUT = 320;

/**
 * "Hasbuk" as a spot test reaches its end (RECITE-8; Majd, Nov 23 2026: "we say hasbuk when they finish so there should
 * be some subtle confetti like popup"). A small note above the take's bar with a few pieces of confetti: it takes no
 * touches and goes by itself. With Reduce Motion it only fades. A screen reader is told by the layer.
 */
export function HasbukNote({ trigger, bottom }: { trigger: number; bottom: number }) {
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
    shown.value = 0;
    shown.value = withSequence(
      withTiming(1, { duration: FADE_IN }),
      withDelay(HASBUK_MS - FADE_IN - FADE_OUT, withTiming(0, { duration: FADE_OUT })),
    );
    const done = setTimeout(() => setShownFor(0), HASBUK_MS);
    return () => clearTimeout(done);
    // Only when a test reaches its end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const noteStyle = useAnimatedStyle(() =>
    reduceMotion ? { opacity: shown.value } : { opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 6 }] },
  );

  if (trigger <= 0 || shownFor !== trigger) return null;
  const word: string = t('reciteLive.test.hasbukWord');
  const latin: string = t('reciteLive.test.hasbuk');
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { bottom }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="hasbuk"
    >
      <View style={styles.burst}>
        <Confetti trigger={trigger} colors={colors} count={14} reach={0.36} origin={{ x: 0.5, y: 0.72 }} />
      </View>
      <Reanimated.View
        style={[styles.note, { backgroundColor: palette.bubble, borderColor: palette.separator }, noteStyle]}
      >
        <Text style={[arabicFullV2(20), { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {word}
        </Text>
        {latin !== word ? (
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
            {latin}
          </Text>
        ) : null}
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  burst: { position: 'absolute', bottom: 0, width: 240, height: 130 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: layoutV2.hairline,
  },
});
