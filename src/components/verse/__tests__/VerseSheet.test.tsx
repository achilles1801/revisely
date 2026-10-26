import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '../../../context/ThemeContext';

// The glass background needs the native view.
jest.mock('../../GlassCard', () => ({ GlassCard: () => null }));

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
  };
});

import { grabberSwipe, SHEET_HEIGHT, VerseSheet } from '../VerseSheet';

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
    expect(style('verse-sheet')).toMatchObject({ maxHeight: SHEET_HEIGHT.normal });
    fireEvent.press(screen.getByLabelText('Expand the translation'));
    expect(style('verse-sheet')).toMatchObject({ maxHeight: SHEET_HEIGHT.expanded });
    fireEvent.press(screen.getByLabelText('Make the translation smaller'));
    expect(style('verse-sheet')).toMatchObject({ maxHeight: SHEET_HEIGHT.normal });
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
    expect(style('verse-sheet')).toMatchObject({ maxHeight: SHEET_HEIGHT.normal });
  });
});

describe('grabberSwipe', () => {
  it('up expands, down shrinks an expanded sheet or closes a normal one; small moves do nothing', () => {
    expect(grabberSwipe(-60, false)).toBe('expand');
    expect(grabberSwipe(-60, true)).toBeNull();
    expect(grabberSwipe(60, true)).toBe('shrink');
    expect(grabberSwipe(60, false)).toBe('close');
    expect(grabberSwipe(10, false)).toBeNull();
    expect(grabberSwipe(-10, true)).toBeNull();
  });
});

describe('VerseSheet: The Clear Quran credit', () => {
  const { initClearQuranPreview, setClearQuranPreview, resetClearQuranPreviewForTests } =
    jest.requireActual('../../../lib/clearQuranPreview');
  const { getVerseText } = jest.requireMock('../../../lib/translation');
  const { Linking } = require('react-native');

  beforeEach(() => {
    resetClearQuranPreviewForTests();
  });

  it('with The Clear Quran chosen: one credit line pinned under the verse, linking to its site', async () => {
    await initClearQuranPreview(true);
    setClearQuranPreview(true);
    getVerseText.mockImplementationOnce((page: number, sura: number, ayah: number) =>
      Promise.resolve({
        sura,
        ayah,
        surahName: 'Al-Baqarah',
        arabic: mockLongArabic,
        translation: '[The Clear Quran® translation will appear here]',
        translationName: 'The Clear Quran®',
        placeholder: true,
      }),
    );
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(wrap(<VerseSheet {...props({ page: 3, sura: 2, ayah: 6 })} translationId="en.khattab" />));
    expect(await screen.findByText('[The Clear Quran® translation will appear here]', {}, { timeout: 10_000 })).toBeTruthy();
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

  it('with Saheeh International: no credit line, its name under the verse as before', async () => {
    render(wrap(<VerseSheet {...props({ page: 48, sura: 2, ayah: 282 })} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    expect(screen.queryByTestId('translation-credit')).toBeNull();
    expect(screen.getByText('Saheeh International')).toBeTruthy();
  });

  it('the picker lists "The Clear Quran® — Dr. Mustafa Khattab" with its site; choosable only in the preview', async () => {
    render(wrap(<VerseSheet {...props({ page: 48, sura: 2, ayah: 282 })} />));
    await screen.findByText(/THE LAST WORDS/, {}, { timeout: 10_000 });
    fireEvent.press(screen.getByLabelText('More'));
    fireEvent.press(screen.getByText('Select translation'));
    const row = () => screen.getByText('The Clear Quran® — Dr. Mustafa Khattab');
    expect(row()).toBeTruthy();
    expect(screen.getByText('theclearquran.org')).toBeTruthy();
    expect(screen.getByText(/Not available yet/)).toBeTruthy();

    await act(async () => {
      await initClearQuranPreview(true);
      setClearQuranPreview(true);
    });
    // Now choosable: no longer "not available".
    expect(screen.queryByText(/Not available yet/)).toBeNull();
    expect(row()).toBeTruthy();
  });
});
