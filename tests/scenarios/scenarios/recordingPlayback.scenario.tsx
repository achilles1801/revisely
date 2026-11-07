// A recording's player (BEHAVIOUR.md, AUDIO-4): the day's recordings and Listen
// back play through hooks/useRecordingPlayback. When they go away (another day
// picked, the screen closed) the player must be freed: remove() alone only lets
// go of it, and on Android it played on with nothing on screen to stop it.
// expo-audio is stood in by harness/androidMedia's player, which records release().
const mockCreated: Array<{ released: boolean }> = [];
jest.mock('expo-audio', () => {
  const { expoAudio } = require('../harness/androidMedia');
  return {
    ...expoAudio,
    createAudioPlayer: (...args: unknown[]) => {
      const p = expoAudio.createAudioPlayer(...args);
      mockCreated.push(p);
      return p;
    },
  };
});
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});

import { act, renderHook } from '@testing-library/react-native';
import { useRecordingPlayback } from '../../../src/hooks/useRecordingPlayback';
import type { RecordingMeta } from '../../../src/lib/recordings';

const recording = {
  id: 'r1',
  kind: 'revision',
  day: '2026-11-06',
  createdAt: Date.UTC(2026, 10, 6, 18),
  durationMs: 4_000,
  uri: 'file:///doc/r1-0.m4a',
  segments: [{ uri: 'file:///doc/r1-0.m4a', durationMs: 4_000, fileName: 'r1-0.m4a', local: true }],
  pageMarks: [{ atMs: 0, page: 5 }],
  sizeBytes: 1000,
  backedUp: false,
} as unknown as RecordingMeta;

beforeEach(() => {
  mockCreated.length = 0;
});

describe('a recording playing when its list goes away', () => {
  it('[AUDIO-4] another day picked or the screen closed while a recording plays: it stops, and its player is freed', () => {
    const { result, unmount } = renderHook(() => useRecordingPlayback());
    act(() => {
      void result.current.play(recording);
    });
    expect(result.current.playingId).toBe('r1');
    expect(mockCreated).toHaveLength(1);

    unmount();
    expect(mockCreated[0].released).toBe(true);
  });

  it('[AUDIO-4] a list that never played anything has no player to free', () => {
    const { unmount } = renderHook(() => useRecordingPlayback());
    unmount();
    expect(mockCreated).toHaveLength(0);
  });
});
