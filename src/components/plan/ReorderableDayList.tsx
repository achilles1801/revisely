import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityInfo,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  AnimatedRef,
  SharedValue,
  measure,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useDesign } from '../../design/DesignContext';
import { useHaptics } from '../../design/haptics';
import { summarizeDay } from '../../lib/planDisplay';
import { moveDay, removeDay } from '../../lib/planBuilder';
import {
  FULL_SWIPE,
  autoScrollStep,
  moveItem,
  moveSlot,
  reconcileKeys,
  slotAt,
  swipeOutcome,
} from '../../lib/reorder';
import { shadows } from '../../theme/shadows';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { DateBadge, DAY_ROW_INSET, dayTitle } from './DayRow';
import { useGroupedStyles } from './Grouped';

/** The scroll view the list sits in, for scrolling while a row is dragged near an edge. */
export interface ScrollLink {
  ref: AnimatedRef<Animated.ScrollView>;
  /** Its scroll offset (useScrollOffset). */
  offset: SharedValue<number>;
  /** Its content height (onContentSizeChange). */
  contentHeight: SharedValue<number>;
}

/** Height of a day row before its text is measured (title, subtitle, padding). */
const MIN_ROW = 61;
const PAD_V = 10;
/** Width of the Delete button a swipe uncovers. */
export const ACTION_WIDTH = 84;
const LIFT_AFTER_MS = 350;
/** Room between the dates and where swiped content disappears. */
const CLIP_GAP = 8;
const SPRING = { damping: 24, stiffness: 280, mass: 0.9 };
/** How far a held row dims in the new design (v2/Tap's 0.55). */
const PRESS_DIM = 0.45;

let keySeq = 0;
const makeKey = () => `day-${++keySeq}`;

/**
 * The cycle's days as rows that can be put in another order and deleted.
 *
 * The dates stay where they are, down the left: what moves is what's on a
 * day. Touch and hold a day's content to lift it, drag it onto another date
 * (the list scrolls near the edges), let go to drop it there. Swipe left for
 * Delete; a long swipe deletes on release. VoiceOver gets Move up, Move down
 * and Delete actions instead.
 *
 * `days` is the whole cycle; `limit` shows only the first few. Every change
 * goes to the parent (`onMove`, `onDelete`), which owns the days.
 *
 * The new design changes only the look: a day's content as a feed row's name
 * and meta, the dates in sentence case, a held row dims, the lifted row on
 * the quiet fill with an edge (no shadow), the drop date on the accent's
 * tint, Delete on `redFill`.
 */
export function ReorderableDayList({
  days,
  limit,
  today,
  scroll,
  onPressDay,
  onMove,
  onDelete,
  onDragChange,
}: {
  days: number[][];
  limit?: number;
  today: Date;
  scroll: ScrollLink;
  onPressDay: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (index: number) => void;
  /** True while a row is lifted: the parent stops its scroll view scrolling by touch. */
  onDragChange?: (dragging: boolean) => void;
}) {
  const { theme } = useTheme();
  const haptics = useHaptics();

  // Row identities, so a day's content keeps its view (and its animation) as
  // it moves. Changes made here update them at once; changes from outside are
  // reconciled when the days arrive.
  const keysRef = useRef<string[]>(days.map(() => makeKey()));
  const daysRef = useRef(days);
  if (daysRef.current !== days) {
    keysRef.current = reconcileKeys(keysRef.current, daysRef.current, days, makeKey);
    daysRef.current = days;
  }
  const keys = keysRef.current;
  const visible = Math.min(limit ?? days.length, days.length);
  const canDelete = days.length > 1;
  const canDrag = visible > 1;

  // All rows share one height (the tallest text), so dates and contents line
  // up wherever a content lands.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const rowHeight = Math.max(
    MIN_ROW,
    ...keys.slice(0, visible).map((k) => heights[k] ?? 0),
  );
  const reportHeight = useCallback((key: string, h: number) => {
    setHeights((prev) => (Math.abs((prev[key] ?? 0) - h) < 0.5 ? prev : { ...prev, [key]: h }));
  }, []);

  const [raised, setRaised] = useState<string | null>(null);

  const positions = useSharedValue<Record<string, number>>({});
  const activeId = useSharedValue('');
  const openId = useSharedValue('');
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
  const count = useSharedValue(visible);
  const width = useSharedValue(0);

  const keyString = keys.join('|');
  useEffect(() => {
    const next: Record<string, number> = {};
    keysRef.current.forEach((k, i) => {
      next[k] = i;
    });
    positions.value = next;
  }, [keyString, positions]);
  useEffect(() => {
    rowH.value = rowHeight;
  }, [rowHeight, rowH]);
  useEffect(() => {
    count.value = visible;
  }, [visible, count]);

  // ---- JS side of the gestures (stable, reading the latest props) ----------
  const latest = useRef({ onPressDay, onMove, onDelete, onDragChange, haptics, today });
  latest.current = { onPressDay, onMove, onDelete, onDragChange, haptics, today };

  const applyMove = useCallback((from: number, to: number) => {
    if (from === to) return;
    keysRef.current = moveItem(keysRef.current, from, to);
    daysRef.current = moveDay(daysRef.current, from, to);
    latest.current.onMove(from, to);
  }, []);

  const applyDelete = useCallback((key: string) => {
    const index = keysRef.current.indexOf(key);
    if (index < 0 || daysRef.current.length <= 1) return;
    keysRef.current = keysRef.current.filter((k) => k !== key);
    daysRef.current = removeDay(daysRef.current, index);
    latest.current.onDelete(index);
  }, []);

  const pressKey = useCallback((key: string) => {
    const index = keysRef.current.indexOf(key);
    if (index >= 0) latest.current.onPressDay(index);
  }, []);

  const onTick = useCallback(() => latest.current.haptics.selection(), []);
  const onArm = useCallback(() => latest.current.haptics.impact(), []);

  // ---- UI-thread side --------------------------------------------------------
  // Where the lifted content is: the finger's travel plus however far the list
  // scrolled under it, kept inside the list. Crossing into another slot moves
  // the contents in between.
  const follow = useCallback(() => {
    'worklet';
    const id = activeId.value;
    if (id === '') return;
    const n = count.value;
    const h = rowH.value;
    const top = Math.max(
      0,
      Math.min((n - 1) * h, startTop.value + transY.value + scrollY.value - startScroll.value),
    );
    dragTop.value = top;
    const slot = slotAt(top, h, n);
    if (positions.value[id] !== slot) {
      positions.value = moveSlot(positions.value, id, slot);
      runOnJS(onTick)();
    }
  }, [activeId, count, rowH, startTop, transY, scrollY, startScroll, dragTop, positions, onTick]);

  // Near an edge of the screen, scroll on every frame, even with the finger still.
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
  const onDrop = useCallback(
    (key: string, from: number, to: number) => {
      frameRef.current.setActive(false);
      latest.current.onDragChange?.(false);
      if (keysRef.current.indexOf(key) === from) applyMove(from, to);
    },
    [applyMove],
  );

  const scrollRef = scroll.ref;
  const scrollOffset = scroll.offset;
  const contentHeight = scroll.contentHeight;
  const handlers = useMemo<Handlers>(() => {
    const lift = (id: string) => {
      'worklet';
      const slot = positions.value[id] ?? 0;
      activeId.value = id;
      openId.value = '';
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
    return { lift, drag, drop, applyDelete, pressKey, onArm };
  }, [
    positions, activeId, openId, fromSlot, startTop, rowH, dragTop, transY, startScroll,
    scrollY, scrollOffset, scrollRef, viewTop, viewBottom, maxScroll, contentHeight,
    fingerY, follow, onLift, onDrop, applyDelete, pressKey, onArm,
  ]);

  const shared = useMemo<Shared>(
    () => ({ positions, activeId, openId, dragTop, rowH, width }),
    [positions, activeId, openId, dragTop, rowH, width],
  );

  // ---- Accessibility: the same moves without dragging -------------------------
  const a11yMove = useCallback(
    (from: number, to: number) => {
      const pages = daysRef.current[from];
      if (!pages || to < 0 || to >= daysRef.current.length) return;
      applyMove(from, to);
      latest.current.haptics.selection();
      AccessibilityInfo.announceForAccessibility(
        `${summarizeDay(pages).title} moved to ${dayTitle(to, latest.current.today)}`,
      );
    },
    [applyMove],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
  };

  const listHeight = useSharedValue(visible * rowHeight);
  const sized = useRef(false);
  useEffect(() => {
    const target = visible * rowHeight;
    listHeight.value = sized.current ? withTiming(target, { duration: 220 }) : target;
    sized.current = true;
  }, [visible, rowHeight, listHeight]);
  const listStyle = useAnimatedStyle(() => ({ height: listHeight.value }));

  return (
    <Animated.View style={[styles.list, listStyle]} onLayout={onLayout} testID="day-list">
      {Array.from({ length: visible }, (_, i) => (
        <Slot
          key={`slot-${i}`}
          index={i}
          today={today}
          height={rowHeight}
          last={i === visible - 1}
          positions={positions}
          activeId={activeId}
        />
      ))}
      {keys.slice(0, visible).map((key, i) => (
        <DayItem
          key={key}
          id={key}
          index={i}
          count={visible}
          pages={days[i]}
          today={today}
          height={rowHeight}
          raised={raised === key}
          canDrag={canDrag}
          canDelete={canDelete}
          shared={shared}
          handlers={handlers}
          onMeasure={reportHeight}
          onA11yMove={a11yMove}
        />
      ))}
    </Animated.View>
  );
}

interface Shared {
  positions: SharedValue<Record<string, number>>;
  activeId: SharedValue<string>;
  openId: SharedValue<string>;
  dragTop: SharedValue<number>;
  rowH: SharedValue<number>;
  width: SharedValue<number>;
}

interface Handlers {
  lift: (id: string) => void;
  drag: (translationY: number, absoluteY: number) => void;
  drop: (id: string) => void;
  applyDelete: (key: string) => void;
  pressKey: (key: string) => void;
  onArm: () => void;
}

/** A date down the left, which stays put, and the line under it. */
function Slot({
  index,
  today,
  height,
  last,
  positions,
  activeId,
}: {
  index: number;
  today: Date;
  height: number;
  last: boolean;
  positions: SharedValue<Record<string, number>>;
  activeId: SharedValue<string>;
}) {
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  // Where the lifted content will land: its date lights up.
  const target = useAnimatedStyle(() => {
    const id = activeId.value;
    const on = id !== '' && positions.value[id] === index;
    return { opacity: withTiming(on ? 1 : 0, { duration: 120 }) };
  });
  return (
    <View style={[styles.slot, { top: index * height, height }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.target,
          isNew ? { backgroundColor: palette.accentSubtle, borderRadius: radiusV2.media } : { backgroundColor: theme.accent + '24' },
          target,
        ]}
        testID={`day-target-${index}`}
      />
      <DateBadge index={index} today={today} />
      {last ? null : (
        <View
          style={[
            styles.separator,
            isNew ? { backgroundColor: palette.separator, height: layoutV2.hairline } : { backgroundColor: theme.border },
          ]}
          testID={`day-separator-${index}`}
        />
      )}
    </View>
  );
}

function DayItem({
  id,
  index,
  count,
  pages,
  today,
  height,
  raised,
  canDrag,
  canDelete,
  shared,
  handlers,
  onMeasure,
  onA11yMove,
}: {
  id: string;
  index: number;
  count: number;
  pages: number[];
  today: Date;
  height: number;
  raised: boolean;
  canDrag: boolean;
  canDelete: boolean;
  shared: Shared;
  handlers: Handlers;
  onMeasure: (key: string, h: number) => void;
  onA11yMove: (from: number, to: number) => void;
}) {
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  const grouped = useGroupedStyles();
  // Lifted, the content rises above the list. New design: on the quiet fill
  // with an edge, flat (a shadow is lost on black); classic: a raised card.
  const liftFill = isNew ? palette.fill : theme.surface;
  const liftEdge = isNew ? palette.handle : theme.border;
  const summary = summarizeDay(pages);
  const { positions, activeId, openId, dragTop, rowH, width } = shared;

  const y = useSharedValue(index * height);
  const x = useSharedValue(0);
  const startX = useSharedValue(0);
  const armed = useSharedValue(false);
  const pressed = useSharedValue(0);
  const [open, setOpen] = useState(false);

  // Follow the finger while lifted; otherwise glide to this content's slot.
  useAnimatedReaction(
    () => ({
      active: activeId.value === id,
      y: activeId.value === id ? dragTop.value : (positions.value[id] ?? index) * rowH.value,
      h: rowH.value,
    }),
    (cur, prev) => {
      if (cur.active || prev === null || cur.h !== prev.h) {
        y.value = cur.y;
      } else if (prev.active || cur.y !== prev.y) {
        y.value = withSpring(cur.y, SPRING);
      }
    },
    [id, index],
  );

  // Another row opened (or a tap anywhere closed them): close this one.
  useAnimatedReaction(
    () => openId.value,
    (cur, prev) => {
      if (prev !== null && cur !== id && x.value < 0 && x.value > -width.value + 1) {
        x.value = withSpring(0, SPRING);
        runOnJS(setOpen)(false);
      }
    },
    [id],
  );

  const deleteNow = useCallback(() => {
    x.value = withTiming(-Math.max(width.value, ACTION_WIDTH), { duration: 160 }, (done) => {
      'worklet';
      if (done) runOnJS(handlers.applyDelete)(id);
    });
  }, [handlers, id, width, x]);

  const gesture = useMemo(() => {
    const lift = Gesture.Pan()
      .enabled(canDrag)
      .activateAfterLongPress(LIFT_AFTER_MS)
      .onStart(() => {
        pressed.value = 0;
        if (x.value !== 0) x.value = withSpring(0, SPRING);
        handlers.lift(id);
      })
      .onUpdate((e) => {
        handlers.drag(e.translationY, e.absoluteY);
      })
      .onFinalize(() => {
        handlers.drop(id);
      })
      .withTestId(`day-drag-${index}`);

    const swipe = Gesture.Pan()
      .enabled(canDelete)
      // Closed, only a swipe to the left starts it (a swipe right stays the
      // screen's back gesture); open, either way.
      .activeOffsetX(open ? [-12, 12] : [-12, 10000])
      .failOffsetY([-10, 10])
      .onStart(() => {
        startX.value = x.value;
        armed.value = false;
        if (openId.value !== '' && openId.value !== id) openId.value = '';
      })
      .onUpdate((e) => {
        const w = width.value;
        x.value = Math.max(-w, Math.min(0, startX.value + e.translationX));
        const full = w > 0 && -x.value >= w * FULL_SWIPE;
        if (full !== armed.value) {
          armed.value = full;
          if (full) runOnJS(handlers.onArm)();
        }
      })
      .onEnd((e) => {
        const outcome = swipeOutcome(x.value, e.velocityX, width.value, ACTION_WIDTH);
        if (outcome === 'delete') {
          x.value = withTiming(-width.value, { duration: 160 }, (done) => {
            if (done) runOnJS(handlers.applyDelete)(id);
          });
        } else if (outcome === 'open') {
          x.value = withSpring(-ACTION_WIDTH, SPRING);
          openId.value = id;
          runOnJS(setOpen)(true);
        } else {
          x.value = withSpring(0, SPRING);
          if (openId.value === id) openId.value = '';
          runOnJS(setOpen)(false);
        }
      })
      .withTestId(`day-swipe-${index}`);

    const tap = Gesture.Tap()
      .maxDistance(10)
      .onBegin(() => {
        pressed.value = withDelay(70, withTiming(1, { duration: 90 }));
      })
      .onFinalize(() => {
        pressed.value = withTiming(0, { duration: 160 });
      })
      .onEnd((_e, success) => {
        if (!success) return;
        // A tap with a row open closes it, as in iOS lists.
        if (openId.value !== '') {
          openId.value = '';
          return;
        }
        runOnJS(handlers.pressKey)(id);
      })
      .withTestId(`day-tap-${index}`);

    return Gesture.Race(lift, swipe, tap);
  }, [canDrag, canDelete, open, handlers, id, index, openId, pressed, startX, armed, width, x]);

  const itemStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const liftStyle = useAnimatedStyle(() => {
    const on = activeId.value === id;
    return {
      opacity: withTiming(on ? 1 : 0, { duration: 140 }),
      transform: [{ scale: withSpring(on ? 1.02 : 1, SPRING) }],
    };
  });
  const pressStyle = useAnimatedStyle(() => ({ opacity: pressed.value }));
  // The new design dims what's held instead of tinting behind it (v2/Tap).
  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - pressed.value * PRESS_DIM }));
  const actionStyle = useAnimatedStyle(() => ({ width: Math.max(0, -x.value) }));

  const name = `${dayTitle(index, today)}: ${summary.title}, ${summary.subtitle}`;
  const actions = [
    { name: 'activate', label: 'Edit' },
    ...(index > 0 ? [{ name: 'moveUp', label: 'Move up' }] : []),
    ...(index < count - 1 ? [{ name: 'moveDown', label: 'Move down' }] : []),
    ...(canDelete ? [{ name: 'delete', label: 'Delete' }] : []),
  ];
  const onAction = (e: AccessibilityActionEvent) => {
    switch (e.nativeEvent.actionName) {
      case 'activate':
        handlers.pressKey(id);
        break;
      case 'moveUp':
        onA11yMove(index, index - 1);
        break;
      case 'moveDown':
        onA11yMove(index, index + 1);
        break;
      case 'delete':
        handlers.applyDelete(id);
        break;
    }
  };

  return (
    <Animated.View
      style={[styles.item, { height, zIndex: raised ? 2 : 1 }, itemStyle]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={styles.content}
          accessible
          accessibilityRole="button"
          accessibilityLabel={name}
          accessibilityHint="Double-tap to change what's on this day."
          accessibilityActions={actions}
          onAccessibilityAction={onAction}
          testID={`day-item-${index}`}
        >
          <Animated.View
            style={[
              styles.lifted,
              { backgroundColor: liftFill, borderColor: liftEdge },
              isNew ? styles.liftedV2 : styles.liftedShadow,
              liftStyle,
            ]}
            pointerEvents="none"
            testID={`day-lifted-${index}`}
          />
          {isNew ? null : (
            <Animated.View
              style={[styles.pressed, { backgroundColor: theme.accent + '22' }, pressStyle]}
              pointerEvents="none"
            />
          )}
          {/* Swiped, the content slides under the edge of the dates, which stay. */}
          <Animated.View style={[styles.clip, isNew && dimStyle]}>
            <Animated.View style={[styles.slide, slideStyle]}>
              <View
                style={styles.text}
                onLayout={(e) => onMeasure(id, e.nativeEvent.layout.height + PAD_V * 2)}
              >
                <Text
                  style={
                    isNew
                      ? [typeV2.name, { color: summary.isRest ? palette.secondary : palette.text }]
                      : [grouped.title, { color: summary.isRest ? theme.textMuted : theme.textPrimary }]
                  }
                  numberOfLines={1}
                  testID={`day-title-${index}`}
                >
                  {summary.title}
                </Text>
                {summary.subtitle ? (
                  <Text
                    style={isNew ? [typeV2.meta, { color: palette.secondary }] : grouped.subtitle}
                    numberOfLines={2}
                  >
                    {summary.subtitle}
                  </Text>
                ) : null}
              </View>
              {isNew ? (
                <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
              ) : (
                <Ionicons name="chevron-forward" size={17} color={theme.textMuted} style={grouped.chevron} />
              )}
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      {/* Over the row, as wide as the swipe has uncovered (nothing while closed). */}
      {canDelete ? (
        <Animated.View
          style={[styles.action, { backgroundColor: palette.redFill }, actionStyle]}
          testID={`day-delete-fill-${index}`}
        >
          <Pressable
            onPress={deleteNow}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${dayTitle(index, today)}`}
            testID={`day-delete-${index}`}
          >
            <Text
              style={[isNew ? typeV2.button : styles.actionText, { color: palette.onRedFill }]}
              maxFontSizeMultiplier={1.4}
            >
              Delete
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { overflow: 'hidden' },
  slot: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
  },
  target: {
    position: 'absolute',
    left: 10,
    width: 52,
    top: 6,
    bottom: 6,
    borderRadius: 10,
  },
  separator: {
    position: 'absolute',
    left: DAY_ROW_INSET,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  item: { position: 'absolute', left: 0, right: 0, top: 0 },
  action: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  actionButton: {
    width: ACTION_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 15, fontWeight: '600' },
  content: StyleSheet.absoluteFillObject,
  clip: {
    position: 'absolute',
    left: DAY_ROW_INSET - CLIP_GAP,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  slide: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: CLIP_GAP,
    paddingRight: 16,
    gap: 8,
  },
  lifted: {
    position: 'absolute',
    left: DAY_ROW_INSET - 10,
    right: 6,
    top: 3,
    bottom: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  liftedShadow: shadows.md,
  liftedV2: { borderRadius: radiusV2.media, borderWidth: layoutV2.hairline },
  pressed: { ...StyleSheet.absoluteFillObject, left: DAY_ROW_INSET - 10 },
  text: { flex: 1, minWidth: 0 },
});
