// "Recording saved · Undo · View" (Majd, Nov 15 2026: "there should be an undo button for it not just view"). Undo
// takes back what was just recorded through lib/recordings (the same delete, with its backup rules); View and the note
// going let the held upload go.

import React from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { RecordingSavedToast, recordingSavedMs } from '../RecordingSavedToast';

jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2 } = jest.requireActual('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(true, 'indigo') }) };
});
const mockUndo = jest.fn();
const mockRelease = jest.fn();
jest.mock('../../../lib/recordings', () => ({
  undoRecording: (...a: unknown[]) => mockUndo(...a),
  releaseUpload: (...a: unknown[]) => mockRelease(...a),
}));
const mockNavigate = jest.fn();
jest.mock('../../../navigation/navigationRef', () => ({ navigateToActivityDay: (...a: unknown[]) => mockNavigate(...a) }));
jest.mock('../../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

const saved = { day: '2026-11-15', recordingId: 'r1', undo: { created: false, segments: ['r1-3.m4a'], fromMs: 60_000 } };
const flush = () => act(async () => undefined);

beforeEach(() => {
  mockUndo.mockReset().mockResolvedValue('dropped');
  mockRelease.mockReset();
  mockNavigate.mockReset();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('offers Undo and View', async () => {
  render(<RecordingSavedToast saved={saved} onClose={jest.fn()} bottomInset={0} />);
  await flush();
  expect(screen.getByText('Recording saved')).toBeTruthy();
  expect(screen.getByText('Undo')).toBeTruthy();
  expect(screen.getByText('View')).toBeTruthy();
});

it('Undo takes back this go (not the whole session’s recording) and closes the note', async () => {
  const onClose = jest.fn();
  render(<RecordingSavedToast saved={saved} onClose={onClose} bottomInset={0} />);
  fireEvent.press(screen.getByTestId('recording-saved-undo'));
  await flush();
  expect(mockUndo).toHaveBeenCalledWith('r1', saved.undo);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(mockRelease).not.toHaveBeenCalled(); // nothing is left to upload from this go
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('a part already backed up: Undo says so, and points to the day', async () => {
  mockUndo.mockResolvedValue('backedUp');
  render(<RecordingSavedToast saved={saved} onClose={jest.fn()} bottomInset={0} />);
  fireEvent.press(screen.getByTestId('recording-saved-undo'));
  await flush();
  expect(Alert.alert).toHaveBeenCalledWith("Couldn't undo", expect.stringContaining('Activity'));
});

it('View lets it upload and opens its day', async () => {
  const onClose = jest.fn();
  render(<RecordingSavedToast saved={saved} onClose={onClose} bottomInset={0} />);
  fireEvent.press(screen.getByTestId('undo-toast-action'));
  expect(mockRelease).toHaveBeenCalledWith('r1');
  expect(mockNavigate).toHaveBeenCalledWith('2026-11-15', 'r1');
  expect(onClose).toHaveBeenCalled();
  expect(mockUndo).not.toHaveBeenCalled();
});

it('going by itself (6 s) lets it upload', async () => {
  jest.useFakeTimers();
  const onClose = jest.fn();
  render(<RecordingSavedToast saved={saved} onClose={onClose} bottomInset={0} />);
  await act(async () => undefined);
  act(() => jest.advanceTimersByTime(recordingSavedMs(false)));
  expect(mockRelease).toHaveBeenCalledWith('r1');
  expect(onClose).toHaveBeenCalled();
  jest.useRealTimers();
});

describe('with a screen reader', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockClear();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
  });
  const said = () => {
    const ios = AccessibilityInfo.announceForAccessibilityWithOptions as unknown as jest.Mock;
    const android = AccessibilityInfo.announceForAccessibility as unknown as jest.Mock;
    return [...(ios.mock?.calls ?? []), ...(android.mock?.calls ?? [])].map((c) => c[0]);
  };

  it('says the note and where Undo is, stays 15 s, and says when the recording is deleted', async () => {
    jest.useFakeTimers();
    const onClose = jest.fn();
    render(<RecordingSavedToast saved={saved} onClose={onClose} bottomInset={0} />);
    await act(async () => undefined);
    expect(said()).toEqual(['Recording saved. Undo and View are at the bottom of the screen.']);
    act(() => jest.advanceTimersByTime(recordingSavedMs(false)));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('recording-saved-undo'));
    await act(async () => undefined);
    expect(said()).toContain('Recording deleted');
    jest.useRealTimers();
  });

  it('says nothing while the microphone is on', async () => {
    render(<RecordingSavedToast saved={saved} onClose={jest.fn()} bottomInset={0} quiet />);
    await flush();
    expect(said()).toEqual([]);
  });
});
