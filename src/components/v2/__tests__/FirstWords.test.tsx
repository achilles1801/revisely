import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FirstWords } from '../FirstWords';

jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2, DEFAULT_ACCENT } = jest.requireActual('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(false, DEFAULT_ACCENT) }) };
});

describe('[NAME-2] a page’s first words', () => {
  it('between « », on one line, and VoiceOver skips them', () => {
    render(<FirstWords words="قُلْ هُوَ" />);
    const el = screen.getByTestId('first-words', { includeHiddenElements: true });
    expect(el.props.children).toBe('«قُلْ هُوَ»');
    expect(el.props.numberOfLines).toBe(1);
    expect(el.props.accessibilityElementsHidden).toBe(true);
    expect(el.props.importantForAccessibility).toBe('no');
  });

  it('nothing without words', () => {
    render(<FirstWords words="" />);
    expect(screen.queryByTestId('first-words', { includeHiddenElements: true })).toBeNull();
  });
});
