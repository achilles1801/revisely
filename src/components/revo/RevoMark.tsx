import React, { useId } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { revoV2 } from '../../theme/v2';
import { R_ASPECT, R_PATH, R_VIEWBOX } from './rMarkPath';

/**
 * Revo's mark: the app icon's gradient R on a black disc, lit from the top-left. `size` is the
 * disc; the R is about half its width (29 of 56 on the button).
 */
export function RevoMark({ size, ring = false, style }: { size: number; ring?: boolean; style?: ViewStyle }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rWidth = size * (29 / 56);
  const rHeight = rWidth * R_ASPECT;
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }, style]} testID="revo-mark">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`disc${uid}`} cx="30%" cy="25%" r="80%">
            <Stop offset="0" stopColor={revoV2.discLight} />
            <Stop offset="0.55" stopColor={revoV2.discMid} />
            <Stop offset="1" stopColor={revoV2.discEdge} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#disc${uid})`} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <RLetter width={rWidth} height={rHeight} />
      </View>
      {ring ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: 1, borderColor: revoV2.ring, opacity: 0.6 }]}
        />
      ) : null}
    </View>
  );
}

/** The R alone, in the app icon's gradient. */
export function RLetter({ width, height }: { width: number; height: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [, , w, h] = R_VIEWBOX.split(' ').map(Number);
  return (
    <Svg width={width} height={height} viewBox={R_VIEWBOX}>
      <Defs>
        <LinearGradient id={`r${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1={h} x2={w} y2="0">
          <Stop offset="0" stopColor={revoV2.rStart} />
          <Stop offset="1" stopColor={revoV2.rEnd} />
        </LinearGradient>
      </Defs>
      <Path d={R_PATH} fill={`url(#r${uid})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
