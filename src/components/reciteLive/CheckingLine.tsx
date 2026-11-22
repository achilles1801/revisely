// The bar's progress line after Stop, while the checker's final answer comes (Revisely Dev, RECITE-25): a thin bar
// along the capsule's lower edge, as Safari shows a page loading in its address bar. Nothing shows for a short wait;
// once the answer is in, the line fills and fades. Its way is lib/reciteLive/checkingProgress's.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, I18nManager, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { t } from '../../i18n';
import { checkingSegments, FADE_MS, FILL_MS, SHOW_AFTER_MS } from '../../lib/reciteLive/checkingProgress';
import { say, useScreenReaderOn } from './a11y';
import { CAPSULE_HEIGHT } from '../reader/PlayerCapsule';

/** The line's thickness (pt). */
const LINE = 2.5;
/** The line moves on the UI thread; Jest has no native driver, so there it moves in JS, where a test can see it. */
const NATIVE = process.env.NODE_ENV !== 'test';

export function CheckingLine({
  checking,
  expectedMs,
  budgetMs,
}: {
  /** Stop was tapped and the final answer hasn't come. */
  checking: boolean;
  /** When the answer is expected, from Stop (ms). Read when the wait starts. */
  expectedMs: number;
  /** When the take's result shows whatever the checker has done (Stop's budget, ms). */
  budgetMs: number;
}) {
  const { palette } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const screenReader = useScreenReaderOn();
  const reduceMotion = useReduceMotion();
  // Read when the wait starts, so a re-render mid-wait never restarts the line.
  const now = useRef({ expectedMs, budgetMs, screenReader, reduceMotion });
  now.current = { expectedMs, budgetMs, screenReader, reduceMotion };

  useEffect(() => {
    if (!checking) return;
    const { expectedMs: expected, budgetMs: budget } = now.current;
    progress.setValue(0);
    opacity.setValue(0);
    let shown = false;
    const way = Animated.sequence(
      checkingSegments(expected, budget).map((s) =>
        Animated.timing(progress, {
          toValue: s.to,
          duration: s.ms,
          easing: s.ease === 'out' ? Easing.out(Easing.quad) : Easing.linear,
          useNativeDriver: NATIVE,
        }),
      ),
    );
    way.start();
    const show = setTimeout(() => {
      shown = true;
      Animated.timing(opacity, { toValue: 1, duration: now.current.reduceMotion ? 0 : 200, useNativeDriver: NATIVE }).start();
      // Said once, and only for a wait long enough to show the line (the microphone is already off).
      if (now.current.screenReader) say(t('reciteLive.bar.checking'));
    }, SHOW_AFTER_MS);
    return () => {
      clearTimeout(show);
      way.stop();
      if (!shown) {
        opacity.setValue(0);
        progress.setValue(0);
        return;
      }
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: FILL_MS, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(opacity, { toValue: 0, duration: now.current.reduceMotion ? 0 : FADE_MS, useNativeDriver: NATIVE }),
      ]).start(({ finished }) => {
        if (finished) progress.setValue(0);
      });
    };
  }, [checking, progress, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.track, { backgroundColor: palette.separator, opacity }]}
      testID="recite-checking-line"
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: palette.primary,
            // The line grows from the start edge: the left, or the right in Arabic.
            transformOrigin: I18nManager.isRTL ? 'right' : 'left',
            transform: [{ scaleX: progress }],
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Along the capsule's flat lower edge, clear of its rounded ends.
  track: {
    position: 'absolute',
    bottom: 1,
    start: CAPSULE_HEIGHT / 2,
    end: CAPSULE_HEIGHT / 2,
    height: LINE,
    borderRadius: LINE / 2,
    overflow: 'hidden',
  },
  fill: { flex: 1, borderRadius: LINE / 2 },
});
