// Every Activity row's figure and its words stay on one line and never push the name aside (BEHAVIOUR.md ACT-37; Majd,
// Nov 27 2026: "the consistency text on the right as u can see is too much and starts to break the formatting -- this
// should never happen for any of them"): values measured with the system font's own widths (jest/textWidth) against the
// room a row gives them on an iPhone SE, then the rows themselves: one line each, stacked above the usual size, and the
// Ramadan row on its band.
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { textWidth } from '../../../../jest/textWidth';
import { consistencyRow, coverageRow, gapsRow, pagesRow, paceRow, recitationRow, ROW_STACK_AT, type RowValue } from '../../../lib/activityRowValues';
import { RamadanRow, ramadanRowValue } from '../../ramadan/RamadanRow';
import { SectionRow } from '../SectionRow';
import { CHROME_MAX_SCALE } from '../ChromeText';
import { paletteV2, ramadanV2 } from '../../../theme/v2';

const mockPalette = paletteV2(false, 'indigo');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));

/** An iPhone SE's width, and the row's margin and padding (layoutV2.gutter each side). */
const SE_WIDTH = 320;
const GUTTER = 16;
/** The figure's room: half the row (SectionRow's and RamadanRow's `maxWidth: '50%'`). */
const ROOM = (SE_WIDTH - 2 * GUTTER) / 2;
/** Between the figure and its words, side by side. */
const GAP = 4;

/** How wide the value is drawn: side by side just under the stacking size, and stacked at the row's largest. */
function widths(v: Pick<RowValue, 'figure' | 'unit'>): { inline: number; stacked: number } {
  const figure = textWidth(v.figure, 'figure@20');
  const unit = v.unit ? textWidth(v.unit, 'meta@13') : 0;
  return {
    inline: (figure + (v.unit ? GAP + unit : 0)) * ROW_STACK_AT,
    stacked: Math.max(figure, unit) * CHROME_MAX_SCALE,
  };
}

function expectFits(name: string, v: Pick<RowValue, 'figure' | 'unit'>) {
  const w = widths(v);
  const said = `${name}: "${v.figure}" "${v.unit ?? ''}"`;
  expect({ said, inline: w.inline <= ROOM }).toEqual({ said, inline: true });
  expect({ said, stacked: w.stacked <= ROOM }).toEqual({ said, stacked: true });
}

// Every value at the largest numbers a row can show is measured in tests/scenarios/properties/activityRows.property.ts;
// here, a few, and the rows themselves.
describe('[ACT-37] the values fit half the row on an SE', () => {
  it('the longest of each row’s values fit, and the old words did not', () => {
    expectFits('Consistency', consistencyRow(1826, 1826));
    expectFits('Gaps', gapsRow(0));
    expectFits('Gaps', gapsRow(13));
    expectFits('Gaps', gapsRow(364));
    expectFits('Coverage', coverageRow(100, null));
    expectFits('Coverage', coverageRow(0, '99.9'));
    expectFits('Pages', pagesRow(604));
    expectFits('Pace', paceRow(99));
    expectFits('Recitation', recitationRow(0.988)!);
    expectFits('Ramadan', ramadanRowValue({ phase: { kind: 'during', day: 30, lastTen: true }, stats: { revisedDays: [], covered: 0 }, dates: { start: '2027-02-08', eid: '2027-03-10' } } as never));
    expect(widths({ figure: '7', unit: 'of the last 7 days · 8 of 9 since 19 November' }).inline).toBeGreaterThan(ROOM);
    expect(widths({ figure: 'Today', unit: 'you revised, after a 12-day gap' }).inline).toBeGreaterThan(ROOM);
  });
});

describe('[ACT-37] the rows keep each part on one line, the words under the figure above the usual size', () => {
  let dims: jest.SpyInstance | null = null;
  const at = (fontScale: number) => {
    dims?.mockRestore();
    dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: SE_WIDTH, height: 568, scale: 2, fontScale });
  };
  afterEach(() => {
    dims?.mockRestore();
    dims = null;
  });

  it('side by side at the usual size, stacked above it; never more than one line each', () => {
    for (const [scale, direction] of [
      [1, 'row'],
      [ROW_STACK_AT, 'column'],
      [CHROME_MAX_SCALE, 'column'],
    ] as const) {
      at(scale);
      const v = consistencyRow(7, 7);
      render(<SectionRow title="Consistency" line="Mostly 5–7 PM" figure={v.figure} unit={v.unit} onPress={jest.fn()} testID="row" />);
      expect(StyleSheet.flatten(screen.getByTestId('row-figure').props.style).flexDirection).toBe(direction);
      expect(screen.getByTestId('row-number').props.numberOfLines).toBe(1);
      expect(screen.getByTestId('row-unit').props.numberOfLines).toBe(1);
      expect(screen.getByTestId('row-unit')).toHaveTextContent('of 7 days');
      screen.unmount();
    }
  });

  it('the Ramadan row stands out on its band, edged in the theme’s gold', () => {
    at(1);
    const month = {
      phase: { kind: 'during', day: 12, lastTen: false },
      stats: { revisedDays: ['2027-02-08', '2027-02-09'], covered: 40 },
      dates: { start: '2027-02-08', eid: '2027-03-10' },
    };
    render(<RamadanRow month={month as never} onPress={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByTestId('ramadan-row').props.style);
    const tokens = ramadanV2(false, mockPalette.accent);
    expect(style.backgroundColor).toBe(tokens.band);
    expect(style.borderColor).toBe(tokens.bandEdge);
    expect(style.borderRadius).toBeGreaterThan(0);
    expect(screen.getByTestId('ramadan-row-figure')).toHaveTextContent('2of 12 days');
  });
});
