import React from 'react';
import { Image, View } from 'react-native';
import type { Rect } from '../../lib/ayahBounds';
import { pageImageProps } from '../../lib/quranImages';

/**
 * A word of the page drawn again in another ink (Majd, Nov 22 2026: on a hidden page the word just recited in a
 * following colour, as Tarteel's): the page's image, tinted, seen only through the word's box, over the word's own ink.
 * The pages are images of ink on nothing, so a tint colours exactly the ink, glyph over glyph. Nothing fills the box:
 * a neighbour's wash reaching into it stays whole. Ink of a neighbouring word that reaches into the box (a kaf's
 * stroke) is tinted with it. `box` is in bounds space; `scale` the page's; `image` the page as the pager draws it.
 */
export function FollowInk({
  box,
  scale,
  image,
  colour,
  testID,
}: {
  box: Rect;
  scale: number;
  image: { uri: string; width: number; height: number };
  colour: string;
  testID?: string;
}) {
  const left = box.x0 * scale;
  const top = box.y0 * scale;
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={{ position: 'absolute', left, top, width: (box.x1 - box.x0) * scale, height: (box.y1 - box.y0) * scale, overflow: 'hidden' }}
    >
      <Image
        testID={testID ? `${testID}-image` : undefined}
        source={{ uri: image.uri }}
        {...pageImageProps()}
        fadeDuration={0}
        style={{ position: 'absolute', left: -left, top: -top, width: image.width, height: image.height, tintColor: colour }}
      />
    </View>
  );
}
