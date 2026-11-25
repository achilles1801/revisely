import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

type Listener = (e?: unknown) => void;
const mockListeners: Record<string, Listener[]> = {};
const mockNative = {
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  addListener: jest.fn((event: string, fn: Listener) => {
    (mockListeners[event] ??= []).push(fn);
    return { remove: () => (mockListeners[event] = mockListeners[event].filter((f) => f !== fn)) };
  }),
};
let mockPresent = true;
jest.mock('../../../lib/revo/dictation', () => ({
  dictation: () => (mockPresent ? mockNative : null),
  dictationLang: (l: string) => (l === 'ar' ? 'ar-SA' : 'en-US'),
}));

import { ThemeProvider } from '../../../context/ThemeContext';
import { RevoComposer } from '../RevoComposer';

const emit = (event: string, e?: unknown) => act(() => (mockListeners[event] ?? []).slice().forEach((f) => f(e)));

async function composer(onSend = jest.fn()) {
  const r = render(
    <ThemeProvider>
      <RevoComposer onSend={onSend} onAdd={() => {}} attachments={[]} onRemoveAttach={() => {}} disabled={false} disabledText="" busy={false} />
    </ThemeProvider>,
  );
  await r.findByTestId('revo-input'); // the theme loads first
  return r;
}

beforeEach(() => {
  mockPresent = true;
  jest.clearAllMocks();
  for (const k of Object.keys(mockListeners)) delete mockListeners[k];
});

it('[REVO-42] the mic writes what is heard into the field, and nothing is sent until send', async () => {
  const onSend = jest.fn();
  const r = await composer(onSend);
  await act(async () => fireEvent.press(r.getByTestId('revo-mic')));
  expect(mockNative.requestPermissionsAsync).toHaveBeenCalled();
  expect(mockNative.start).toHaveBeenCalledWith(expect.objectContaining({ lang: 'en-US', interimResults: true }));
  emit('result', { isFinal: false, results: [{ transcript: 'How is my' }] });
  expect(r.getByTestId('revo-input').props.value).toBe('How is my');
  emit('result', { isFinal: true, results: [{ transcript: 'How is my week' }] });
  expect(r.getByTestId('revo-input').props.value).toBe('How is my week');
  fireEvent.press(r.getByTestId('revo-dictate-stop'));
  expect(mockNative.stop).toHaveBeenCalled();
  emit('end');
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.press(r.getByTestId('revo-send'));
  expect(onSend).toHaveBeenCalledWith('How is my week');
});

it('[REVO-42] refused: no listening, and the field says to allow speech recognition', async () => {
  mockNative.requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
  const r = await composer();
  await act(async () => fireEvent.press(r.getByTestId('revo-mic')));
  expect(mockNative.start).not.toHaveBeenCalled();
  expect(r.getByTestId('revo-input').props.placeholder).toMatch(/Allow speech recognition/);
});

it('[REVO-42] a build without the speech module has no mic: the field ends in send', async () => {
  mockPresent = false;
  const r = await composer();
  expect(r.queryByTestId('revo-mic')).toBeNull();
  expect(r.getByTestId('revo-send')).toBeTruthy();
});
