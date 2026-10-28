import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '../../../context/ThemeContext';

jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
// Shared values that last across renders, as on a device (the stock mock makes a
// new one every render, and the sheet re-renders as its verse loads).
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const { useRef } = require('react');
  return {
    ...mock,
    useSharedValue: (init: unknown) => {
      const ref = useRef(null);
      if (!ref.current) ref.current = mock.useSharedValue(init);
      return ref.current;
    },
  };
});
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// 2:282, the longest verse: far taller than any sheet.
const mockLongArabic = 'يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوٓا۟ إِذَا تَدَايَنتُم بِدَيْنٍ إِلَىٰٓ أَجَلٍۢ مُّسَمًّۭى فَٱكْتُبُوهُ '.repeat(12);
const mockLongTranslation =
  'O you who have believed, when you contract a debt for a specified term, write it down. '.repeat(20) + 'THE LAST WORDS';
jest.mock('../../../lib/translation', () => {
  const actual = jest.requireActual('../../../lib/translation');
  return {
    ...actual,
    getVerseText: jest.fn((page: number, sura: number, ayah: number) =>
      Promise.resolve({
        sura,
        ayah,
        surahName: 'Al-Baqarah',
        arabic: mockLongArabic,
        translation: mockLongTranslation,
        translationName: 'Saheeh International',
      }),
    ),
    // Nothing is in memory unless a test says so; fetching ahead is only recorded.
    peekVerseText: jest.fn(() => null),
    prefetchVerseNeighbours: jest.fn(),
  };
});

import { Dimensions } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { touchHandlingAncestor } from '../../../../jest/scrollable';
import { sheetMaxHeight, VerseSheet, verseSheetRelease, visibleLoadState } from '../VerseSheet';
import { DISMISS_DISTANCE, DISMISS_VELOCITY } from '../../v2/Sheet';

// The safe-area mock has no insets (react-native-safe-area-context/jest/mock).
const TOP = 0;
const SCREEN = Dimensions.get('window').height;
const HEIGHT = { normal: sheetMaxHeight(SCREEN, TOP, false), expanded: sheetMaxHeight(SCREEN, TOP, true) };

const props = (verse: { page: number; sura: number; ayah: number } | null) => ({
  verse,
  translationId: undefined,
  onChangeTranslation: jest.fn(),
  reciter: undefined,
  onChangeReciter: jest.fn(),
  onNavigate: jest.fn(),
  onClose: jest.fn(),
});
const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;
const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

// The first render (theme, fonts, the mocked load) can take seconds on CI.
jest.setTimeout(30_000);

describe('VerseSheet with a long verse', () => {
  it('scrolls the verse under a header that stays put (it used to be cut off)', async () => {
    render(wrap(<VerseSheet {...props({ page: 48, sura: 2, ayah: 282 })} />));
    expect(await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 })).toBeTruthy();
    // Bounded by the sheet, so it can scroll: without flexShrink it grew past it.
    expect(style('verse-scroll')).toMatchObject({ flexShrink: 1 });
    // And a drag reaches it: nothing above it handles touches. The backdrop used
    // to wrap the sheet, and on iOS that kept the verse from scrolling at all.
    expect(touchHandlingAncestor(screen.getByTestId('verse-scroll'))).toBeNull();
    // The header is outside the scrolling part.
    const scroll = screen.getByTestId('verse-scroll');
    const inside = (label: string) => {
      let node = screen.getByLabelText(label).parent;
      while (node) {
        if (node === scroll) return true;
        node = node.parent;
      }
      return false;
    };
    expect(inside('Close')).toBe(false);
    expect(inside('Next verse')).toBe(false);
    expect(inside('More')).toBe(false);
  });

  it('expands to nearly the whole screen from the grabber, and back', async () => {
    render(wrap(<VerseSheet {...props({ page: 48, sura: 2, ayah: 282 })} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    expect(style('verse-sheet')).toMatchObject({ maxHeight: HEIGHT.normal });
    fireEvent.press(screen.getByLabelText('Expand the translation'));
    expect(style('verse-sheet')).toMatchObject({ maxHeight: HEIGHT.expanded });
    fireEvent.press(screen.getByLabelText('Make the translation smaller'));
    expect(style('verse-sheet')).toMatchObject({ maxHeight: HEIGHT.normal });
  });

  it('starts the next verse at its top (its text replaces the scrolled one)', async () => {
    const { rerender } = render(wrap(<VerseSheet {...props({ page: 48, sura: 2, ayah: 282 })} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    const before = screen.getByTestId('verse-scroll');
    await act(async () => {
      rerender(wrap(<VerseSheet {...props({ page: 49, sura: 2, ayah: 283 })} />));
    });
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    // A new scrolling view (scrolled to the top), not the old one kept scrolled down.
    expect(screen.getByTestId('verse-scroll')).not.toBe(before);
  });

  it('opens the … menu under the header, wherever large text puts it', async () => {
    render(wrap(<VerseSheet {...props({ page: 48, sura: 2, ayah: 282 })} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    const header = screen.getByLabelText('Expand the translation').parent!.parent!;
    fireEvent(header, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 140 } } });
    fireEvent.press(screen.getByLabelText('More'));
    const menu = screen.getByText('Select translation');
    let node: any = menu;
    let top: number | undefined;
    while (node && top === undefined) {
      top = StyleSheet.flatten(node.props?.style)?.top;
      node = node.parent;
    }
    expect(top).toBe(140);
  });

  it('reopens at normal height after being closed expanded', async () => {
    const { rerender } = render(wrap(<VerseSheet {...props({ page: 48, sura: 2, ayah: 282 })} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    fireEvent.press(screen.getByLabelText('Expand the translation'));
    await act(async () => rerender(wrap(<VerseSheet {...props(null)} />)));
    await act(async () => rerender(wrap(<VerseSheet {...props({ page: 1, sura: 1, ayah: 1 })} />)));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    expect(style('verse-sheet')).toMatchObject({ maxHeight: HEIGHT.normal });
  });
});

describe('the sheet', () => {
  it('a tap on the dimmed backdrop closes it', async () => {
    const p = props({ page: 48, sura: 2, ayah: 282 });
    render(wrap(<VerseSheet {...p} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    fireEvent.press(screen.getByLabelText('Close translation'));
    expect(p.onClose).toHaveBeenCalled();
  });

  /** A drag the way Gesture Handler reports it: the header's or the verse's. */
  async function drag(id: 'verse-sheet-drag' | 'verse-sheet-body-drag', translationY: number, velocityY = 0) {
    act(() => {
      fireGestureHandler(getByGestureTestId(id), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: Math.sign(translationY) * 12 },
        { state: State.ACTIVE, translationY },
        { state: State.END, translationY, velocityY },
      ]);
    });
    // runOnJS hands the result back to the JS thread a moment later.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  const open = async () => {
    const p = props({ page: 48, sura: 2, ayah: 282 });
    render(wrap(<VerseSheet {...p} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    return p;
  };

  it('dragging the grabber or the header down past the threshold closes it, as every sheet', async () => {
    const p = await open();
    await drag('verse-sheet-drag', DISMISS_DISTANCE + 40);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('a short drag springs back; a short fling down closes it', async () => {
    const p = await open();
    await drag('verse-sheet-drag', 50, 200);
    expect(p.onClose).not.toHaveBeenCalled();
    await drag('verse-sheet-drag', 40, DISMISS_VELOCITY + 400);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('dragging up expands it; expanded, a drag down brings it back to normal height, a long one closes it', async () => {
    const p = await open();
    await drag('verse-sheet-drag', -80);
    expect(style('verse-sheet')).toMatchObject({ maxHeight: HEIGHT.expanded });
    await drag('verse-sheet-drag', DISMISS_DISTANCE + 20);
    expect(style('verse-sheet')).toMatchObject({ maxHeight: HEIGHT.normal });
    expect(p.onClose).not.toHaveBeenCalled();
    await drag('verse-sheet-drag', -80);
    await drag('verse-sheet-drag', 2000);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('the verse drags the sheet down only from its top: scrolled into it, the drag scrolls it back first', async () => {
    const p = await open();
    const verse = screen.getByTestId('verse-scroll');
    fireEvent.scroll(verse, { nativeEvent: { contentOffset: { x: 0, y: 300 } } });
    await drag('verse-sheet-body-drag', DISMISS_DISTANCE + 60);
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.scroll(verse, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    await drag('verse-sheet-body-drag', DISMISS_DISTANCE + 60);
    expect(p.onClose).toHaveBeenCalledTimes(1);
    // The verse doesn't bounce at its top: the drag moves the sheet instead.
    expect(verse.props.bounces).toBe(false);
  });

  it('VoiceOver: the grabber has a Close action, and the escape gesture closes it', async () => {
    const p = await open();
    const handle = screen.getByTestId('verse-sheet-handle');
    expect(handle.props.accessibilityActions).toEqual(expect.arrayContaining([{ name: 'close', label: 'Close' }]));
    fireEvent(handle, 'accessibilityAction', { nativeEvent: { actionName: 'close' } });
    expect(p.onClose).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByTestId('verse-sheet'), 'accessibilityEscape');
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });

  it('is at most 70% of the screen, or everything below the status bar expanded', () => {
    expect(sheetMaxHeight(667, 20, false)).toBe(467);
    expect(sheetMaxHeight(667, 20, true)).toBe(639);
    expect(sheetMaxHeight(956, 62, true)).toBe(886);
  });
});

describe('verseSheetRelease', () => {
  it('normal height: closes like every sheet (past 120pt or 30% of it, or flung); up expands', () => {
    expect(verseSheetRelease(130, 0, 600, false)).toBe('close');
    expect(verseSheetRelease(100, 0, 600, false)).toBe('back');
    expect(verseSheetRelease(30, DISMISS_VELOCITY + 100, 600, false)).toBe('close');
    expect(verseSheetRelease(-60, 0, 600, false)).toBe('expand');
    expect(verseSheetRelease(10, 0, 600, false)).toBe('back');
  });

  it('expanded: a drag past the threshold shrinks it, half the sheet (or a quarter flung) closes it', () => {
    expect(verseSheetRelease(130, 0, 800, true)).toBe('shrink');
    expect(verseSheetRelease(420, 0, 800, true)).toBe('close');
    expect(verseSheetRelease(220, DISMISS_VELOCITY + 100, 800, true)).toBe('close');
    expect(verseSheetRelease(60, 0, 800, true)).toBe('back');
    expect(verseSheetRelease(-60, 0, 800, true)).toBe('back');
  });
});

describe('VerseSheet: The Clear Quran', () => {
  const { getVerseText } = jest.requireMock('../../../lib/translation');
  const { ClearQuranError } = jest.requireActual('../../../lib/clearQuran');
  const { Linking } = require('react-native');
  const tcqVerse = (translation: string) => (page: number, sura: number, ayah: number) =>
    Promise.resolve({ sura, ayah, surahName: 'Al-Baqarah', arabic: mockLongArabic, translation, translationName: 'The Clear Quran®' });

  it('shows its text exactly as given, with one credit line pinned under the verse, linking to its site', async () => {
    getVerseText.mockImplementationOnce(
      tcqVerse('Indeed, those who persist in disbelief—it is the same whether you warn them or not—they will never believe.<footnote id="9" number="1"></footnote>'),
    );
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(wrap(<VerseSheet {...props({ page: 3, sura: 2, ayah: 6 })} translationId="en.khattab" />));
    await screen.findByTestId('verse-translation', {}, { timeout: 10_000 });
    // The words untouched; the footnote marker as its raised number.
    expect(screen.getByText(/Indeed, those who persist in disbelief—it is the same whether you warn them or not—they will never believe\./)).toBeTruthy();
    expect(screen.getByText('¹')).toBeTruthy();
    expect(screen.queryByText(/<footnote/)).toBeNull();
    const credit = screen.getByTestId('translation-credit');
    expect(screen.getByText('The Clear Quran® by Dr. Mustafa Khattab')).toBeTruthy();
    // Outside the scrolling part, so it is always in view.
    let node = credit.parent;
    while (node) {
      expect(node).not.toBe(screen.getByTestId('verse-scroll'));
      node = node.parent;
    }
    fireEvent.press(screen.getByText('theclearquran.org'));
    expect(open).toHaveBeenCalledWith('https://theclearquran.org');
    open.mockRestore();
  });

  it("when its text can't be loaded: \"Couldn't load translation\" and a retry, never another translation", async () => {
    getVerseText
      .mockImplementationOnce(() => Promise.reject(new ClearQuranError('RATE_LIMITED', 'busy')))
      .mockImplementationOnce(tcqVerse('In the Name of Allah—the Most Compassionate, Most Merciful.'));
    render(wrap(<VerseSheet {...props({ page: 1, sura: 1, ayah: 1 })} translationId="en.khattab" />));
    expect(await screen.findByText("Couldn't load translation", {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByText(/Try again in a minute/)).toBeTruthy();
    expect(screen.queryByText('Saheeh International')).toBeNull();
    expect(screen.queryByTestId('verse-translation')).toBeNull();
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('In the Name of Allah—the Most Compassionate, Most Merciful.', {}, { timeout: 10_000 })).toBeTruthy();
  });

  it('a result is shown only for the translation and verse it was loaded for', () => {
    const text = { sura: 2, ayah: 6, surahName: 'Al-Baqarah', arabic: 'x', translation: 'Saheeh text', translationName: 'Saheeh International' };
    const saheeh = { status: 'ready' as const, text, for: 'en.sahih|2:6' };
    // The first render after choosing The Clear Quran (before its load starts):
    // Saheeh's text must not appear above The Clear Quran's credit.
    expect(visibleLoadState(saheeh, 'en.khattab|2:6')).toEqual({ status: 'loading' });
    expect(visibleLoadState(saheeh, 'en.sahih|2:7')).toEqual({ status: 'loading' });
    expect(visibleLoadState(saheeh, 'en.sahih|2:6')).toBe(saheeh);
    const failed = { status: 'error' as const, error: new Error('x'), for: 'en.sahih|2:6' };
    expect(visibleLoadState(failed, 'en.khattab|2:6')).toEqual({ status: 'loading' });
  });

  it('switching to it never shows its credit under the previous translation’s text', async () => {
    let resolveTcq: (v: unknown) => void = () => undefined;
    const p = props({ page: 48, sura: 2, ayah: 282 });
    const { rerender } = render(wrap(<VerseSheet {...p} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    getVerseText.mockImplementationOnce(() => new Promise((r) => (resolveTcq = r)));
    rerender(wrap(<VerseSheet {...p} translationId="en.khattab" />));
    // Saheeh's text is gone the moment the choice changes; no credit until its own text is in.
    expect(screen.queryByText(/THE LAST WORDS/)).toBeNull();
    expect(screen.queryByTestId('translation-credit')).toBeNull();
    await act(async () =>
      resolveTcq({ sura: 2, ayah: 282, surahName: 'Al-Baqarah', arabic: 'x', translation: 'O believers!', translationName: 'The Clear Quran®' }),
    );
    expect(screen.getByText('O believers!')).toBeTruthy();
    expect(screen.getByTestId('translation-credit')).toBeTruthy();
    // And back: the credit goes with its text.
    rerender(wrap(<VerseSheet {...p} translationId="en.sahih" />));
    expect(screen.queryByText('O believers!')).toBeNull();
    expect(screen.queryByTestId('translation-credit')).toBeNull();
  });

  it('with Saheeh International: no credit line, its name under the verse as before', async () => {
    render(wrap(<VerseSheet {...props({ page: 48, sura: 2, ayah: 282 })} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    expect(screen.queryByTestId('translation-credit')).toBeNull();
    expect(screen.getByText('Saheeh International')).toBeTruthy();
  });

  it('the picker lists "The Clear Quran® — Dr. Mustafa Khattab", English · theclearquran.org, and it can be chosen', async () => {
    const p = props({ page: 48, sura: 2, ayah: 282 });
    render(wrap(<VerseSheet {...p} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    fireEvent.press(screen.getByLabelText('More'));
    fireEvent.press(screen.getByText('Select translation'));
    expect(screen.getByText('theclearquran.org')).toBeTruthy();
    expect(screen.getByText('English · theclearquran.org')).toBeTruthy();
    expect(screen.queryByText(/Not available yet/)).toBeNull();
    fireEvent.press(screen.getByText('The Clear Quran® — Dr. Mustafa Khattab'));
    expect(p.onChangeTranslation).toHaveBeenCalledWith('en.khattab');
  });
});

describe('VerseSheet: moving between verses', () => {
  const { getVerseText, peekVerseText, prefetchVerseNeighbours } = jest.requireMock('../../../lib/translation');
  afterEach(() => peekVerseText.mockReset().mockReturnValue(null));

  it('fetches the verses either side of the one shown, for its translation', async () => {
    prefetchVerseNeighbours.mockClear();
    render(wrap(<VerseSheet {...props({ page: 3, sura: 2, ayah: 6 })} translationId="en.khattab" />));
    await screen.findByTestId('verse-translation', {}, { timeout: 10_000 });
    expect(prefetchVerseNeighbours).toHaveBeenCalledWith({ page: 3, sura: 2, ayah: 6 }, 'en.khattab');
  });

  it('a verse fetched ahead shows in the first frame: no spinner, no wait', async () => {
    getVerseText.mockClear();
    peekVerseText.mockImplementation((page: number, sura: number, ayah: number, id: string) =>
      sura === 2 && ayah === 7 && id === 'en.khattab'
        ? { sura, ayah, surahName: 'Al-Baqarah', arabic: 'x', translation: 'Already here.', translationName: 'The Clear Quran®' }
        : null,
    );
    render(wrap(<VerseSheet {...props({ page: 3, sura: 2, ayah: 7 })} translationId="en.khattab" />));
    // Straight from memory: no load at all, so no spinner. (The theme renders its children async.)
    expect(await screen.findByText('Already here.', {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByTestId('translation-credit')).toBeTruthy();
    expect(getVerseText).not.toHaveBeenCalled();
  });
});
