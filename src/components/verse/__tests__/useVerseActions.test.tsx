import React from 'react';
import { AccessibilityInfo, Alert, Share } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useVerseActions } from '../useVerseActions';
import { AudioOptionsSheet } from '../AudioOptionsSheet';
import { updateAudioOptions } from '../../../lib/audioOptions';
import { DEFAULT_PLAYBACK } from '../../../lib/playbackPlan';
import { isPresented, resetPresenters } from '../../../lib/nowPlaying';
import { VerseMenu } from '../VerseMenu';
import { UndoToast } from '../../revision/UndoToast';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockImpact = jest.fn();
jest.mock('expo-haptics', () => ({ impactAsync: (s: unknown) => mockImpact(s), ImpactFeedbackStyle: { Medium: 'm', Light: 'l' } }));
const mockCopy = jest.fn();
jest.mock('../../../lib/clipboard', () => ({ copyText: (t: string) => mockCopy(t) }));
const mockShareText = jest.fn();
jest.mock('../../../lib/verseShare', () => ({ verseShareText: (...a: unknown[]) => mockShareText(...a) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  play: jest.fn((_v: any, _a: any, _o?: any, range: any = null) => {
    mockRecitation.range = range;
  }),
  pause: jest.fn(),
  resume: jest.fn(),
  setVoice: jest.fn(),
  setOptions: jest.fn(),
  // Like the engine: it keeps the range it was started with.
  range: null as unknown,
  getRange() {
    return this.range;
  },
  adopt: jest.fn(),
};
jest.mock('../../../lib/recitation', () => ({
  ...jest.requireActual('../../../lib/recitation'),
  getRecitation: () => mockRecitation,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRecitation.range = null;
  mockCapturing = false;
  mockImpact.mockResolvedValue(undefined);
});

describe('useVerseActions: the recitation outside the screen', () => {
  // The recitation as other screens see it: a state and its listeners.
  let listener: (s: unknown) => void = () => {};
  let state: Record<string, unknown> = { status: 'idle', verse: null };
  const realGetState = mockRecitation.getState;
  const realSubscribe = mockRecitation.subscribe;
  beforeEach(() => {
    resetPresenters();
    state = { status: 'idle', verse: null };
    mockRecitation.getState = (() => state) as typeof mockRecitation.getState;
    mockRecitation.subscribe = ((l: (s: unknown) => void) => {
      listener = l;
      return () => {};
    }) as typeof mockRecitation.subscribe;
  });
  afterEach(() => {
    mockRecitation.getState = realGetState;
    mockRecitation.subscribe = realSubscribe;
  });
  const emit = (next: Record<string, unknown>) => {
    state = next;
    act(() => listener(next));
  };

  it('leaving the screen leaves it playing', () => {
    const { unmount } = renderHook(() => useVerseActions({ pages: [3], currentPage: 3 }));
    act(() => unmount());
    expect(mockRecitation.stop).not.toHaveBeenCalled();
  });

  it('the screen in front whose pages hold the verse takes it over, and shows it (the mini player steps aside)', () => {
    const { rerender, unmount } = renderHook(
      ({ focused }: { focused: boolean }) => useVerseActions({ pages: [3, 4], currentPage: 3, focused }),
      { initialProps: { focused: false } },
    );
    // Started on another screen (or one since closed).
    emit({ status: 'playing', verse: { sura: 2, ayah: 13 }, owner: 'elsewhere' });
    expect(mockRecitation.adopt).not.toHaveBeenCalled();
    expect(isPresented()).toBe(false);
    rerender({ focused: true });
    expect(mockRecitation.adopt).toHaveBeenCalledTimes(1);
    const me = mockRecitation.adopt.mock.calls[0][0];
    emit({ status: 'playing', verse: { sura: 2, ayah: 13 }, owner: me });
    expect(isPresented()).toBe(true);
    // Another tab: still playing, now the mini player's.
    rerender({ focused: false });
    expect(isPresented()).toBe(false);
    rerender({ focused: true });
    expect(isPresented()).toBe(true);
    act(() => unmount());
    expect(isPresented()).toBe(false);
  });

  it('a verse outside the screen’s pages is left to whoever has it', () => {
    renderHook(() => useVerseActions({ pages: [3], currentPage: 3, focused: true }));
    emit({ status: 'playing', verse: { sura: 3, ayah: 5 }, owner: 'elsewhere' });
    expect(mockRecitation.adopt).not.toHaveBeenCalled();
    expect(isPresented()).toBe(false);
  });
});

describe('useVerseActions: Copy and Share', () => {
  type Overlay = { props: { children: React.ReactNode } };
  const find = <P,>(overlay: Overlay, type: unknown) =>
    React.Children.toArray(overlay.props.children).find(
      (c) => React.isValidElement(c) && c.type === type,
    ) as React.ReactElement<P>;
  const menu = (r: { current: ReturnType<typeof useVerseActions> }) =>
    find<React.ComponentProps<typeof VerseMenu>>(r.current.overlay, VerseMenu);
  const note = (r: { current: ReturnType<typeof useVerseActions> }) =>
    find<React.ComponentProps<typeof UndoToast>>(r.current.overlay, UndoToast);
  const hold = (r: { current: ReturnType<typeof useVerseActions> }) =>
    act(() => r.current.onLongPressAyah({ page: 48, sura: 2, ayah: 282 }, { x: 10, y: 10 }));

  it('Copy: the held verse’s text to the clipboard, a light tap, and “Copied”', async () => {
    mockShareText.mockResolvedValue('TEXT');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const { result } = renderHook(() => useVerseActions({ pages: [47, 48], currentPage: 48 }));
    hold(result);
    mockImpact.mockClear();
    await act(async () => menu(result).props.onCopy());
    // The verse as held: on page 48, though it began on 47.
    expect(mockShareText).toHaveBeenCalledWith(48, 2, 282);
    expect(mockCopy).toHaveBeenCalledWith('TEXT');
    expect(mockImpact).toHaveBeenCalledWith('l');
    expect(note(result).props).toMatchObject({ visible: true, message: 'Copied', duration: 1500 });
    expect(note(result).props.onUndo).toBeUndefined();
    expect(announce).toHaveBeenCalledWith('Copied');
    // The menu has closed and the verse is no longer held.
    expect(menu(result).props.point).toBeNull();
    expect(result.current.highlightedAyah).toBeNull();
    act(() => note(result).props.onDismiss());
    expect(note(result).props.visible).toBe(false);
  });

  it('Share: the same text to the share sheet', async () => {
    mockShareText.mockResolvedValue('TEXT');
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const { result } = renderHook(() => useVerseActions({ pages: [48], currentPage: 48 }));
    hold(result);
    await act(async () => menu(result).props.onShare());
    expect(share).toHaveBeenCalledWith({ message: 'TEXT' });
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('no text (offline, never loaded): nothing copied or shared, and it says why', async () => {
    mockShareText.mockRejectedValue(new Error('offline'));
    const share = jest.spyOn(Share, 'share');
    const { result } = renderHook(() => useVerseActions({ pages: [48], currentPage: 48 }));
    hold(result);
    await act(async () => menu(result).props.onCopy());
    expect(mockCopy).not.toHaveBeenCalled();
    expect(note(result).props).toMatchObject({ visible: true, message: 'Couldn’t copy. Check your connection.' });
    hold(result);
    await act(async () => menu(result).props.onShare());
    expect(share).not.toHaveBeenCalled();
    expect(note(result).props.message).toBe('Couldn’t share. Check your connection.');
  });
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
