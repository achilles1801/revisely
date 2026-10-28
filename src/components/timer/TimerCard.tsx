import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { layoutV2 } from '../../theme/v2';
import { Backdrop } from '../Backdrop';
import { shouldDismiss } from '../v2/Sheet';
import { alertSessionSaved } from './sessionSavedAlert';
import { TimerControls } from './TimerControls';

/** Where the card grows from and shrinks back to: the chip that opened it, on screen. */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MARGIN = 12;
const MAX_WIDTH = 420;
const RADIUS = 28;
const OPEN = { damping: 22, stiffness: 240, mass: 0.9 };
const CLOSE = { duration: 220, easing: Easing.inOut(Easing.cubic) };

/**
 * The timer's controls in a card that grows out of the chip that was tapped:
 * the bubble widens and rises into a rounded card in the bottom-right corner,
 * its controls fading in as it lands, and shrinks back into the chip when
 * closed (a tap outside, a drag down, or VoiceOver's escape). With Reduce
 * Motion it simply fades. While a length is typed it rises above the keyboard.
 */
export function TimerCard({
  visible,
  origin,
  onClose,
  onHidden,
  onOpenQuran,
}: {
  visible: boolean;
  origin: Frame | null;
  onClose: () => void;
  /** Gone (after shrinking back): the chip shows again. */
  onHidden?: () => void;
  /** "Open the Quran" in the controls; omitted where the Quran is already open. */
  onOpenQuran?: () => void;
}) {
  const { palette, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const keyboard = useAnimatedKeyboard();

  const [shown, setShown] = useState(visible);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const [measured, setMeasured] = useState(false);

  const width = Math.min(screen.width - MARGIN * 2, MAX_WIDTH);
  const left = screen.width - MARGIN - width;
  const bottom = Math.max(insets.bottom, MARGIN) + 4;
  // No chip measured (it never is in tests): grow from the corner.
  const from = origin ?? { x: screen.width - MARGIN - 44, y: screen.height - bottom - 44, width: 44, height: 44 };

  const hiddenRef = useRef(onHidden);
  hiddenRef.current = onHidden;
  const finishHide = useCallback(() => {
    setShown(false);
    setMeasured(false);
    hiddenRef.current?.();
  }, []);

  useEffect(() => {
    if (visible) {
      drag.value = 0;
      setShown(true);
      return;
    }
    if (!shown) return;
    progress.value = withTiming(0, reduceMotion ? { duration: 140 } : CLOSE, (done) => {
      if (done) runOnJS(finishHide)();
    });
    drag.value = withTiming(0, CLOSE);
    // Only when visibility changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Grows once its controls have been laid out (their height is the card's).
  useEffect(() => {
    if (!visible || !measured) return;
    progress.value = reduceMotion ? withTiming(1, { duration: 160 }) : withSpring(1, OPEN);
  }, [visible, measured, reduceMotion, progress]);

  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    // After it has opened, a change of content (Stopwatch → Timer, started)
    // eases the card to its new height.
    contentHeight.value = measured ? withTiming(h, { duration: 180 }) : h;
    if (!measured) setMeasured(true);
  };

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dragClose = useCallback(() => closeRef.current(), []);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
          drag.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          if (shouldDismiss(e.translationY, e.velocityY, contentHeight.value)) runOnJS(dragClose)();
          else drag.value = withSpring(0, { damping: 24, stiffness: 300 });
        })
        .withTestId('timer-card-drag'),
    [drag, contentHeight, dragClose],
  );

  const startColor = palette.fill;
  const card = useAnimatedStyle(() => {
    const p = progress.value;
    const h1 = contentHeight.value;
    // Above the keyboard while a length is typed.
    const lift = Math.max(0, keyboard.height.value - bottom + 12);
    const top1 = screen.height - bottom - h1 - lift;
    if (reduceMotion) {
      return {
        left,
        top: top1 + drag.value,
        width,
        height: h1,
        borderRadius: RADIUS,
        opacity: p,
        backgroundColor: palette.sheet,
      };
    }
    return {
      left: interpolate(p, [0, 1], [from.x, left]),
      top: interpolate(p, [0, 1], [from.y, top1]) + drag.value,
      width: interpolate(p, [0, 1], [from.width, width]),
      height: interpolate(p, [0, 1], [from.height, h1]),
      borderRadius: interpolate(p, [0, 1], [from.height / 2, RADIUS]),
      opacity: interpolate(p, [0, 0.08], [0, 1], 'clamp'),
      backgroundColor: interpolateColor(p, [0, 0.5], [startColor, palette.sheet]),
    };
  });
  // The chip's stopwatch, there while it is still a bubble.
  const bubbleIcon = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : interpolate(progress.value, [0, 0.25], [1, 0], 'clamp'),
  }));
  // The controls arrive as the card lands.
  const content = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : interpolate(progress.value, [0.55, 1], [0, 1], 'clamp'),
  }));

  if (!shown) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Backdrop onPress={onClose} label="Close timer" />
        <GestureDetector gesture={pan}>
          <Reanimated.View
            style={[
              styles.card,
              {
                borderColor: palette.outline,
                shadowColor: palette.shadow,
                shadowOpacity: isDark ? 0 : 0.16,
              },
              card,
            ]}
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            testID="timer-card"
          >
            <Reanimated.View pointerEvents="none" style={[styles.bubble, bubbleIcon]}>
              <Ionicons name="stopwatch-outline" size={22} color={palette.text} />
            </Reanimated.View>
            {/* Laid out at the card's full width from the start, so its height is known. */}
            <Reanimated.View style={[styles.content, { width }, content]} onLayout={onContentLayout}>
              <View
                style={styles.grabber}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Close"
                accessibilityHint="Closes the timer"
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={onClose}
                testID="timer-card-handle"
              >
                <View style={[styles.handle, { backgroundColor: palette.handle }]} />
              </View>
              <TimerControls
                visible={visible}
                onClose={onClose}
                onSaved={(date, seconds) => alertSessionSaved(date, seconds)}
                onOpenQuran={onOpenQuran}
              />
            </Reanimated.View>
          </Reanimated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 28,
    elevation: 12,
  },
  bubble: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  content: {
    position: 'absolute',
    left: 0,
    top: 0,
    paddingHorizontal: layoutV2.gutter + 4,
    paddingBottom: 18,
  },
  grabber: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 36, height: 5, borderRadius: 3 },
});
