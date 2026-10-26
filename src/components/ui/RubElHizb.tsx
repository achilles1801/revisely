import React from 'react';
import Svg, { Circle, Polygon } from 'react-native-svg';

/**
 * The rub el hizb (۞): two squares, one turned 45°, around a small circle. One
 * of the new design's own marks, drawn from the mushaf rather than clip art:
 * hizb and quarter markers, and milestones (in gold).
 */
export function RubElHizb({ size = 16, color }: { size?: number; color: string }) {
  const c = size / 2;
  const r = size * 0.42;
  // A square of "radius" r, and the same turned 45°.
  const square = (turn: number) =>
    [0, 1, 2, 3]
      .map((i) => {
        const a = turn + (Math.PI / 2) * i + Math.PI / 4;
        return `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
      })
      .join(' ');
  return (
    <Svg width={size} height={size} accessibilityElementsHidden importantForAccessibility="no">
      <Polygon points={square(0)} fill="none" stroke={color} strokeWidth={size * 0.08} strokeLinejoin="round" />
      <Polygon points={square(Math.PI / 4)} fill="none" stroke={color} strokeWidth={size * 0.08} strokeLinejoin="round" />
      <Circle cx={c} cy={c} r={size * 0.11} fill={color} />
    </Svg>
  );
}
