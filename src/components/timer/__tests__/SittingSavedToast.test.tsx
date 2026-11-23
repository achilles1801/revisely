// "Saved to today: … · Undo · View" (REC-1, Nov 15 2026): Undo takes back the sitting and the recording that ended with
// it; View and the note going let the recording's held upload go.
import React from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SittingSavedToast } from '../SittingSavedToast';

jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2 } = jest.requireActual('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(false, 'indigo') }) };
});
const mockUndoSitting = jest.fn();
jest.mock('../../../lib/sitting', () => ({ undoSitting: (...a: unknown[]) => mockUndoSitting(...a) }));
const mockRelease = jest.fn();
jest.mock('../../../lib/recordings', () => ({ releaseUpload: (...a: unknown[]) => mockRelease(...a) }));
const mockNavigate = jest.fn();
jest.mock('../../../navigation/navigationRef', () => ({ navigateToActivityDay: (...a: unknown[]) => mockNavigate(...a) }));
jest.mock('../../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

const saved = {
  day: '2026-11-15',
  text: 'Saved to today: Al-Mulk, ayahs 1–26, 41 min',
  sessionId: 's1',
  recording: { recordingId: 'r1', undo: { created: true, segments: ['r1-0.m4a'], fromMs: 0 } },
};
const flush = () => act(async () => undefined);

beforeEach(() => {
  mockUndoSitting.mockReset().mockResolvedValue('done');
  mockRelease.mockReset();
  mockNavigate.mockReset();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('[REC-1] says what was saved, with Undo and View', async () => {
  render(<SittingSavedToast saved={saved} onClose={jest.fn()} bottomInset={0} />);
  await flush();
  expect(screen.getByText(saved.text)).toBeTruthy();
  expect(screen.getByText('Undo')).toBeTruthy();
  expect(screen.getByText('View')).toBeTruthy();
});

it('[REC-1] Undo takes back the sitting and its recording together, and closes the note', async () => {
  const onClose = jest.fn();
  render(<SittingSavedToast saved={saved} onClose={onClose} bottomInset={0} />);
  fireEvent.press(screen.getByTestId('sitting-saved-undo'));
  await flush();
  expect(mockUndoSitting).toHaveBeenCalledWith(saved);
  expect(onClose).toHaveBeenCalled();
  expect(mockRelease).not.toHaveBeenCalled();
});

it('[REC-1] part of the recording already backed up: the sitting goes, and it says the recording stays', async () => {
  mockUndoSitting.mockResolvedValue('recordingBackedUp');
  render(<SittingSavedToast saved={saved} onClose={jest.fn()} bottomInset={0} />);
  fireEvent.press(screen.getByTestId('sitting-saved-undo'));
  await flush();
  expect(Alert.alert).toHaveBeenCalledWith('The sitting is deleted', expect.stringContaining('Activity'));
});

it('[REC-1] View opens its day and lets the recording upload; the note going lets it upload too', async () => {
  jest.useFakeTimers();
  const onClose = jest.fn();
  const { rerender } = render(<SittingSavedToast saved={saved} onClose={onClose} bottomInset={0} />);
  fireEvent.press(screen.getByTestId('undo-toast-action'));
  expect(mockNavigate).toHaveBeenCalledWith('2026-11-15');
  expect(mockRelease).toHaveBeenCalledWith('r1');
  mockRelease.mockClear();
  rerender(<SittingSavedToast saved={null} onClose={onClose} bottomInset={0} />);
  rerender(<SittingSavedToast saved={{ ...saved, sessionId: 's2' }} onClose={onClose} bottomInset={0} />);
  await act(async () => undefined);
  act(() => jest.advanceTimersByTime(6_000));
  expect(mockRelease).toHaveBeenCalledWith('r1');
  jest.useRealTimers();
});

it('[REC-1] with a screen reader: said once, and what Undo deleted is said', async () => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockClear();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
  const said = () =>
    [
      ...((AccessibilityInfo.announceForAccessibilityWithOptions as unknown as jest.Mock).mock?.calls ?? []),
      ...((AccessibilityInfo.announceForAccessibility as unknown as jest.Mock).mock?.calls ?? []),
    ].map((c) => c[0]);
  render(<SittingSavedToast saved={saved} onClose={jest.fn()} bottomInset={0} />);
  await flush();
  expect(said()).toEqual([`${saved.text}. Undo and View are at the bottom of the screen.`]);
  fireEvent.press(screen.getByTestId('sitting-saved-undo'));
  await flush();
  expect(said()).toContain('Sitting and its recording deleted');
});
