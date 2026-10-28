import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { HiddenPageOverlay } from '../HiddenPageOverlay';
import { hiddenPageLayout } from '../../../lib/recite/hiddenPage';

const colors = { cover: 'paper', guide: 'ink', band: 'accent' };
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, number | string>;

describe('<HiddenPageOverlay />', () => {
  it('covers each line in the page colour, in the image frame (bounds × scale), with a guide line', () => {
    const scale = 0.4;
    render(<HiddenPageOverlay page={1} scale={scale} revealed={new Set()} colors={colors} />);
    const { lines } = hiddenPageLayout(1, new Set());
    const covers = screen.getAllByTestId('hidden-cover');
    expect(covers).toHaveLength(lines.reduce((n, l) => n + l.covers.length, 0));
    const first = flat(covers[0].props.style);
    const [a, b] = lines[0].covers[0];
    expect(first).toMatchObject({
      backgroundColor: 'paper',
      left: a * scale,
      width: (b - a) * scale,
      top: lines[0].top * scale,
      height: (lines[0].bottom - lines[0].top) * scale,
    });
    expect(screen.getAllByTestId('hidden-guide')).toHaveLength(covers.length);
    expect(flat(screen.getAllByTestId('hidden-guide')[0].props.style).backgroundColor).toBe('ink');
  });

  it('one accent band, on the next verse’s line; takes no touches', () => {
    render(<HiddenPageOverlay page={1} scale={0.4} revealed={new Set(['1:1'])} colors={colors} />);
    const bands = screen.getAllByTestId('hidden-band');
    expect(bands).toHaveLength(1);
    expect(flat(bands[0].props.style).backgroundColor).toBe('accent');
    expect(screen.getByTestId('hidden-page-1').props.pointerEvents).toBe('none');
  });

  it('a page fully shown: no covers, no band', () => {
    render(
      <HiddenPageOverlay page={1} scale={0.4} revealed={new Set(['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:7'])} colors={colors} />,
    );
    expect(screen.queryAllByTestId('hidden-cover')).toHaveLength(0);
    expect(screen.queryAllByTestId('hidden-band')).toHaveLength(0);
  });
});
