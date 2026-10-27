import React from 'react';
import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useVerseActions } from '../useVerseActions';
import { AudioOptionsSheet } from '../AudioOptionsSheet';
import { updateAudioOptions } from '../../../lib/audioOptions';
import { DEFAULT_PLAYBACK } from '../../../lib/playbackPlan';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'm' } }));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('../VerseSheet', () => ({ VerseSheet: () => null }));
jest.mock('../VerseMenu', () => ({ VerseMenu: () => null }));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: null, saveUser: jest.fn() }) }));
jest.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { textPrimary: '#000', accent: '#0a0' } }),
}));
let mockCapturing = false;
jest.mock('../../../lib/recordings', () => ({ isRecordingActive: () => mockCapturing }));
const mockRecitation = {
  getState: () => ({ status: 'idle', verse: null }),
  subscribe: () => () => {},
  stop: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  setVoice: jest.fn(),
  setOptions: jest.fn(),
};
jest.mock('../../../lib/recitation', () => ({
  ...jest.requireActual('../../../lib/recitation'),
  getRecitation: () => mockRecitation,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCapturing = false;
});

describe('useVerseActions: Audio Options', () => {
  afterEach(() => updateAudioOptions(DEFAULT_PLAYBACK));

  it('Play up to Page: ▶ plays to the last verse that begins on the page', () => {
    const { result } = renderHook(() => useVerseActions({ pages: [2, 3, 4], currentPage: 3 }));
    // After the account's settings have loaded (none here: signed out).
    act(() => updateAudioOptions({ playUpTo: 'page' }));
    act(() => result.current.player.onPlayPage(3));
    const [verse, advance] = mockRecitation.play.mock.calls[0];
    expect(verse).toEqual({ page: 3, sura: 2, ayah: 6 });
    expect(advance({ sura: 2, ayah: 15 })).toEqual({ sura: 2, ayah: 16 });
    expect(advance({ sura: 2, ayah: 16 })).toBeNull();
  });

  it('speed, repeats and the pause go to the player', () => {
    renderHook(() => useVerseActions({ pages: [3], currentPage: 3 }));
    act(() => updateAudioOptions({ speed: 1.5, repeat: 3, pauseFactor: 1 }));
    expect(mockRecitation.setOptions).toHaveBeenLastCalledWith({ speed: 1.5, repeat: 3, pauseFactor: 1 });
  });

  it('▶ in Audio Options plays its range; previous and next stay inside it', () => {
    let listener: (s: unknown) => void = () => {};
    const subscribe = mockRecitation.subscribe;
    mockRecitation.subscribe = ((l: (s: unknown) => void) => {
      listener = l;
      return () => {};
    }) as typeof mockRecitation.subscribe;
    try {
      const { result } = renderHook(() => useVerseActions({ pages: [2, 3, 4], currentPage: 3 }));
      act(() => result.current.player.onOptions());
      const sheet = React.Children.toArray(result.current.overlay.props.children).find(
        (c) => React.isValidElement(c) && c.type === AudioOptionsSheet,
      ) as React.ReactElement<React.ComponentProps<typeof AudioOptionsSheet>>;
      expect(sheet.props.visible).toBe(true);
      // From starts at the first verse beginning on the page on screen.
      expect(sheet.props.start).toEqual({ sura: 2, ayah: 6 });
      act(() => sheet.props.onPlay({ from: { sura: 2, ayah: 8 }, to: { sura: 2, ayah: 10 } }));
      const [verse, advance, owner] = mockRecitation.play.mock.calls[0];
      expect(verse).toEqual({ sura: 2, ayah: 8 });
      expect(advance({ sura: 2, ayah: 9 })).toEqual({ sura: 2, ayah: 10 });
      expect(advance({ sura: 2, ayah: 10 })).toBeNull();
      // Playing the first verse of the range: no previous; next is inside it.
      act(() => listener({ status: 'playing', verse: { sura: 2, ayah: 8 }, owner }));
      expect(result.current.player.onPrevious).toBeUndefined();
      expect(result.current.player.onNext).toBeDefined();
      act(() => listener({ status: 'playing', verse: { sura: 2, ayah: 10 }, owner }));
      expect(result.current.player.onNext).toBeUndefined();
      expect(result.current.player.onPrevious).toBeDefined();
    } finally {
      mockRecitation.subscribe = subscribe;
    }
  });
});

describe('useVerseActions: ▶ in the controls', () => {
  it('recites from the top of the page on screen, on to the end of the juz within the pages', () => {
    const { result } = renderHook(() => useVerseActions({ pages: [2, 3, 4], currentPage: 3 }));
    act(() => result.current.player.onPlayPage(3));
    expect(mockRecitation.play).toHaveBeenCalledTimes(1);
    const [verse, advance] = mockRecitation.play.mock.calls[0];
    expect(verse).toEqual({ page: 3, sura: 2, ayah: 6 });
    // It carries on through the screen's pages, and stops at their end.
    expect(advance({ sura: 2, ayah: 6 })).toEqual({ sura: 2, ayah: 7 });
    expect(advance({ sura: 2, ayah: 24 })).toBeNull(); // 2:25 is on page 5
  });

  it('a page that is all one verse begun on the page before (48: 2:282) plays that verse', () => {
    const { result } = renderHook(() => useVerseActions({ pages: [47, 48, 49], currentPage: 48 }));
    act(() => result.current.player.onPlayPage(48));
    expect(mockRecitation.play.mock.calls[0][0]).toMatchObject({ sura: 2, ayah: 282 });
  });

  it('plays nothing for a page outside the screen’s pages', () => {
    const { result } = renderHook(() => useVerseActions({ pages: [2, 3], currentPage: 3 }));
    act(() => result.current.player.onPlayPage(50));
    expect(mockRecitation.play).not.toHaveBeenCalled();
  });

  it('not while recording (it would play into the microphone)', () => {
    mockCapturing = true;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result } = renderHook(() => useVerseActions({ pages: [3], currentPage: 3 }));
    act(() => result.current.player.onPlayPage(3));
    expect(mockRecitation.play).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Recording in progress', expect.any(String));
    alert.mockRestore();
  });

  it('idle: the controls show the reciter, and no verse', () => {
    const { result } = renderHook(() => useVerseActions({ pages: [3], currentPage: 3 }));
    expect(result.current.player.state).toEqual({ status: 'idle', verse: null });
    expect(result.current.player.voiceName).toBeTruthy();
    expect(result.current.playerVisible).toBe(false);
  });
});
