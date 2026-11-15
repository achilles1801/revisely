// The mark card's rows at the largest text: the label goes above its phrase. Beside it, in a 66 pt column, "Expected"
// broke mid-word on an SE at the largest Dynamic Type (Nov 15 2026, simulator).
import React from 'react';
import { Dimensions, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Row, STACK_ROWS_AT } from '../MarkParts';

const mockPalette = require('../../../theme/v2').paletteV2(false, 'indigo');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

let dims: jest.SpyInstance | null = null;
afterEach(() => {
  dims?.mockRestore();
  dims = null;
});
const at = (fontScale: number) => {
  dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 667, scale: 2, fontScale });
  render(
    <Row label="Expected" first>
      <Text>وَأُوتِيَتْ</Text>
    </Row>,
  );
};

describe('the mark card’s rows', () => {
  it('beside their phrase at normal sizes', () => {
    at(1);
    expect(screen.queryByTestId('mark-card-row-stacked')).toBeNull();
  });

  it(`above it from ${STACK_ROWS_AT}×, so a label never breaks mid-word`, () => {
    at(3.1);
    expect(screen.getByTestId('mark-card-row-stacked')).toBeTruthy();
    expect(screen.getByText('Expected')).toBeTruthy();
  });
});
