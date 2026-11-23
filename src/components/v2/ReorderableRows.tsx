import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityActionEvent, AccessibilityInfo, AccessibilityRole, AccessibilityState, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  measure,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { autoScrollStep, moveSlot, slotAt } from '../../lib/reorder';
import type { ScrollLink } from '../plan/ReorderableDayList';
import { layoutV2, radiusV2 } from '../../theme/v2';
import { t } from '../../i18n';

/** Before the rows are measured. */
const MIN_ROW = 52;
/** As the schedule's days (ReorderableDayList): hold this long, still, to lift a row. */
const LIFT_AFTER_MS = 350;
const SPRING = { damping: 24, stiffness: 280, mass: 0.9 };
/** How far a tapped row dims (v2/Tap's 0.55). */
const PRESS_DIM = 0.45;

export interface RowAccessibility {
  /** What VoiceOver reads for the row. */
  label: string;
  role?: AccessibilityRole;
  state?: AccessibilityState;
  hint?: string;
  /** The row's own actions (e.g. `activate`); Move up and Move down are added. */
  actions?: { name: string; label?: string }[];
  onAction?: (name: string) => void;
}

/**
 * Rows the user puts in another order: touch and hold one (350 ms, still) to lift it, drag it, let go to drop it
 * there; the rows in between make room, and the list scrolls near the edges. Moving the finger first scrolls as
 * usual. VoiceOver gets Move up and Move down instead, and says where the row went.
 *
 * The schedule's days do the same (ReorderableDayList, whose dates stay put); this is the plain list: one height for
 * every row (the tallest), a hairline between rows, the lifted row on the quiet fill with an edge (no shadow). The
 * parent owns the order: `onMove(from, to)` asks for it, and `rows` brings it back.
 */
export function ReorderableRows<R>({
  rows,
  keyOf,
  renderRow,
  accessibility,
  onPress,
  scroll,
  onMove,
  onDragChange,
  inset = layoutV2.gutter,
  testID = 'rows',
}: {
  rows: R[];
  keyOf: (row: R) => string;
  renderRow: (row: R, index: number) => React.ReactNode;
  accessibility: (row: R, index: number) => RowAccessibility;
  /** A tap on the row (a switch's row: the switch drawn in it is only its picture, so a tap anywhere flips it). */
  onPress?: (row: R, index: number) => void;
  scroll: ScrollLink;
  onMove: (from: number, to: number) => void;
  /** True while a row is lifted: the parent stops its scroll view scrolling by touch. */
  onDragChange?: (dragging: boolean) => void;
  /** Where the hairlines between rows start. */
  inset?: number;
  testID?: string;
}) {
  const haptics = useHaptics();
  const keys = rows.map(keyOf);
  const count = rows.length;

  const [heights, setHeights] = useState<Record<string, number>>({});
  const rowHeight = Math.max(MIN_ROW, ...keys.map((k) => heights[k] ?? 0));
  const reportHeight = useCallback((key: string, h: number) => {
    setHeights((prev) => (Math.abs((prev[key] ?? 0) - h) < 0.5 ? prev : { ...prev, [key]: h }));
  }, []);
  const [raised, setRaised] = useState<string | null>(null);

  const positions = useSharedValue<Record<string, number>>({});
  const activeId = useSharedValue('');
  const fromSlot = useSharedValue(0);
  const startTop = useSharedValue(0);
  const dragTop = useSharedValue(0);
  const transY = useSharedValue(0);
  const fingerY = useSharedValue(0);
  const startScroll = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const viewTop = useSharedValue(0);
  const viewBottom = useSharedValue(0);
  const maxScroll = useSharedValue(0);
  const rowH = useSharedValue(rowHeight);
  const n = useSharedValue(count);

  const keyString = keys.join('|');
  useEffect(() => {
    const next: Record<string, number> = {};
    keyString.split('|').forEach((k, i) => {
      next[k] = i;
    });
    positions.value = next;
  }, [keyString, positions]);
  useEffect(() => {
    rowH.value = rowHeight;
  }, [rowHeight, rowH]);
  useEffect(() => {
    n.value = count;
  }, [count, n]);

  const latest = useRef({ onMove, onDragChange, haptics, keys });
  latest.current = { onMove, onDragChange, haptics, keys };

  const onTick = useCallback(() => latest.current.haptics.selection(), []);

  const follow = useCallback(() => {
    'worklet';
    const id = activeId.value;
    if (id === '') return;
    const h = rowH.value;
    const top = Math.max(0, Math.min((n.value - 1) * h, startTop.value + transY.value + scrollY.value - startScroll.value));
    dragTop.value = top;
    const slot = slotAt(top, h, n.value);
    if (positions.value[id] !== slot) {
      positions.value = moveSlot(positions.value, id, slot);
      runOnJS(onTick)();
    }
  }, [activeId, rowH, n, startTop, transY, scrollY, startScroll, dragTop, positions, onTick]);

  // Near an edge of the visible area, scroll on every frame, even with the finger still.
  const frame = useFrameCallback(() => {
    'worklet';
    if (activeId.value === '') return;
    const step = autoScrollStep(fingerY.value, viewTop.value, viewBottom.value);
    if (step !== 0) {
      const next = Math.max(0, Math.min(Math.max(0, maxScroll.value), scrollY.value + step));
      if (next !== scrollY.value) {
        scrollY.value = next;
        scrollTo(scroll.ref, 0, next, false);
      }
    }
    follow();
  }, false);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const onLift = useCallback((key: string) => {
    setRaised(key);
    latest.current.haptics.impact();
    frameRef.current.setActive(true);
    latest.current.onDragChange?.(true);
  }, []);
  const onDrop = useCallback((key: string, from: number, to: number) => {
    frameRef.current.setActive(false);
    latest.current.onDragChange?.(false);
    if (from !== to && latest.current.keys.indexOf(key) === from) latest.current.onMove(from, to);
  }, []);

  const scrollRef = scroll.ref;
  const scrollOffset = scroll.offset;
  const contentHeight = scroll.contentHeight;
  const handlers = useMemo<Handlers>(() => {
    const lift = (id: string) => {
      'worklet';
      const slot = positions.value[id] ?? 0;
      activeId.value = id;
      fromSlot.value = slot;
      startTop.value = slot * rowH.value;
      dragTop.value = startTop.value;
      transY.value = 0;
      startScroll.value = scrollOffset.value;
      scrollY.value = scrollOffset.value;
      const m = measure(scrollRef);
      if (m) {
        viewTop.value = m.pageY;
        viewBottom.value = m.pageY + m.height;
        maxScroll.value = contentHeight.value - m.height;
      } else {
        viewTop.value = 0;
        viewBottom.value = 0;
      }
      runOnJS(onLift)(id);
    };
    const drag = (translationY: number, absoluteY: number) => {
      'worklet';
      transY.value = translationY;
      fingerY.value = absoluteY;
      follow();
    };
    const drop = (id: string) => {
      'worklet';
      if (activeId.value !== id) return;
      const to = positions.value[id] ?? fromSlot.value;
      activeId.value = '';
      runOnJS(onDrop)(id, fromSlot.value, to);
    };
    return { lift, drag, drop };
  }, [positions, activeId, fromSlot, startTop, rowH, dragTop, transY, startScroll, scrollY, scrollOffset, scrollRef, viewTop, viewBottom, maxScroll, contentHeight, fingerY, follow, onLift, onDrop]);

  // VoiceOver: the same moves without dragging, and where the row went.
  const a11yMove = useCallback((from: number, to: number, what: string) => {
    if (to < 0 || to >= latest.current.keys.length || to === from) return;
    latest.current.onMove(from, to);
    latest.current.haptics.selection();
    AccessibilityInfo.announceForAccessibility(t('v2.movedTo', { what, place: to + 1, count: latest.current.keys.length }));
  }, []);

  const { palette } = useTheme();
  return (
    <View style={[styles.list, { height: count * rowHeight }]} testID={testID}>
      {/* The hairlines between rows stay where they are; the rows move over them. */}
      {keys.slice(0, -1).map((k, i) => (
        <View
          key={`line-${i}`}
          pointerEvents="none"
          style={[styles.line, { top: (i + 1) * rowHeight - layoutV2.hairline, left: inset, backgroundColor: palette.separator }]}
        />
      ))}
      {rows.map((row, i) => (
        <Item
          key={keys[i]}
          id={keys[i]}
          index={i}
          count={count}
          height={rowHeight}
          raised={raised === keys[i]}
          shared={{ positions, activeId, dragTop, rowH }}
          handlers={handlers}
          onMeasure={reportHeight}
          a11y={accessibility(row, i)}
          onA11yMove={a11yMove}
          onPress={onPress ? () => onPress(row, i) : undefined}
          testID={testID}
        >
          {renderRow(row, i)}
        </Item>
      ))}
    </View>
  );
}

interface Handlers {
  lift: (id: string) => void;
  drag: (translationY: number, absoluteY: number) => void;
  drop: (id: string) => void;
}

interface Shared {
  positions: SharedValue<Record<string, number>>;
  activeId: SharedValue<string>;
  dragTop: SharedValue<number>;
  rowH: SharedValue<number>;
}

function Item({
  id,
  index,
  count,
  height,
  raised,
  shared,
  handlers,
  onMeasure,
  a11y,
  onA11yMove,
  onPress,
  testID,
  children,
}: {
  id: string;
  index: number;
  count: number;
  height: number;
  raised: boolean;
  shared: Shared;
  handlers: Handlers;
  onMeasure: (key: string, h: number) => void;
  a11y: RowAccessibility;
  onA11yMove: (from: number, to: number, what: string) => void;
  onPress?: () => void;
  testID: string;
  children: React.ReactNode;
}) {
  const { palette } = useTheme();
  const { positions, activeId, dragTop, rowH } = shared;
  const y = useSharedValue(index * height);
  const hasPress = onPress != null;

  // Follow the finger while lifted; otherwise glide to this row's slot.
  useAnimatedReaction(
    () => ({
      active: activeId.value === id,
      y: activeId.value === id ? dragTop.value : (positions.value[id] ?? index) * rowH.value,
      h: rowH.value,
    }),
    (cur, prev) => {
      if (cur.active || prev === null || cur.h !== prev.h) y.value = cur.y;
      else if (prev.active || cur.y !== prev.y) y.value = withSpring(cur.y, SPRING);
    },
    [id, index],
  );

  // Ids by the row's key, so a flow or a test finds a row wherever it has moved.
  const pressRef = useRef(onPress);
  pressRef.current = onPress;
  const press = useCallback(() => pressRef.current?.(), []);
  const pressed = useSharedValue(0);
  const gesture = useMemo(() => {
    const lift = Gesture.Pan()
      .enabled(count > 1)
      .activateAfterLongPress(LIFT_AFTER_MS)
      .onStart(() => {
        pressed.value = 0;
        handlers.lift(id);
      })
      .onUpdate((e) => {
        handlers.drag(e.translationY, e.absoluteY);
      })
      .onFinalize(() => {
        handlers.drop(id);
      })
      .withTestId(`${testID}-drag-${id}`);
    const tap = Gesture.Tap()
      .enabled(hasPress)
      .maxDistance(10)
      .onBegin(() => {
        pressed.value = withTiming(1, { duration: 90 });
      })
      .onFinalize(() => {
        pressed.value = withTiming(0, { duration: 160 });
      })
      .onEnd((_e, success) => {
        if (success) runOnJS(press)();
      })
      .withTestId(`${testID}-tap-${id}`);
    return Gesture.Race(lift, tap);
  }, [count, handlers, id, testID, hasPress, press, pressed]);
  // What's tapped dims (v2/Tap).
  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - pressed.value * PRESS_DIM }));

  const itemStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const liftStyle = useAnimatedStyle(() => {
    const on = activeId.value === id;
    return { opacity: withTiming(on ? 1 : 0, { duration: 140 }), transform: [{ scale: withSpring(on ? 1.02 : 1, SPRING) }] };
  });

  const actions = [
    ...(a11y.actions ?? []),
    ...(index > 0 ? [{ name: 'moveUp', label: t('v2.moveUp') }] : []),
    ...(index < count - 1 ? [{ name: 'moveDown', label: t('v2.moveDown') }] : []),
  ];
  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'moveUp') onA11yMove(index, index - 1, a11y.label);
    else if (name === 'moveDown') onA11yMove(index, index + 1, a11y.label);
    else a11y.onAction?.(name);
  };

  return (
    <Animated.View style={[styles.item, { height, zIndex: raised ? 2 : 1 }, itemStyle]} pointerEvents="box-none">
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={styles.content}
          accessible
          accessibilityRole={a11y.role}
          accessibilityLabel={a11y.label}
          accessibilityState={a11y.state}
          accessibilityHint={a11y.hint}
          accessibilityActions={actions}
          onAccessibilityAction={onAction}
          testID={`${testID}-item-${id}`}
        >
          <Animated.View
            style={[styles.lifted, { backgroundColor: palette.fill, borderColor: palette.handle }, liftStyle]}
            pointerEvents="none"
          />
          <Animated.View style={[styles.inner, dimStyle]} onLayout={(e) => onMeasure(id, e.nativeEvent.layout.height)}>
            {children}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { overflow: 'visible' },
  line: { position: 'absolute', right: 0, height: layoutV2.hairline },
  item: { position: 'absolute', left: 0, right: 0, top: 0 },
  content: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  inner: { minHeight: MIN_ROW, justifyContent: 'center' },
  lifted: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 3,
    bottom: 3,
    borderRadius: radiusV2.media,
    borderWidth: layoutV2.hairline,
  },
});
