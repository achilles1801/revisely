// A Coverage tile or chip filled by share (ACT-26): the label is drawn once on the ground and once in
// each filled part, each copy clipped to its part, so it reads in that part's own colour wherever the
// fill ends (white on the dark fill, ink on the ground). Insights' juz tiles and surah chips and Revo's
// juz map draw with it.

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { FillLook } from './coverageLook';

export function CoverageFill({
  look,
  label,
  radius = 8,
  style,
  contentStyle,
}: {
  look: FillLook;
  /** The label in a colour: drawn on the ground, then over each filled part. */
  label: (color: string, dim: boolean) => React.ReactNode;
  radius?: number;
  /** The box (size, flex). */
  style?: StyleProp<ViewStyle>;
  /** How the label sits (padding, alignment): the same on every layer. */
  contentStyle?: StyleProp<ViewStyle>;
}) {
  // Each part's clip starts at the left edge and covers it and the parts before it; drawn last part first,
  // so the first part (this week) is on top. A clip's inner copy is as wide as the whole box (100 / share %).
  let reach = 0;
  const clips = look.segments.map((s) => {
    reach += s.share;
    return { ...s, reach: Math.min(1, reach) };
  });
  return (
    <View style={[styles.box, { borderRadius: radius, backgroundColor: look.ground.backgroundColor }, style]}>
      <View style={[styles.content, contentStyle]}>{label(look.ground.color, look.ground.dim)}</View>
      {[...clips].reverse().map((c, i) => (
        <View key={i} style={[styles.clip, { width: `${c.reach * 100}%` }]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={[styles.copy, { width: `${100 / c.reach}%`, backgroundColor: c.backgroundColor }, contentStyle]}>{label(c.color, false)}</View>
        </View>
      ))}
      {look.outline ? <View style={[styles.outline, { borderRadius: radius, borderColor: look.outline }]} pointerEvents="none" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  clip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  copy: { position: 'absolute', left: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  outline: { ...StyleSheet.absoluteFillObject, borderWidth: 1.5 },
});
