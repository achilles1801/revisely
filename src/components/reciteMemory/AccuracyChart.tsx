import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The y axis's floor: a few points under the lowest take, on an even percent, at most 100 − 2. */
export function chartFloor(values: number[]): number {
  const low = Math.min(...values.map((v) => v * 100), 100);
  return Math.max(0, Math.min(98, Math.floor((low - 1) / 2) * 2));
}

/**
 * A passage's accuracy over its takes: one line in ink and a dot a take, by date, the newest larger (Majd's style rule,
 * Nov 15 2026: no coloured circles; the figures beside it carry the score's colours). Gridlines every 2%.
 */
export function AccuracyChart({ points, width, height = 146, now }: { points: Array<{ at: number; accuracy: number }>; width: number; height?: number; now: number }) {
  const { palette } = useTheme();
  if (points.length === 0 || width <= 0) return null;
  const lx = 34;
  const rx = width - 8;
  const ty = 10;
  const by = height - 24;
  const floor = chartFloor(points.map((p) => p.accuracy));
  const first = points[0].at;
  const last = Math.max(points[points.length - 1].at, first + DAY_MS);
  const x = (at: number) => lx + ((at - first) / (last - first)) * (rx - lx);
  const y = (a: number) => by - ((a * 100 - floor) / (100 - floor)) * (by - ty);
  const grid: number[] = [];
  for (let g = 100; g >= floor; g -= Math.max(2, Math.ceil((100 - floor) / 4 / 2) * 2)) grid.push(g);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(' ');
  const label = (at: number) => {
    const d = new Date(at);
    return Math.round((now - at) / DAY_MS) < 1 && new Date(now).getDate() === d.getDate() ? 'Today' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  };
  const lastPoint = points[points.length - 1];
  return (
    <View testID="progress-chart" accessible accessibilityLabel={`Accuracy over ${points.length} takes`}>
      <Svg width={width} height={height}>
        {grid.map((g) => (
          <React.Fragment key={g}>
            <Line x1={lx} x2={rx} y1={y(g / 100)} y2={y(g / 100)} stroke={palette.separator} strokeWidth={1} />
            <SvgText x={lx - 6} y={y(g / 100) + 4} fontSize={11} textAnchor="end" fill={palette.secondary}>
              {`${g}%`}
            </SvgText>
          </React.Fragment>
        ))}
        <Path d={path} fill="none" stroke={palette.text} strokeWidth={1.8} strokeLinejoin="round" opacity={0.5} />
        {points.map((p, i) => (
          <Circle key={i} cx={x(p.at)} cy={y(p.accuracy)} r={i === points.length - 1 ? 5 : 4} fill={palette.text} stroke={palette.sheet} strokeWidth={1.5} />
        ))}
        <SvgText x={lx} y={height - 6} fontSize={11} fill={palette.secondary}>
          {label(points[0].at)}
        </SvgText>
        {points.length > 1 ? (
          <SvgText x={rx} y={height - 6} fontSize={11} textAnchor="end" fill={palette.secondary}>
            {label(lastPoint.at)}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

/** The summary row's small trend: the same line, no axes. */
export function Sparkline({ values, width = 44, height = 24 }: { values: number[]; width?: number; height?: number }) {
  const { palette } = useTheme();
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values, lo + 0.005);
  const xs = values.map((_, i) => 2 + (i * (width - 4)) / (values.length - 1));
  const ys = values.map((v) => height - 3 - ((v - lo) / (hi - lo)) * (height - 6));
  const path = xs.map((x0, i) => `${i === 0 ? 'M' : 'L'}${x0.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height} testID="progress-sparkline">
      <Path d={path} fill="none" stroke={palette.text} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.55} />
      <Circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2.6} fill={palette.text} />
    </Svg>
  );
}
