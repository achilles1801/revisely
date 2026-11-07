// The Activity block marks (gap audit §1 B, I): one map of icons, used by the day view and the calendar's
// picked-day preview. Revised is the progress ring (RevisedMark); the other blocks are a bubble circle.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

export type BlockKind = 'revised' | 'memorized' | 'read' | 'notes';

/** The one icon per block. (`stopwatch-outline` is only a timed Read item's own icon.) */
export const BLOCK_ICON: Record<Exclude<BlockKind, 'revised'>, React.ComponentProps<typeof Ionicons>['name']> = {
  memorized: 'leaf-outline',
  read: 'book-outline',
  notes: 'document-text-outline',
};

/** The Revised block's glyph, inside its ring. */
export const REVISED_ICON = 'repeat' as const;

/** A bubble circle with its block's icon (36 across, icon 18 in text). */
export function BlockMark({ kind, size = 36 }: { kind: Exclude<BlockKind, 'revised'>; size?: number }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bubble }]}>
      <Ionicons name={BLOCK_ICON[kind]} size={18} color={palette.text} />
    </View>
  );
}

/**
 * The Revised block's mark: the day's progress as a ring (3pt, primary on track, 36 across), with the
 * repeat glyph in its centre (17, text). Done: a solid done disc with a checkmark (19, onDone).
 */
export function RevisedMark({ fraction, done, size = 36 }: { fraction: number; done: boolean; size?: number }) {
  const { palette } = useTheme();
  if (done) {
    return (
      <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.done }]} accessibilityLabel="Revised, done">
        <Ionicons name="checkmark" size={19} color={palette.onDone} />
      </View>
    );
  }
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <View style={[styles.center, { width: size, height: size }]} accessibilityLabel={`${Math.round(f * 100)} percent revised`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={palette.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={palette.primary}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * f} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Ionicons name={REVISED_ICON} size={17} color={palette.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
