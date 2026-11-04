import React, { useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { runOnJS } from "react-native-reanimated";
import { useTheme } from "../../context/ThemeContext";
import { useHaptics } from "../../design/haptics";
import { typeV2 } from "../../theme/v2";

/** The width of the red action a row slides open. */
export const SWIPE_ACTION_WIDTH = 84;
/** How long a finger rests before the row's menu opens (iOS's own is about this). */
const HOLD_MS = 450;

export type RowAction = { name: string; label: string; onPress: () => void };

/**
 * A list row that opens two ways, as in iMessage: a press and hold calls
 * `onHold` (the row's menu), and a swipe to the left slides the row over a red
 * `Delete` action. The swipe is gesture handler's swipeable on Reanimated, so
 * the row follows the finger on the UI thread, resists past the action, and
 * snaps open or shut on release, with a tick as it reaches the action. Tapping
 * the action calls `onDelete`; a tap on an open row closes it. VoiceOver gets
 * `actions` in place of the gestures.
 */
export function SwipeRow({
  children,
  onDelete,
  onHold,
  deleteLabel = "Delete",
  actions = [],
  accessibilityLabel,
  accessible = true,
  testID,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  onHold: () => void;
  deleteLabel?: string;
  /** Extra VoiceOver actions on the row (the menu's actions are added for it). */
  actions?: RowAction[];
  accessibilityLabel?: string;
  /** Off when the row holds its own buttons (they need VoiceOver's focus); the
   *  caller then offers Delete and the menu from one of its own elements. */
  accessible?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const swipeRef = useRef<SwipeableMethods>(null);
  // Kept from the swipe's own events, so a hold on an open row does nothing.
  const openRef = useRef(false);

  const gesture = useMemo(() => {
    const openMenu = () => {
      if (!openRef.current) onHold();
    };
    const hold = Gesture.LongPress()
      .minDuration(HOLD_MS)
      .maxDistance(10)
      .onStart(() => {
        runOnJS(openMenu)();
      });
    // A tap on an open row closes it; on a closed row it does nothing.
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onEnd((_e, success) => {
        if (success) runOnJS(closeRow)();
      });
    return Gesture.Race(hold, tap);

    function closeRow() {
      swipeRef.current?.close();
    }
  }, [onHold]);

  const a11yActions = [
    ...actions.map((a) => ({ name: a.name, label: a.label })),
    { name: "delete", label: deleteLabel },
  ];
  const onAccessibilityAction = (event: {
    nativeEvent: { actionName: string };
  }) => {
    const { actionName } = event.nativeEvent;
    if (actionName === "delete") return onDelete();
    actions.find((a) => a.name === actionName)?.onPress();
  };

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={SWIPE_ACTION_WIDTH / 2}
      overshootRight={false}
      activeOffsetX={[-12, 12]}
      failOffsetY={[-10, 10]}
      onSwipeableWillOpen={() => haptics.selection()}
      onSwipeableOpen={() => {
        openRef.current = true;
      }}
      onSwipeableClose={() => {
        openRef.current = false;
      }}
      renderRightActions={() => (
        <View style={[styles.action, { backgroundColor: palette.redFill }]}>
          <Pressable
            onPress={() => {
              swipeRef.current?.close();
              onDelete();
            }}
            accessibilityRole="button"
            accessibilityLabel={deleteLabel}
            style={styles.actionInner}
            testID={testID ? `${testID}-delete` : undefined}
          >
            <Ionicons name="trash-outline" size={22} color={palette.onRedFill} />
            <Text style={[typeV2.meta, { color: palette.onRedFill }]}>
              {deleteLabel}
            </Text>
          </Pressable>
        </View>
      )}
    >
      <GestureDetector gesture={gesture}>
        <View
          style={{ backgroundColor: palette.bg }}
          testID={testID}
          accessible={accessible}
          accessibilityLabel={accessible ? accessibilityLabel : undefined}
          accessibilityActions={accessible ? a11yActions : undefined}
          onAccessibilityAction={accessible ? onAccessibilityAction : undefined}
        >
          {children}
        </View>
      </GestureDetector>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  actionInner: {
    width: SWIPE_ACTION_WIDTH,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
});
