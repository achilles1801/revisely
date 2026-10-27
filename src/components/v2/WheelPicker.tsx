import React, { useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { arabicV2, radiusV2, typeV2 } from '../../theme/v2';
import { Tap } from './Tap';

export interface WheelItem {
  key: string;
  label: string;
  /** Arabic beside the label (a surah's name), in Amiri. */
  arabic?: string;
}

const ROW = 40;
const VISIBLE = 5;

/**
 * A wheel: a column that snaps to one row, the chosen one in a band across the
 * middle. Scroll it, or tap a row to jump there. VoiceOver adjusts it a row
 * at a time (swipe up or down).
 */
export function WheelPicker({
  items,
  index,
  onChange,
  label,
  testID,
}: {
  items: WheelItem[];
  index: number;
  onChange: (index: number) => void;
  /** What it picks, for VoiceOver ("Surah", "Ayah"). */
  label: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  const ref = useRef<ScrollView>(null);
  // Where the wheel is (or is going): a change from outside scrolls it there.
  const at = useRef(index);
  // Where it starts. Only once: a changing contentOffset would move the
  // wheel again on top of the scroll a pick has started.
  const [startOffset] = useState(() => ({ x: 0, y: index * ROW }));
  useEffect(() => {
    if (at.current === index) return;
    at.current = index;
    ref.current?.scrollTo({ y: index * ROW, animated: true });
  }, [index]);

  const settle = (y: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ROW)));
    if (i === at.current) return;
    at.current = i;
    onChange(i);
  };
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => settle(e.nativeEvent.contentOffset.y);
  const pick = (i: number) => {
    const next = Math.max(0, Math.min(items.length - 1, i));
    ref.current?.scrollTo({ y: next * ROW, animated: true });
    if (next !== at.current) {
      at.current = next;
      onChange(next);
    }
  };

  return (
    <View
      style={styles.wheel}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[index]?.label }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => pick(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.band, { backgroundColor: palette.fill }]} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        contentOffset={startOffset}
        contentContainerStyle={styles.content}
        onMomentumScrollEnd={onEnd}
        onScrollEndDrag={(e) => {
          // A drag that stops without a fling settles here.
          if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) onEnd(e);
        }}
        nestedScrollEnabled
      >
        {items.map((item, i) => {
          const chosen = i === index;
          const color = chosen ? palette.text : palette.secondary;
          return (
            <Tap
              key={item.key}
              onPress={() => pick(i)}
              style={styles.row}
              accessible={false}
              testID={testID ? `${testID}-${item.key}` : undefined}
            >
              <Text
                style={[typeV2.body, styles.label, { color, fontWeight: chosen ? '600' : '400' }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {item.label}
              </Text>
              {item.arabic ? (
                <Text style={[arabicV2(18), { color }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {item.arabic}
                </Text>
              ) : null}
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: { flex: 1, height: ROW * VISIBLE, overflow: 'hidden' },
  band: { position: 'absolute', left: 4, right: 4, top: ROW * 2, height: ROW, borderRadius: radiusV2.media },
  content: { paddingVertical: ROW * 2 },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  label: { flexShrink: 1 },
});
