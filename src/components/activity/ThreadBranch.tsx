// The thread line of a block (mock d1): a vertical line down the block's mark column,
// with a curved elbow into each item that hangs off the block (a recording, a note,
// a timed read). The last item's line stops at its elbow.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2 } from '../../theme/v2';

/** Where the line sits: the centre of a 40pt mark. */
export const THREAD_X = 20;
const ELBOW_Y = 14;
const ELBOW_R = 8;
const ELBOW_W = 14;

function ThreadItem({ last, children }: { last: boolean; children: React.ReactNode }) {
  const { palette } = useTheme();
  const [height, setHeight] = React.useState(0);
  const width = THREAD_X + ELBOW_W;
  const d = [
    `M ${THREAD_X} 0`,
    `L ${THREAD_X} ${last ? ELBOW_Y - ELBOW_R : height}`,
    last ? `` : '',
    `M ${THREAD_X} ${ELBOW_Y - ELBOW_R}`,
    `Q ${THREAD_X} ${ELBOW_Y} ${THREAD_X + ELBOW_R} ${ELBOW_Y}`,
    `L ${width} ${ELBOW_Y}`,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <View
      style={styles.item}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <Svg width={width} height={Math.max(height, ELBOW_Y + 1)} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={d} stroke={palette.separator} strokeWidth={layoutV2.threadLine} fill="none" strokeLinecap="round" />
      </Svg>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

/** The items of one block, each hung off its thread line. */
export function ThreadBranch({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <>
      {items.map((child, i) => (
        <ThreadItem key={i} last={i === items.length - 1}>
          {child}
        </ThreadItem>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  item: { paddingLeft: THREAD_X + ELBOW_W, paddingBottom: 6 },
  body: { minHeight: 0 },
});
