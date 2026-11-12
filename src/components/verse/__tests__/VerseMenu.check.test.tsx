import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});

import { VerseMenu } from '../VerseMenu';

const base = {
  point: { x: 100, y: 200 },
  onPlay: jest.fn(),
  onTranslation: jest.fn(),
  onCopy: jest.fn(),
  onShare: jest.fn(),
  onClose: jest.fn(),
  verseLabel: 'Al-Baqarah 2:6',
};

describe('<VerseMenu /> recitation check row', () => {
  it('is offered only when the screen passes it (Revisely Dev, testers)', () => {
    render(<VerseMenu {...base} />);
    expect(screen.queryByText('Check my recitation')).toBeNull();
  });

  it('starts a check from the held verse', () => {
    const onCheck = jest.fn();
    render(<VerseMenu {...base} onCheckRecitation={onCheck} />);
    expect(screen.getByText('From this ayah')).toBeTruthy();
    fireEvent.press(screen.getByText('Check my recitation'));
    expect(onCheck).toHaveBeenCalled();
  });
});
