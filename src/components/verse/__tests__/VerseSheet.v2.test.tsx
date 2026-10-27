import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Any glass in the new design would show up here.
jest.mock('../../GlassCard', () => {
  const { View } = require('react-native');
  return { GlassCard: () => <View testID="glass-card" /> };
});
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
  play: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  setVoice: jest.fn(),
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
  <DesignProvider initial={{ allowed: true, chosen: 'new' }}>
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
    expect(screen.queryByTestId('glass-card')).toBeNull();
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
    expect(screen.queryByTestId('glass-card')).toBeNull();
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

describe('VerseMenu in the new design', () => {
  it('is the menu sheet: Play (who recites) and Translation; the choice runs once the sheet has gone', async () => {
    const onPlay = jest.fn();
    const onTranslation = jest.fn();
    const onClose = jest.fn();
    const ui = (point: { x: number; y: number } | null) =>
      v2(
        <VerseMenu
          point={point}
          verseLabel={point ? 'Al-Baqarah 2:6' : undefined}
          playSubtitle="Husary · to the end of the juz"
          onPlay={onPlay}
          onTranslation={onTranslation}
          onClose={onClose}
        />,
      );
    render(ui({ x: 100, y: 200 }));
    await screen.findByTestId('sheet-action-play', {}, { timeout: 10_000 });
    expect(screen.getByText('Al-Baqarah 2:6')).toBeTruthy();
    expect(screen.getByText('Husary · to the end of the juz')).toBeTruthy();
    expect(screen.getByTestId('sheet-action-translation')).toBeTruthy();
    expect(screen.queryByTestId('glass-card')).toBeNull();
    fireEvent.press(screen.getByTestId('sheet-action-translation'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onTranslation).not.toHaveBeenCalled();
    // The parent clears the menu; once the modal is gone (iOS: onDismiss) the choice runs.
    screen.rerender(ui(null));
    // The title stays while it slides away.
    expect(screen.getByText('Al-Baqarah 2:6')).toBeTruthy();
    const { Modal } = jest.requireActual('react-native');
    act(() => screen.UNSAFE_getByType(Modal).props.onDismiss());
    expect(onTranslation).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();
  });
});

describe('useVerseActions in the new design', () => {
  let actions: ReturnType<typeof useVerseActions>;
  function Reader() {
    actions = useVerseActions({ pages: [3], currentPage: 3 });
    return <>{actions.overlay}</>;
  }

  it('hold a verse: a medium haptic, the menu titled with the verse; Translation opens the sheet with the verse still highlighted', async () => {
    render(v2(<Reader />));
    await act(async () => {});
    act(() => actions.onLongPressAyah({ page: 3, sura: 2, ayah: 6 }, { x: 100, y: 300 }));
    expect(Haptics.impactAsync).toHaveBeenCalledWith('m');
    expect(screen.getByText('Al-Baqarah 2:6')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sheet-action-translation'));
    // The menu has closed: once it's gone, the verse sheet opens.
    const { Modal } = jest.requireActual('react-native');
    const menuModal = screen.UNSAFE_getAllByType(Modal).find((m: any) => m.props.onDismiss);
    act(() => menuModal.props.onDismiss());
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
    expect(screen.queryByTestId('glass-card')).toBeNull();
  });
});
