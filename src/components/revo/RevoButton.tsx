import React, { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, I18nManager, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { useReduceMotion } from '../../design/motion';
import { dragPosition, dragTarget, positionSide, sidePosition, type RevoButtonSide } from '../../lib/revo/buttonSide';
import { REVO_BUTTON_GAP, REVO_BUTTON_SIZE } from '../../lib/revo/presence';
import { RevoMark } from './RevoMark';
import { t } from '../../i18n';

export { REVO_BUTTON_GAP, REVO_BUTTON_SIZE };
/** From the side of the screen, and above the tab bar (and the mini player). */
export const REVO_BUTTON_INSET = 16;
/** Its touch area reaches this far past the disc. */
export const REVO_BUTTON_SLOP = 8;
const DOT = 10;
const DOT_BORDER = 2;
/** A drag starts after this much sideways travel; less is a tap. */
const DRAG_AFTER = 8;
const SNAP = { damping: 24, stiffness: 260, mass: 1, overshootClamping: true } as const;
// `right` follows the language's direction, a transform and a finger's travel don't.
const DIR = I18nManager.isRTL ? -1 : 1;

/**
 * Revo's button: in a bottom corner of the main screens, above the content and below sheets. The R disc; dark adds a
 * lavender ring and an Indigo glow, light a soft shadow. A dot when a new Day in review is waiting. A press shrinks it a
 * little, with a light haptic. A sideways drag carries it, and it settles in the nearer corner, which is kept (REVO-41);
 * VoiceOver and TalkBack have an action for the same.
 */
export function RevoButton({
  bottom,
  dot,
  onPress,
  side,
  onSide,
}: {
  bottom: number;
  dot: boolean;
  onPress: () => void;
  side: RevoButtonSide;
  onSide: (side: RevoButtonSide) => void;
}) {
  const { palette, isDark } = useTheme();
  const haptics = useHaptics();
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const travel = Math.max(0, width - 2 * REVO_BUTTON_INSET - REVO_BUTTON_SIZE);

  const position = useSharedValue<number>(sidePosition(side));
  const from = useSharedValue(0);
  const span = useSharedValue(travel);
  const lifted = useSharedValue(0);
  const still = useSharedValue(reduceMotion);
  useEffect(() => {
    span.value = travel;
    still.value = reduceMotion;
  }, [travel, reduceMotion, span, still]);

  // A side set from outside the drag (the accessibility action): the button goes there.
  const shownSide = useRef(side);
  useEffect(() => {
    if (shownSide.current === side) return;
    shownSide.current = side;
    const to = sidePosition(side);
    position.value = reduceMotion ? to : withSpring(to, SNAP);
  }, [side, reduceMotion, position]);

  const latest = useRef({ side, onSide, haptics });
  latest.current = { side, onSide, haptics };
  const settle = useMemo(
    () => (to: 0 | 1) => {
      const next = positionSide(to);
      shownSide.current = next;
      if (next === latest.current.side) return;
      latest.current.haptics.selection();
      latest.current.onSide(next);
    },
    [],
  );

  // Whether this touch became a drag: its end is not a tap.
  const dragged = useRef(false);
  const markDragged = useMemo(
    () => (on: boolean) => {
      dragged.current = on;
    },
    [],
  );

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-DRAG_AFTER, DRAG_AFTER])
        .hitSlop(REVO_BUTTON_SLOP)
        .onBegin(() => {
          runOnJS(markDragged)(false);
        })
        .onStart(() => {
          runOnJS(markDragged)(true);
          from.value = position.value;
          lifted.value = 1;
        })
        .onUpdate((e) => {
          position.value = dragPosition(from.value, e.translationX, span.value, DIR);
        })
        .onEnd((e) => {
          const released = dragPosition(from.value, e.translationX, span.value, DIR);
          const to = dragTarget(released, e.velocityX, span.value, DIR);
          position.value = still.value ? to : withSpring(to, SNAP);
          runOnJS(settle)(to);
        })
        .onFinalize(() => {
          lifted.value = 0;
        })
        .withTestId('revo-button-drag'),
    [settle, markDragged, from, position, lifted, span, still],
  );

  const place = useAnimatedStyle(() => ({
    transform: [{ translateX: -DIR * position.value * span.value }, { scale: lifted.value ? 1.08 : 1 }],
  }));

  // In the accent: a glow in dark, a shadow in light.
  const lift = isDark
    ? { shadowColor: palette.revo.glow, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }
    : { shadowColor: palette.revo.shadow, shadowOpacity: 0.28, shadowRadius: 9, shadowOffset: { width: 0, height: 6 } };

  const other: RevoButtonSide = side === 'right' ? 'left' : 'right';
  const moveLabel = other === 'left' ? t('revo.button.moveLeft') : t('revo.button.moveRight');
  const moveByAction = () => {
    onSide(other);
    AccessibilityInfo.announceForAccessibility(other === 'left' ? t('revo.button.movedLeft') : t('revo.button.movedRight'));
  };

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom }, place]}>
      <GestureDetector gesture={drag}>
        <View collapsable={false}>
          <Pressable
            onPress={() => {
              // The end of a drag is not a tap.
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              haptics.light();
              onPress();
            }}
            hitSlop={REVO_BUTTON_SLOP}
            accessibilityRole="button"
            accessibilityLabel={dot ? t('revo.button.newReview') : t('revo.revo')}
            accessibilityHint={t('revo.button.hint')}
            accessibilityActions={[{ name: 'activate' }, { name: 'moveSide', label: moveLabel }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'moveSide') moveByAction();
              else if (e.nativeEvent.actionName === 'activate') onPress();
            }}
            style={({ pressed }) => [styles.button, lift, Platform.OS === 'android' && styles.elevation, pressed && styles.pressed]}
            testID="revo-button"
          >
            <RevoMark size={REVO_BUTTON_SIZE} ring={isDark} />
            {dot ? (
              <View
                style={[styles.dot, { backgroundColor: palette.primary, borderColor: palette.bg }]}
                testID="revo-button-dot"
              />
            ) : null}
          </Pressable>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: REVO_BUTTON_INSET },
  button: { width: REVO_BUTTON_SIZE, height: REVO_BUTTON_SIZE, borderRadius: REVO_BUTTON_SIZE / 2 },
  elevation: { elevation: 8 },
  pressed: { transform: [{ scale: 0.94 }] },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: DOT + DOT_BORDER * 2,
    height: DOT + DOT_BORDER * 2,
    borderRadius: DOT / 2 + DOT_BORDER,
    borderWidth: DOT_BORDER,
  },
});
