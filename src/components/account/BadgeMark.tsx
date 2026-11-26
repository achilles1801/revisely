// A badge for pages revised (ACCOUNT-5): each tier its own shape and material, climbing in intricacy (Majd's boards,
// Nov 26 2026, `~/Documents/revisely-settings-mocks/account-v2/boards/B3-2-badges`): bronze a coin, silver a hexagon,
// gold the eight-pointed star, platinum a twelve-pointed star, diamond a cut gem, emerald a rosette with a gold rim. A
// badge not won yet keeps its shape in grey, so the next one shows before it is won.
import React, { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Stop, Text as SvgText } from 'react-native-svg';
import { badgeOf, milestoneLabel, type Milestone } from '../../lib/badges';
import { useTheme } from '../../context/ThemeContext';
import { BADGE_FACET, BADGE_MATERIALS } from '../../theme/v2';

function points(c: number, list: [number, number][]): string {
  return list.map(([x, y]) => `${(c + x).toFixed(2)},${(c + y).toFixed(2)}`).join(' ');
}

/** A star of `n` points between radii R and r, the first point up (rotated by `rot` degrees). */
function star(R: number, r: number, n: number, rot = 0): string {
  const out: [number, number][] = [];
  for (let i = 0; i < 2 * n; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    out.push([rad * Math.sin(a), -rad * Math.cos(a)]);
  }
  return points(50, out);
}

function ngon(R: number, n: number): string {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    out.push([R * Math.sin(a), -R * Math.cos(a)]);
  }
  return points(50, out);
}

export function BadgeMark({
  milestone,
  size,
  locked = false,
  number = true,
  testID,
}: {
  milestone: Milestone;
  size: number;
  /** Not won yet: the shape in grey. */
  locked?: boolean;
  /** The milestone inside ("250", "2.5K"); off for the small badge beside a name. */
  number?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  const gid = `badge${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const { tier } = badgeOf(milestone);
  const m = BADGE_MATERIALS[tier];
  const fill = locked ? palette.fill : `url(#${gid})`;
  const edge = locked ? palette.outline : m.rim;
  const ink = locked ? palette.secondary : m.ink;
  const sw = 3.2;
  const detail = { fill: 'none', stroke: edge, strokeWidth: 1.6, strokeLinejoin: 'round' as const, opacity: 0.7 };

  let body: React.ReactNode;
  if (tier === 'bronze') {
    body = (
      <>
        <Circle cx={50} cy={50} r={44} fill={fill} stroke={edge} strokeWidth={sw} />
        <Circle cx={50} cy={50} r={35} {...detail} />
      </>
    );
  } else if (tier === 'silver') {
    body = (
      <>
        <Polygon points={ngon(46, 6)} fill={fill} stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
        <Polygon points={ngon(36, 6)} {...detail} />
      </>
    );
  } else if (tier === 'gold') {
    body = (
      <>
        <Polygon points={star(47, 47 * 0.7654, 8)} fill={fill} stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
        <Circle cx={50} cy={50} r={27} {...detail} />
      </>
    );
  } else if (tier === 'platinum') {
    body = (
      <>
        <Polygon points={star(48, 39, 12)} fill={fill} stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
        <Polygon points={star(34, 28, 12, 15)} {...detail} strokeWidth={1.4} />
      </>
    );
  } else if (tier === 'diamond') {
    body = (
      <>
        <Polygon points="12,38 30,14 70,14 88,38 50,90" fill={fill} stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
        <Path
          d="M12 38H88M30 14L40 38L50 14L60 38L70 14M40 38L50 90L60 38"
          fill="none"
          stroke={locked ? edge : BADGE_FACET}
          strokeWidth={1.4}
          strokeLinejoin="round"
          opacity={locked ? 0.7 : 0.55}
        />
      </>
    );
  } else {
    body = (
      <>
        <Polygon points={star(48, 40, 16)} fill={fill} stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
        <Polygon points={star(33, 25.3, 8, 22.5)} {...detail} strokeWidth={1.8} opacity={0.9} />
      </>
    );
  }

  const label = milestoneLabel(milestone);
  const fontSize = (label.length <= 2 ? 34 : label.length === 3 ? 29 : 24) - (tier === 'diamond' ? 4 : 0);
  return (
    <Svg width={size} height={size} viewBox="-2 -2 104 104" testID={testID}>
      <Defs>
        <LinearGradient id={gid} x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor={m.light} />
          <Stop offset="1" stopColor={m.deep} />
        </LinearGradient>
      </Defs>
      {body}
      {number ? (
        <SvgText
          x={50}
          y={tier === 'diamond' ? 46 : 50}
          dy={fontSize * 0.35}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight="800"
          fill={ink}
        >
          {label}
        </SvgText>
      ) : null}
    </Svg>
  );
}
