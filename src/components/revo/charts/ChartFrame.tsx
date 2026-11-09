import React, { useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '../../../context/ThemeContext';
import { Tap } from '../../v2/Tap';

/** What the chart's two header lines say while a mark is picked. */
export interface Readout {
  title: string;
  line: string;
}

/** Charts' text stops growing here (CLAUDE.md, UI traps): readouts wrap, the plot keeps its size. */
export const CHART_TEXT_MAX = 1.3;

/**
 * A chart in Revo's answer, flat on the sheet like an Insights section (no card; Majd, Nov 7
 * 2026). Two header lines: at rest the title and what a tap does; with a mark picked, the readout
 * for it and × to put it back. The panel for the picked mark goes under the plot.
 */
export function ChartFrame({
  title,
  hint,
  readout,
  onClear,
  testID,
  children,
  detail,
}: {
  title: string;
  hint: string;
  readout: Readout | null;
  onClear: () => void;
  testID: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.frame} testID={testID}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: palette.text }]} maxFontSizeMultiplier={CHART_TEXT_MAX} testID={`${testID}-title`}>
            {readout ? readout.title : title}
          </Text>
          <Text
            style={[styles.line, { color: palette.secondary }]}
            maxFontSizeMultiplier={CHART_TEXT_MAX}
            accessibilityLiveRegion="polite"
            testID={`${testID}-line`}
          >
            {readout ? readout.line : hint}
          </Text>
        </View>
        {readout ? (
          <Tap onPress={onClear} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} testID={`${testID}-close`}>
            <View style={[styles.close, { backgroundColor: palette.bubble }]}>
              <Ionicons name="close" size={17} color={palette.text} />
            </View>
          </Tap>
        ) : (
          <Ionicons name="stats-chart-outline" size={16} color={palette.secondary} style={styles.icon} />
        )}
      </View>
      {children}
      {detail ? (
        <View style={[styles.detail, { borderTopColor: palette.separator }]} testID={`${testID}-detail`}>
          {detail}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The plot: a tap picks the mark under the finger; with `onSlide`, a sideways drag runs along the
 * marks (a vertical one still scrolls the chat). For VoiceOver it is one adjustable element:
 * swiping up or down steps through the marks, and a double tap puts the pick back.
 */
export function ChartPlot({
  testID,
  label,
  value,
  onStep,
  onActivate,
  onTap,
  onSlide,
  children,
}: {
  testID: string;
  label: string;
  value: string;
  onStep: (by: 1 | -1) => void;
  onActivate: () => void;
  onTap: (x: number, y: number, size: { width: number; height: number }) => void;
  onSlide?: (x: number, size: { width: number; height: number }) => void;
  children: React.ReactNode;
}) {
  const size = useRef({ width: 0, height: 0 });
  // The gestures are made once; they call whatever the latest props are.
  const latest = useRef({ onTap, onSlide });
  latest.current = { onTap, onSlide };
  const slides = onSlide != null;
  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(10)
      .runOnJS(true)
      .onEnd((e, ok) => {
        if (!ok) return;
        // The pick waits a frame, for the touch to end in React Native too. A pick that put a
        // panel away shrank the chat while the touch was still down there: on iOS the scroll it
        // caused gave the chat's ScrollView the touch, whose end never came, and it kept it, so
        // the next tap anywhere did nothing (flow 09, Nov 8 2026).
        const { x, y } = e;
        requestAnimationFrame(() => latest.current.onTap(x, y, size.current));
      })
      .withTestId(`${testID}-tap`);
    if (!slides) return tap;
    const slide = (x: number) => latest.current.onSlide?.(x, size.current);
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      .runOnJS(true)
      .onStart((e) => slide(e.x))
      .onUpdate((e) => slide(e.x))
      .withTestId(`${testID}-pan`);
    return Gesture.Race(pan, tap);
  }, [testID, slides]);

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') onStep(1);
    else if (e.nativeEvent.actionName === 'decrement') onStep(-1);
    else if (e.nativeEvent.actionName === 'activate') onActivate();
  };

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
        onAccessibilityAction={onAction}
        onLayout={(e: LayoutChangeEvent) => {
          size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }}
        testID={testID}
      >
        {children}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  frame: { marginTop: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 38 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  line: { fontSize: 13, lineHeight: 18, marginTop: 1 },
  icon: { marginTop: 2 },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  detail: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
