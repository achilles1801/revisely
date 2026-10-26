import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { touchHandlingAncestor } from '../../../../jest/scrollable';

jest.mock('../../GlassCard', () => ({ GlassCard: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../TimerControls', () => ({ TimerControls: () => null }));
jest.mock('../../../context/ThemeContext', () => {
  const { colors } = require('../../../theme/colors');
  return { useTheme: () => ({ theme: colors, isDark: false }) };
});

import { TimerSheet } from '../TimerSheet';

describe('TimerSheet', () => {
  it('its controls scroll on a small screen or with large text: nothing above them takes the touch', () => {
    render(<TimerSheet visible onClose={jest.fn()} />);
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(touchHandlingAncestor(scroll)).toBeNull();
  });

  it('a tap on the dimmed backdrop closes it', () => {
    const onClose = jest.fn();
    render(<TimerSheet visible onClose={onClose} />);
    const { fireEvent } = require('@testing-library/react-native');
    fireEvent.press(screen.getByLabelText('Dismiss timer'));
    expect(onClose).toHaveBeenCalled();
  });
});
