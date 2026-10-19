import { act, renderHook } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';

const mockRecorder = {
  uri: 'cache/rec.m4a' as string | null,
  prepareToRecordAsync: jest.fn(() => Promise.resolve()),
  record: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
};
let mockStatusListener: ((s: any) => void) | undefined;
const mockPerms = { get: jest.fn(), request: jest.fn() };
const mockSetAudioMode = jest.fn((_mode?: any) => Promise.resolve());

jest.mock('expo-audio', () => ({
  AudioQuality: { LOW: 32 },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
  useAudioRecorder: (_opts: any, listener: (s: any) => void) => {
    mockStatusListener = listener;
    return mockRecorder;
  },
  getRecordingPermissionsAsync: () => mockPerms.get(),
  requestRecordingPermissionsAsync: () => mockPerms.request(),
  setAudioModeAsync: (mode: any) => mockSetAudioMode(mode),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'm' },
  NotificationFeedbackType: { Success: 's' },
}));
const mockStopRecitation = jest.fn();
jest.mock('../../lib/recitation', () => ({ getRecitation: () => ({ stop: mockStopRecitation }) }));
const mockSave = jest.fn((_uri: string, _info: any) => Promise.resolve({ id: 'x' }));
jest.mock('../../lib/recordings', () => ({
  saveRecording: (uri: string, info: any) => mockSave(uri, info),
  setRecordingActive: jest.fn(),
}));
jest.mock('../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

import { useVoiceRecorder } from '../useVoiceRecorder';

let appStateListeners: Array<(s: string) => void> = [];
beforeEach(() => {
  jest.clearAllMocks();
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e: any, l: any) => {
    appStateListeners.push(l);
    return { remove: () => undefined } as any;
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockPerms.get.mockResolvedValue({ granted: true, canAskAgain: true });
  mockPerms.request.mockResolvedValue({ granted: true });
  mockRecorder.uri = 'cache/rec.m4a';
});

const setup = (props: Partial<Parameters<typeof useVoiceRecorder>[0]> = {}) =>
  renderHook((p: Parameters<typeof useVoiceRecorder>[0]) => useVoiceRecorder(p), {
    initialProps: { kind: 'revision', day: '2026-10-19', currentPage: 12, ...props } as any,
  });

describe('useVoiceRecorder', () => {
  it('records, notes page changes and saves on stop, then restores playback routing', async () => {
    const onSaved = jest.fn();
    const { result, rerender } = setup({ onSaved });
    await act(() => result.current.start());
    expect(result.current.phase).toBe('recording');
    expect(mockStopRecitation).toHaveBeenCalled();
    expect(mockSetAudioMode).toHaveBeenCalledWith(expect.objectContaining({ allowsRecording: true }));
    rerender({ kind: 'revision', day: '2026-10-19', currentPage: 13, onSaved } as any);
    await act(() => result.current.stop());
    expect(mockSave).toHaveBeenCalledTimes(1);
    const [uri, info] = mockSave.mock.calls[0];
    expect(uri).toBe('cache/rec.m4a');
    expect(info.kind).toBe('revision');
    expect(info.day).toBe('2026-10-19');
    expect(info.pageMarks.map((m: any) => m.page)).toEqual([12, 13]);
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false }));
    expect(onSaved).toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('asks for the microphone the first time', async () => {
    mockPerms.get.mockResolvedValue({ granted: false, canAskAgain: true });
    const { result } = setup();
    await act(() => result.current.start());
    expect(mockPerms.request).toHaveBeenCalled();
    expect(result.current.phase).toBe('recording');
  });

  it('points to Settings when the microphone was refused, and does not record', async () => {
    mockPerms.get.mockResolvedValue({ granted: false, canAskAgain: false });
    const { result } = setup();
    await act(() => result.current.start());
    expect(mockPerms.request).not.toHaveBeenCalled();
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Microphone access is off', expect.any(String), expect.any(Array));
    expect(result.current.phase).toBe('idle');
  });

  it('saves when the app leaves the foreground', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    await act(async () => appStateListeners.forEach((l) => l('background')));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
  });

  it('saves what was recorded when iOS interrupts it (a call)', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    await act(async () => mockStatusListener?.({ hasError: true, error: 'interrupted', isFinished: false }));
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('saves when the screen closes', async () => {
    const { result, unmount } = setup();
    await act(() => result.current.start());
    await act(async () => unmount());
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('stop twice saves once', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    await act(async () => {
      await Promise.all([result.current.stop(), result.current.stop()]);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a revision day', async () => {
    const { result } = setup({ day: null });
    await act(() => result.current.start());
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });

  it('explains when saving fails (e.g. storage full)', async () => {
    mockSave.mockRejectedValueOnce(new Error('ENOSPC'));
    const { result } = setup();
    await act(() => result.current.start());
    await act(() => result.current.stop());
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't save the recording", expect.any(String));
    expect(result.current.phase).toBe('idle');
  });
});
