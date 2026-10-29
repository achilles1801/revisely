import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
let mockNet = 'wifi';
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(async () => ({ type: mockNet })) }));
let mockState: Record<string, unknown> = { status: 'missing', error: null };
const mockStart = jest.fn();
const mockCancel = jest.fn();
jest.mock('../../../lib/recite/speechModelStore', () => ({
  useSpeechModelState: () => mockState,
  startModelDownload: () => mockStart(),
  cancelModelDownload: () => mockCancel(),
}));
jest.mock('../../../lib/recite/speechModel', () => ({ formatModelSize: () => '57 MB' }));

import { SpeechModelSheet } from '../SpeechModelSheet';

beforeEach(() => {
  jest.clearAllMocks();
  mockNet = 'wifi';
  mockState = { status: 'missing', error: null };
});

describe('<SpeechModelSheet />', () => {
  it('what it does, on the phone (the voice never recorded or sent), and its size', async () => {
    render(<SpeechModelSheet visible onClose={jest.fn()} onReady={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByText(/show each word as you say it/)).toBeTruthy();
    expect(screen.getByTestId('speech-model-privacy')).toHaveTextContent('It works on this iPhone: your voice isn’t recorded or sent anywhere.');
    expect(screen.getByTestId('speech-model-note')).toHaveTextContent('A one-time download of 57 MB.');
    fireEvent.press(screen.getByTestId('speech-model-download'));
    expect(mockStart).toHaveBeenCalled();
  });

  it('on mobile data: says so before downloading', async () => {
    mockNet = 'cellular';
    render(<SpeechModelSheet visible onClose={jest.fn()} onReady={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('speech-model-note')).toHaveTextContent(/You’re on mobile data/);
    expect(screen.getByText('Download on mobile data')).toBeTruthy();
  });

  it('downloading: the progress, that closing doesn’t stop it, and Cancel', async () => {
    mockState = { status: 'downloading', progress: 0.42 };
    render(<SpeechModelSheet visible onClose={jest.fn()} onReady={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByText(/Downloading 42% of 57 MB. You can close this; it carries on./)).toBeTruthy();
    fireEvent.press(screen.getByTestId('speech-model-cancel'));
    expect(mockCancel).toHaveBeenCalled();
  });

  it('a failure says what to do; ready calls onReady', async () => {
    mockState = { status: 'missing', error: 'Free up 57 MB or more on this iPhone, then try again.' };
    const onReady = jest.fn();
    const view = render(<SpeechModelSheet visible onClose={jest.fn()} onReady={onReady} />);
    await act(async () => {});
    expect(screen.getByTestId('speech-model-note')).toHaveTextContent(/Free up 57 MB/);
    mockState = { status: 'ready', bytes: 1 };
    view.rerender(<SpeechModelSheet visible onClose={jest.fn()} onReady={onReady} />);
    await act(async () => {});
    expect(onReady).toHaveBeenCalled();
  });
});
