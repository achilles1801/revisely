import React from 'react';
import { StyleSheet } from 'react-native';
import { wordLayers } from '../wordLayers';
import { quranWords } from '../../../lib/recite/__fixtures__/quranWords';
import { fitPage } from '../../../lib/pageFit';

const words = quranWords();

function covers(page: number, scale: number) {
  const { over } = wordLayers({
    words,
    page,
    scale,
    status: () => 'pending',
    position: null,
    hide: true,
    revealed: () => false,
    past: null,
    pageColor: '#fff',
    inkColor: '#000',
  });
  return (over as React.ReactElement<{ style: unknown }>[]).map((el) => ({
    key: el.key as string,
    style: StyleSheet.flatten(el.props.style as never) as { left: number; top: number; width: number; height: number },
  }));
}

describe('word covers', () => {
  // The pager draws the page at fitPage's size and hands its scale to the layers,
  // the same scale the verse highlight uses (r.x0 * scale, ...).
  it.each([
    ['iPhone SE, bar shown', 375, 520],
    ['iPhone 17 Pro Max, bar hidden', 440, 860],
    ['iPad', 820, 1100],
  ])('cover each word on its page image (%s)', (_label, width, height) => {
    const { scale } = fitPage(width, height);
    const [from, to] = words.pageRange(3);
    const drawn = covers(3, scale);
    expect(drawn).toHaveLength(to - from);
    drawn.forEach(({ style }, k) => {
      const r = words.rect(from + k);
      // The word's full box (its whole line's height: ascenders, dots and
      // vowel marks), and a little more on every side.
      expect(style.left).toBeLessThanOrEqual(r.x0 * scale);
      expect(style.left + style.width).toBeGreaterThanOrEqual(r.x1 * scale);
      expect(style.top).toBeLessThanOrEqual(r.y0 * scale);
      expect(style.top + style.height).toBeGreaterThanOrEqual(r.y1 * scale);
      expect(style.left).toBeGreaterThan(r.x0 * scale - 3);
      expect(style.top).toBeGreaterThan(r.y0 * scale - 3);
    });
  });

  it('draws nothing over words already recited', () => {
    const { over } = wordLayers({
      words,
      page: 3,
      scale: 0.4,
      status: () => 'correct',
      position: null,
      hide: true,
      revealed: () => false,
      past: null,
      pageColor: '#fff',
      inkColor: '#000',
    });
    expect(over).toHaveLength(0);
  });
});
