import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Any glass in the new design would show up here.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`} /> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: null, saveUser: jest.fn() }) }));
jest.mock('../../../lib/recordings', () => ({ isRecordingActive: () => false }));
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
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockArabic = 'إِنَّ ٱلَّذِينَ كَفَرُوا۟ سَوَآءٌ عَلَيْهِمْ ءَأَنذَرْتَهُمْ أَمْ لَمْ تُنذِرْهُمْ لَا يُؤْمِنُونَ';
jest.mock('../../../lib/translation', () => {
  const actual = jest.requireActual('../../../lib/translation');
  return {
    ...actual,
    getVerseText: jest.fn((page: number, sura: number, ayah: number) =>
      Promise.resolve({
        sura,
        ayah,
        surahName: 'Al-Baqarah',
        arabic: mockArabic,
        translation: 'Saheeh text of the verse.',
        translationName: 'Saheeh International',
      }),
    ),
    peekVerseText: jest.fn(() => null),
    prefetchVerseNeighbours: jest.fn(),
  };
});

import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import { touchHandlingAncestor } from '../../../../jest/scrollable';
import { VerseSheet } from '../VerseSheet';
import { VerseMenu } from '../VerseMenu';
import { ReciterList } from '../ReciterList';
import { useVerseActions } from '../useVerseActions';
import * as Haptics from 'expo-haptics';

const { getVerseText } = jest.requireMock('../../../lib/translation');
const { ClearQuranError } = jest.requireActual('../../../lib/clearQuran');

// The new design, light, with the default accent (Indigo).
const palette = paletteV2(false, DEFAULT_ACCENT);
const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);
const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
const flatText = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);

const props = (verse: { page: number; sura: number; ayah: number } | null, translationId?: string) => ({
  verse,
  translationId,
  onChangeTranslation: jest.fn(),
  reciter: undefined,
  onChangeReciter: jest.fn(),
  onNavigate: jest.fn(),
  onClose: jest.fn(),
});
const tcq = (translation: string) => (page: number, sura: number, ayah: number) =>
  Promise.resolve({ sura, ayah, surahName: 'Al-Baqarah', arabic: mockArabic, translation, translationName: 'The Clear Quran®' });

/** Whether `node` sits inside the verse's scrolling part. */
function insideScroll(node: any): boolean {
  const scroll = screen.getByTestId('verse-scroll');
  for (let n = node.parent; n; n = n.parent) if (n === scroll) return true;
  return false;
}

jest.setTimeout(30_000);

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

describe('VerseSheet in the new design', () => {
  it('is a flat sheet in the sheets’ colour and corners: no glass, the handle, bare header icons outside the scroll', async () => {
    render(v2(<VerseSheet {...props({ page: 3, sura: 2, ayah: 6 })} />));
    await screen.findByText('Saheeh text of the verse.', {}, { timeout: 10_000 });
    expect(style('verse-sheet')).toMatchObject({
      backgroundColor: palette.sheet,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    });
    // The grab handle, in the sheets' handle colour.
    const handle = screen.getByLabelText('Expand the translation').children[0] as any;
    expect(StyleSheet.flatten(handle.props.style)).toMatchObject({ backgroundColor: palette.handle, width: 40, height: 4 });
    // Ink text on the sheet; the verse scrolls, nothing above it takes the touch.
    expect(flatText('Saheeh text of the verse.').color).toBe(palette.text);
    expect(flatText('Ayah 6').color).toBe(palette.text);
    expect(touchHandlingAncestor(screen.getByTestId('verse-scroll'))).toBeNull();
    for (const label of ['Close', 'Previous verse', 'Next verse', 'More']) {
      expect(insideScroll(screen.getByLabelText(label))).toBe(false);
    }
    // Saheeh: its name under the verse, quiet.
    expect(flatText('Saheeh International').color).toBe(palette.secondary);
  });

  it('The Clear Quran: its text exactly as given, the credit and its link pinned under the verse', async () => {
    getVerseText.mockImplementationOnce(
      tcq('Indeed, those who persist in disbelief—it is the same whether you warn them or not—they will never believe.<footnote id="9" number="1"></footnote>'),
    );
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(v2(<VerseSheet {...props({ page: 3, sura: 2, ayah: 6 }, 'en.khattab')} />));
    await screen.findByTestId('verse-translation', {}, { timeout: 10_000 });
    expect(
      screen.getByText(/Indeed, those who persist in disbelief—it is the same whether you warn them or not—they will never believe\./),
    ).toBeTruthy();
    expect(screen.getByText('¹')).toBeTruthy();
    expect(screen.queryByText(/<footnote/)).toBeNull();
    // The credit, outside the scrolling part (always in view), with its link.
    const credit = screen.getByTestId('translation-credit');
    expect(insideScroll(credit)).toBe(false);
    expect(screen.getByText('The Clear Quran® by Dr. Mustafa Khattab')).toBeTruthy();
    expect(flatText('The Clear Quran® by Dr. Mustafa Khattab').color).toBe(palette.secondary);
    const link = screen.getByText('theclearquran.org');
    expect(link.props.accessibilityRole).toBe('link');
    expect(StyleSheet.flatten(link.props.style).color).toBe(palette.link);
    fireEvent.press(link);
    expect(open).toHaveBeenCalledWith('https://theclearquran.org');
    open.mockRestore();
  });

  it("an error: \"Couldn't load translation\" and a retry, never another translation", async () => {
    getVerseText
      .mockImplementationOnce(() => Promise.reject(new ClearQuranError('RATE_LIMITED', 'busy')))
      .mockImplementationOnce(tcq('In the Name of Allah—the Most Compassionate, Most Merciful.'));
    render(v2(<VerseSheet {...props({ page: 1, sura: 1, ayah: 1 }, 'en.khattab')} />));
    expect(await screen.findByText("Couldn't load translation", {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByText(/Try again in a minute/)).toBeTruthy();
    expect(screen.queryByText('Saheeh International')).toBeNull();
    expect(screen.queryByTestId('translation-credit')).toBeNull();
    // The retry is the new design's solid pill.
    expect(style('verse-retry')).toMatchObject({ backgroundColor: palette.primary });
    fireEvent.press(screen.getByText('Try again'));
    expect(
      await screen.findByText('In the Name of Allah—the Most Compassionate, Most Merciful.', {}, { timeout: 10_000 }),
    ).toBeTruthy();
    expect(screen.getByTestId('translation-credit')).toBeTruthy();
  });

  it('⋯ opens a flat menu in the sheet; the picker credits The Clear Quran and it can be chosen', async () => {
    const p = props({ page: 3, sura: 2, ayah: 6 });
    render(v2(<VerseSheet {...p} />));
    await screen.findByText('Saheeh text of the verse.', {}, { timeout: 10_000 });
    fireEvent.press(screen.getByLabelText('More'));
    expect(style('verse-menu-panel')).toMatchObject({ backgroundColor: palette.sheet, borderColor: palette.separator });
    fireEvent.press(screen.getByText('Select translation'));
    expect(screen.getByText('English · theclearquran.org')).toBeTruthy();
    expect(flatText('theclearquran.org').color).toBe(palette.link);
    expect(screen.queryByText(/Not available yet/)).toBeNull();
    fireEvent.press(screen.getByText('The Clear Quran® — Dr. Mustafa Khattab'));
    expect(p.onChangeTranslation).toHaveBeenCalledWith('en.khattab');
    expect(screen.queryByTestId('verse-menu-panel')).toBeNull();
  });

  it('⋯ → Select reciter lists reciters as menu rows, the chosen style a solid pill', async () => {
    const p = props({ page: 3, sura: 2, ayah: 6 });
    render(v2(<VerseSheet {...p} />));
    await screen.findByText('Saheeh text of the verse.', {}, { timeout: 10_000 });
    fireEvent.press(screen.getByLabelText('More'));
    fireEvent.press(screen.getByText('Select reciter'));
    expect(screen.getByTestId('reciter-list')).toBeTruthy();
    expect(touchHandlingAncestor(screen.getByTestId('reciter-list'))).toBeNull();
  });
});

describe('ReciterList in the new design', () => {
  it('the chosen reciter is checked, its style solid in the primary colour, the others outlined', async () => {
    const onChange = jest.fn();
    const { RECITERS } = jest.requireActual('../../../lib/recitation');
    const withStyles = RECITERS.find((r: { styles: unknown[] }) => r.styles.length > 1);
    const [first, second] = withStyles.styles.map((s: { style: string }) => s.style);
    render(v2(<ReciterList value={`${withStyles.id}:${first}`} onChange={onChange} />));
    const chosen = await screen.findByTestId(`reciter-style-${withStyles.id}-${first}`, {}, { timeout: 10_000 });
    expect(chosen.props.accessibilityState).toMatchObject({ selected: true });
    expect(StyleSheet.flatten(chosen.props.style)).toMatchObject({ backgroundColor: palette.primary });
    const other = screen.getByTestId(`reciter-style-${withStyles.id}-${second}`);
    expect(StyleSheet.flatten(other.props.style)).toMatchObject({ borderColor: palette.outline });
    fireEvent.press(other);
    expect(onChange).toHaveBeenCalledWith(`${withStyles.id}:${second}`);
  });
});

describe('VerseMenu: a small card beside the verse', () => {
  const props = () => ({
    onPlay: jest.fn(),
    onTranslation: jest.fn(),
    onCopy: jest.fn(),
    onShare: jest.fn(),
    onClose: jest.fn(),
  });
  const layout = (testID: string, width: number, height: number) =>
    fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });

  it('Play (who recites), Translation, Copy and Share; a choice runs at once (no modal to wait for)', async () => {
    const p = props();
    render(
      v2(
        <VerseMenu
          point={{ x: 100, y: 200 }}
          verseLabel="Al-Baqarah 2:6"
          playSubtitle="Husary · to the end of the juz"
          {...p}
        />,
      ),
    );
    await act(async () => {});
    expect(screen.getByText('Play')).toBeTruthy();
    expect(screen.getByText('Husary · to the end of the juz')).toBeTruthy();
    expect(screen.getByText('Translation')).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
    // No title and no Cancel: the verse is named for VoiceOver.
    expect(screen.queryByText('Al-Baqarah 2:6')).toBeNull();
    expect(screen.queryByText('Cancel')).toBeNull();
    expect(screen.getByLabelText('Copy Al-Baqarah 2:6')).toBeTruthy();
    expect(screen.getByLabelText('Play Al-Baqarah 2:6, Husary · to the end of the juz')).toBeTruthy();
    // Not a native modal: the verse sheet or the share sheet can open right away.
    const { Modal } = jest.requireActual('react-native');
    expect(screen.UNSAFE_queryAllByType(Modal)).toHaveLength(0);
    fireEvent.press(screen.getByTestId('verse-menu-translation'));
    expect(p.onTranslation).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('verse-menu-copy'));
    expect(p.onCopy).toHaveBeenCalledTimes(1);
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('beside the verse, in the sheets’ colour with an outline; the page behind not dimmed', async () => {
    render(v2(<VerseMenu point={{ x: 200, y: 330 }} anchor={{ x: 20, y: 300, width: 400, height: 60 }} {...props()} />));
    await act(async () => {});
    layout('verse-menu', 440, 956);
    layout('verse-menu-card', 264, 190);
    const card = style('verse-menu-card');
    expect(card).toMatchObject({ backgroundColor: palette.sheet, borderColor: palette.outline, top: 368 });
    // Centred on the finger (x 200).
    expect(card.left).toBe(200 - 264 / 2);
    // Nothing behind it is dimmed.
    expect(style('verse-menu-backdrop').backgroundColor).toBeUndefined();
  });

  it('a touch outside (a tap, or a swipe starting) closes it; so does VoiceOver’s escape', async () => {
    const p = props();
    render(v2(<VerseMenu point={{ x: 100, y: 200 }} {...p} />));
    await act(async () => {});
    const backdrop = screen.getByTestId('verse-menu-backdrop');
    expect(backdrop.props.onStartShouldSetResponder()).toBe(true);
    backdrop.props.onResponderGrant();
    expect(p.onClose).toHaveBeenCalledTimes(1);
    const menu = screen.getByTestId('verse-menu');
    expect(menu.props.accessibilityViewIsModal).toBe(true);
    menu.props.onAccessibilityEscape();
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });

  it('closed: it lets touches through while it fades, then goes', async () => {
    const p = props();
    const ui = (point: { x: number; y: number } | null) => v2(<VerseMenu point={point} {...p} />);
    render(ui({ x: 100, y: 200 }));
    await act(async () => {});
    screen.rerender(ui(null));
    await act(async () => {});
    const menu = screen.queryByTestId('verse-menu');
    // Gone, or on its way out without catching touches.
    if (menu) expect(menu.props.pointerEvents).toBe('none');
  });
});

describe('useVerseActions in the new design', () => {
  let actions: ReturnType<typeof useVerseActions>;
  function Reader() {
    actions = useVerseActions({ pages: [3], currentPage: 3 });
    return <>{actions.overlay}</>;
  }

  it('hold a verse: a medium haptic, the menu for that verse; Translation opens the sheet with the verse still highlighted', async () => {
    render(v2(<Reader />));
    await act(async () => {});
    act(() => actions.onLongPressAyah({ page: 3, sura: 2, ayah: 6 }, { x: 100, y: 300 }));
    expect(Haptics.impactAsync).toHaveBeenCalledWith('m');
    expect(screen.getByLabelText('Translation of Al-Baqarah 2:6')).toBeTruthy();
    fireEvent.press(screen.getByTestId('verse-menu-translation'));
    // The verse sheet opens at once: the menu is no modal to wait for.
    expect(await screen.findByText('Saheeh text of the verse.', {}, { timeout: 10_000 })).toBeTruthy();
    expect(actions.highlightedAyah).toMatchObject({ sura: 2, ayah: 6 });
  });

  it('the reciter picker is the new design’s sheet, titled Reciter, without glass', async () => {
    render(v2(<Reader />));
    await act(async () => {});
    act(() => actions.player.onPickReciter());
    await act(async () => {});
    expect(style('reciter-sheet')).toMatchObject({ backgroundColor: palette.sheet });
    expect(screen.getByText('Reciter')).toBeTruthy();
    expect(screen.getByTestId('reciter-list')).toBeTruthy();
    expect(touchHandlingAncestor(screen.getByTestId('reciter-list'))).toBeNull();
  });
});
