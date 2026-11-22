import React from 'react';
import { View } from 'react-native';
import type { Rect } from '../../lib/ayahBounds';
import { washOf } from '../../lib/reciteLive/wash';

/**
 * A highlight on a mushaf page, drawn as a soft pastel wash (lib/reciteLive/wash): a pill-shaped core in `colour`, its
 * edge fading out all round (a box shadow of the same colour, so neighbouring washes merge into one), no outline. Behind
 * the ink it leaves the ink as it is; over a hidden page's cover it marks the cover. `box` is the highlight's box in
 * bounds space; `scale` the page's.
 */
export function Wash({ box, scale, colour, opacity, testID }: { box: Rect; scale: number; colour: string; opacity?: number; testID?: string }) {
  const { core, soft } = washOf(box);
  const height = (core.y1 - core.y0) * scale;
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: core.x0 * scale,
        top: core.y0 * scale,
        width: (core.x1 - core.x0) * scale,
        height,
        borderRadius: height / 2,
        backgroundColor: colour,
        boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: soft * scale, spreadDistance: 0, color: colour }],
        ...(opacity == null ? null : { opacity }),
      }}
    />
  );
}
