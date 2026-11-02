import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});

import { listenLabel, RecitePanel } from '../RecitePanel';

const surface = { background: 'bg', border: 'line' };

describe('<RecitePanel />', () => {
  it('says what listening is doing', () => {
    expect(listenLabel('listening', false)).toBe('Listening');
    expect(listenLabel('listening', true)).toBe('Hearing you');
    expect(listenLabel('off', false)).toBe('Mic off');
    expect(listenLabel('paused', false)).toBe('Paused · tap the mic');
    expect(listenLabel('denied', false)).toBe('Microphone is off');
  });

  it('the mic switches listening; Next verse shows the next one; the slots follow', () => {
    const onToggle = jest.fn();
    const onNext = jest.fn();
    render(
      <RecitePanel
        status="listening"
        hearing={false}
        onToggleListening={onToggle}
        onNextVerse={onNext}
        nextDisabled={false}
        surface={surface}
        record={<></>}
      />,
    );
    const mic = screen.getByTestId('recite-mic');
    expect(mic.props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(mic);
    expect(onToggle).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Show the next verse'));
    expect(onNext).toHaveBeenCalled();
  });

  it('nothing left to show: Next verse is off', () => {
    const onNext = jest.fn();
    render(
      <RecitePanel status="off" hearing={false} onToggleListening={jest.fn()} onNextVerse={onNext} nextDisabled surface={surface} />,
    );
    fireEvent.press(screen.getByTestId('recite-next'));
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByTestId('recite-mic').props.accessibilityState).toMatchObject({ checked: false });
  });

  it('microphone refused: the mic points to Settings instead', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onToggle = jest.fn();
    render(
      <RecitePanel status="denied" hearing={false} onToggleListening={onToggle} onNextVerse={jest.fn()} nextDisabled={false} surface={surface} />,
    );
    fireEvent.press(screen.getByTestId('recite-mic'));
    expect(alert).toHaveBeenCalledWith('Microphone access is off', expect.any(String), expect.any(Array));
    expect(onToggle).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
