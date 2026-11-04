import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';

/** The width of the red action a row slides open. */
export const SWIPE_ACTION_WIDTH = 84;
const SPRING = { damping: 22, stiffness: 240 };
/** How long a finger rests before the row's menu opens (iOS's own is about this). */
const HOLD_MS = 450;

export type RowAction = { name: string; label: string; onPress: () => void };

/**
 * A list row that opens two ways, as in iMessage: a press and hold calls
 * `onHold` (the row's menu), and a swipe to the left slides the row over a red
 * `Delete` action. Tapping the action calls `onDelete`; a tap on the row or a
 * swipe back closes it. VoiceOver gets `actions` in place of the gestures.
 */
export function SwipeRow({
  children,
  onDelete,
  onHold,
  deleteLabel = 'Delete',
  actions = [],
  accessibilityLabel,
  testID,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  onHold: () => void;
  deleteLabel?: string;
  /** Extra VoiceOver actions on the row (the menu's actions are added for it). */
  actions?: RowAction[];
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  // 0 closed; -SWIPE_ACTION_WIDTH open. `start` is where the current drag began.
  const x = useSharedValue(0);
  const start = useSharedValue(0);

  const gesture = useMemo(() => {
    const swipe = Gesture.Pan()
      // Only a swipe to the left (or back, when open) moves the row: a swipe
      // right stays the screen's back gesture.
      .activeOffsetX([-12, 12])
      .failOffsetY([-10, 10])
      .onStart(() => {
        start.value = x.value;
      })
      .onUpdate((e) => {
        x.value = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, start.value + e.translationX));
      })
      .onEnd((e) => {
        const open = x.value < -SWIPE_ACTION_WIDTH / 2 || (e.velocityX < -500 && x.value < 0);
        x.value = withSpring(open ? -SWIPE_ACTION_WIDTH : 0, SPRING);
      });

    const hold = Gesture.LongPress()
      .minDuration(HOLD_MS)
      .maxDistance(10)
      .onStart(() => {
        if (x.value !== 0) return;
        runOnJS(onHold)();
      });

    // A tap on the row, while it is open, closes it.
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onEnd((_e, success) => {
        if (!success || x.value === 0) return;
        x.value = withSpring(0, SPRING);
      });

    return Gesture.Race(swipe, hold, tap);
  }, [x, start, onHold]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const close = () => {
    x.value = withSpring(0, SPRING);
  };
  const a11yActions = [
    ...actions.map((a) => ({ name: a.name, label: a.label })),
    { name: 'delete', label: deleteLabel },
  ];
  const onAccessibilityAction = (event: { nativeEvent: { actionName: string } }) => {
    const { actionName } = event.nativeEvent;
    if (actionName === 'delete') return onDelete();
    actions.find((a) => a.name === actionName)?.onPress();
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.action, { backgroundColor: palette.redFill }]}>
        <Pressable
          onPress={() => {
            close();
            onDelete();
          }}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          style={styles.actionInner}
          testID={testID ? `${testID}-delete` : undefined}
        >
          <Ionicons name="trash-outline" size={22} color={palette.onRedFill} />
          <Text style={[typeV2.meta, { color: palette.onRedFill }]}>{deleteLabel}</Text>
        </Pressable>
      </View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.row, { backgroundColor: palette.bg }, rowStyle]}
          testID={testID}
          accessible
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={a11yActions}
          onAccessibilityAction={onAccessibilityAction}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  action: { ...StyleSheet.absoluteFillObject, alignItems: 'flex-end', justifyContent: 'center' },
  actionInner: {
    width: SWIPE_ACTION_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  row: {},
});
