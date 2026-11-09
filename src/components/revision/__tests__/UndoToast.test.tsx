// The undo bar is seen from its first frame, whatever its entrance animation does. It used to
// fade in from opacity 0, started from an effect as it mounted; on Android that first animation
// was now and then lost, and the bar stayed there fully transparent for its five seconds: the
// note was deleted with no Undo to see (E2E flow 05 on the Android emulator, about 1 run in 10:
// Maestro found the bar at its place but "invisible", Nov 8 2026).

import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { UndoToast } from '../UndoToast';

jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2 } = jest.requireActual('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(false, 'indigo') }) };
});

const opacityOf = (testID: string): number => {
  const style = StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};
  return typeof style.opacity === 'number' ? style.opacity : 1;
};

it('is fully opaque on its first frame, with its action', () => {
  render(<UndoToast visible message="Note deleted" onUndo={() => undefined} onDismiss={() => undefined} />);
  expect(opacityOf('undo-toast')).toBe(1);
  expect(opacityOf('undo-toast-bar')).toBe(1);
  expect(screen.getByText('Undo')).toBeTruthy();
});

it('runs its action, and goes after its time', () => {
  jest.useFakeTimers();
  const onUndo = jest.fn();
  const onDismiss = jest.fn();
  render(<UndoToast visible message="Note deleted" onUndo={onUndo} onDismiss={onDismiss} duration={5000} />);
  fireEvent.press(screen.getByTestId('undo-toast-action'));
  expect(onUndo).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(4999);
  expect(onDismiss).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

it('shows nothing while not visible', () => {
  render(<UndoToast visible={false} message="Note deleted" onUndo={() => undefined} onDismiss={() => undefined} />);
  expect(screen.queryByTestId('undo-toast')).toBeNull();
});
