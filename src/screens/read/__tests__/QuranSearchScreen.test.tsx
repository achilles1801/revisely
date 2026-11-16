import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockNavigation = { push: jest.fn(), goBack: jest.fn() };
let mockParams: { listen?: boolean } | undefined;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockParams }),
}));
let mockUser: { id: string; previewTester?: boolean; translationId?: string } = { id: 'u1', previewTester: true };
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: mockUser }) }));
// Whether the binary can listen; who may is the real gate (lib/search/availability).
jest.mock('../../../lib/recite/micSource', () => ({ isMicStreamAvailable: () => true }));
// Revisely Dev or the store app (the live check is Dev's: lib/reciteLive/availability).
let mockDev = false;
jest.mock('../../../lib/variant', () => ({ ...jest.requireActual('../../../lib/variant'), isDevVariant: () => mockDev }));
// The model sheet: shown or not, and a way to finish its download.
jest.mock('../../../components/recite/SpeechModelSheet', () => ({
  SpeechModelSheet: ({ visible, title, onReady }: { visible: boolean; title: string; onReady: () => void }) => {
    const { Text } = require('react-native');
    return visible ? (
      <Text testID="model-sheet" onPress={onReady}>
        {title}
      </Text>
    ) : null;
  },
}));
// Listening: controlled from the tests.
const mockVoice = {
  available: true,
  status: 'idle' as string,
  partial: '',
  needsModel: false,
  listen: jest.fn(async () => undefined),
  stop: jest.fn(),
  heard: null as ((text: string) => void) | null,
  levels: { subscribe: () => () => undefined, recent: () => [0.2, 0.5, 0.3] },
};
jest.mock('../../../components/search/useVoiceSearch', () => ({
  useVoiceSearch: (onHeard: (text: string) => void, enabled: boolean) => {
    mockVoice.heard = onHeard;
    return { ...mockVoice, available: enabled && mockVoice.available };
  },
}));

// The chosen translation (lib/translation's own tests cover its sources): one verse, a footnote, a version.
const mockTranslation = { calls: [] as unknown[][] };
jest.mock('../../../lib/translation', () => {
  const actual = jest.requireActual('../../../lib/translation');
  return {
    ...actual,
    peekVerseTranslation: () => null,
    getVerseTranslation: async (sura: number, ayah: number, id?: string | null) => {
      mockTranslation.calls.push([sura, ayah, id]);
      return { translation: actual.resolveTranslation(id), text: `Say, “Had Allah willed…”[1] (${sura}:${ayah})`, footnotes: '[1] A note on it.', version: '1.1.2' };
    },
  };
});
const mockClipboard = { copied: [] as string[] };
jest.mock('../../../lib/clipboard', () => ({ copyText: (t: string) => mockClipboard.copied.push(t) }));

import QuranSearchScreen, { onlyVerseFound } from '../QuranSearchScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { setQuranWordsForTests } from '../../../lib/recite/quranWords';
import { wordsData } from '../../../lib/recite/__fixtures__/quranWords';
import { pageOfVerse } from '../../../lib/verses';
import { plainText } from '../../../lib/passages';

beforeAll(() => setQuranWordsForTests(wordsData()));
afterAll(() => setQuranWordsForTests(null));

beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = undefined;
  mockDev = false;
  mockTranslation.calls = [];
  mockClipboard.copied = [];
  mockUser = { id: 'u1', previewTester: true };
  Object.assign(mockVoice, { available: true, status: 'idle', partial: '', needsModel: false });
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

async function open() {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <QuranSearchScreen />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

async function search(text: string) {
  fireEvent.changeText(screen.getByTestId('search-input'), text);
  await act(async () => {
    fireEvent(screen.getByTestId('search-input'), 'submitEditing');
  });
}

describe('searching the Quran', () => {
  it('finds the ayah for words typed in Arabic and opens it highlighted', async () => {
    await open();
    await search('قل لو شاء الله');
    expect(screen.getByTestId('search-count')).toHaveTextContent('1 result');
    const row = screen.getByTestId('search-verse-10-16');
    expect(within(row).getByText('Yunus, ayah 16')).toBeTruthy();
    fireEvent.press(within(row).getByTestId('search-verse-open'));
    expect(mockNavigation.push).toHaveBeenCalledWith('QuranReader', {
      pageNumber: pageOfVerse({ sura: 10, ayah: 16 }),
      source: 'search',
      highlight: { sura: 10, ayah: 16, last: { sura: 10, ayah: 16 } },
    });
  });

  it('a phrase that runs into the next ayah: named as the run, both ayat shown, both highlighted', async () => {
    await open();
    await search('الناس إنما أنا لكم نذير مبين فالذين');
    expect(screen.getByTestId('search-count')).toHaveTextContent('1 result');
    const row = screen.getByTestId('search-verse-22-49');
    expect(within(row).getByText('Al-Hajj, ayahs 49–50', { normalizer: (t) => plainText(t).trim() })).toBeTruthy();
    expect(within(row).getByText(/﴿ ٤٩ ﴾/)).toBeTruthy();
    expect(within(row).getByText(/﴿ ٥٠ ﴾/)).toBeTruthy();
    fireEvent.press(within(row).getByTestId('search-verse-open'));
    expect(mockNavigation.push).toHaveBeenCalledWith('QuranReader', {
      pageNumber: pageOfVerse({ sura: 22, ayah: 49 }),
      source: 'search',
      highlight: { sura: 22, ayah: 49, last: { sura: 22, ayah: 50 } },
    });
  });

  it('opens a place named by reference', async () => {
    await open();
    await search('2:255');
    fireEvent.press(screen.getByTestId('search-target-verse'));
    expect(mockNavigation.push).toHaveBeenCalledWith('QuranReader', {
      pageNumber: pageOfVerse({ sura: 2, ayah: 255 }),
      source: 'search',
      highlight: { sura: 2, ayah: 255 },
    });
    await search('page 62');
    fireEvent.press(screen.getByTestId('search-target-page'));
    expect(mockNavigation.push).toHaveBeenLastCalledWith('QuranReader', { pageNumber: 62, source: 'search', highlight: undefined });
  });

  it('says so when nothing is found', async () => {
    await open();
    await search('كيف حالك اليوم يا صديقي');
    expect(screen.getByTestId('search-none')).toHaveTextContent('Nothing found for “كيف حالك اليوم يا صديقي”.');
  });

  it('keeps the last searches, to search again or clear', async () => {
    await open();
    await search('Yunus');
    await search('قل لو شاء الله');
    fireEvent.press(screen.getByTestId('search-clear'));
    const recent = screen.getAllByTestId('search-recent');
    expect(recent.map((r) => within(r).getByText(/.+/).props.children)).toEqual(['قل لو شاء الله', 'Yunus']);
    await act(async () => {
      fireEvent.press(recent[1]);
    });
    expect(screen.getByTestId('search-target-surah')).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-clear'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('search-recent-clear'));
    });
    expect(screen.queryAllByTestId('search-recent')).toHaveLength(0);
  });

  it('searches with what was heard, shown in the field', async () => {
    await open();
    await act(async () => mockVoice.heard?.('قل لو شاء الله ما تلوتو عليكم'));
    expect(screen.getByTestId('search-input').props.value).toBe('قل لو شاء الله ما تلوتو عليكم');
    expect(screen.getByTestId('search-verse-10-16')).toBeTruthy();
  });

  it('opened from the mic: listens at once, or first offers the speech model', async () => {
    mockParams = { listen: true };
    await open();
    expect(mockVoice.listen).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    mockVoice.needsModel = true;
    await open();
    expect(mockVoice.listen).not.toHaveBeenCalled();
    expect(screen.getByTestId('model-sheet')).toHaveTextContent('Search by voice');
    await act(async () => fireEvent.press(screen.getByTestId('model-sheet')));
    expect(mockVoice.listen).toHaveBeenCalledTimes(1);
  });

  it('while listening, the mic stops it and what is heard so far shows', async () => {
    mockVoice.status = 'listening';
    mockVoice.partial = 'قل لو';
    await open();
    expect(screen.getByTestId('search-partial')).toHaveTextContent('قل لو');
    fireEvent.press(screen.getByTestId('search-mic'));
    expect(mockVoice.stop).toHaveBeenCalled();
  });

  it('no mic where the phone can’t listen', async () => {
    mockVoice.available = false;
    await open();
    expect(screen.queryByTestId('search-mic')).toBeNull();
  });

  it.each([{ id: 'u2' }, { id: 'u3', previewTester: false }])(
    '[SEARCH-1] any account gets the mic: the first tap offers the speech model, then it listens, for %o',
    async (user) => {
      mockUser = user;
      mockVoice.needsModel = true;
      await open();
      fireEvent.press(screen.getByTestId('search-mic'));
      expect(mockVoice.listen).not.toHaveBeenCalled();
      expect(screen.getByTestId('model-sheet')).toHaveTextContent('Search by voice');
      await act(async () => fireEvent.press(screen.getByTestId('model-sheet')));
      expect(mockVoice.listen).toHaveBeenCalledTimes(1);
      await act(async () => mockVoice.heard?.('قل لو شاء الله'));
      expect(screen.getByTestId('search-verse-10-16')).toBeTruthy();
    },
  );
});

describe('a voice search with one result opens the reader reciting (Revisely Dev, Majd, Nov 15 2026)', () => {
  const YUNUS_16 = { pageNumber: pageOfVerse({ sura: 10, ayah: 16 }), source: 'search', highlight: { sura: 10, ayah: 16, last: { sura: 10, ayah: 16 } } };

  it('one place found by voice: the reader opens there with a take starting (`recite`), and the result stays listed behind it', async () => {
    mockDev = true;
    await open();
    await act(async () => mockVoice.heard?.('قل لو شاء الله ما تلوتو عليكم'));
    expect(mockNavigation.push).toHaveBeenCalledTimes(1);
    expect(mockNavigation.push).toHaveBeenCalledWith('QuranReader', { ...YUNUS_16, recite: true });
    expect(screen.getByTestId('search-count')).toHaveTextContent('1 result');
    // Its Open in the reader opens the page as before, with no take.
    fireEvent.press(within(screen.getByTestId('search-verse-10-16')).getByTestId('search-verse-open'));
    expect(mockNavigation.push).toHaveBeenLastCalledWith('QuranReader', YUNUS_16);
  });

  it('E2E flow 18’s words (An-Naml 25’s opening) find its one place, on page 379', async () => {
    mockDev = true;
    await open();
    await act(async () => mockVoice.heard?.('ألا يسجدوا لله الذي يخرج الخبء'));
    expect(mockNavigation.push).toHaveBeenCalledWith('QuranReader', {
      pageNumber: 379,
      source: 'search',
      highlight: { sura: 27, ayah: 25, last: { sura: 27, ayah: 25 } },
      recite: true,
    });
  });

  it('never after a typed search: the microphone starts on its own only after the person spoke to the app', async () => {
    mockDev = true;
    await open();
    await search('قل لو شاء الله');
    expect(screen.getByTestId('search-count')).toHaveTextContent('1 result');
    expect(mockNavigation.push).not.toHaveBeenCalled();
  });

  it('several places stay a list', async () => {
    mockDev = true;
    await open();
    await act(async () => mockVoice.heard?.('فبأي آلاء ربكما تكذبان'));
    expect(screen.getAllByTestId(/^search-verse-55-/).length).toBeGreaterThan(1);
    expect(mockNavigation.push).not.toHaveBeenCalled();
  });

  it('only for accounts with the live check: not in the store app, nor for an account that isn’t a tester', async () => {
    await open();
    await act(async () => mockVoice.heard?.('قل لو شاء الله ما تلوتو عليكم'));
    expect(screen.getByTestId('search-verse-10-16')).toBeTruthy();
    expect(mockNavigation.push).not.toHaveBeenCalled();
    screen.unmount();
    mockDev = true;
    mockUser = { id: 'u2', previewTester: false };
    await open();
    await act(async () => mockVoice.heard?.('قل لو شاء الله ما تلوتو عليكم'));
    expect(screen.getByTestId('search-verse-10-16')).toBeTruthy();
    expect(mockNavigation.push).not.toHaveBeenCalled();
  });

  it('one place, exactly: not a place named by reference, not the closest there is, not one of several cut to one', () => {
    const hit = { sura: 10, ayah: 16, last: { sura: 10, ayah: 16 }, from: 1, to: 5, score: 1 };
    const verse = { kind: 'verse' as const, key: 'v1', hit, matched: new Set<number>() };
    expect(onlyVerseFound({ rows: [verse], total: 1, closest: false })).toBe(hit);
    expect(onlyVerseFound({ rows: [verse], total: 1, closest: true })).toBeNull();
    expect(onlyVerseFound({ rows: [verse], total: 3, closest: false })).toBeNull();
    expect(onlyVerseFound({ rows: [{ kind: 'target', key: 't0', target: { kind: 'page', page: 62 } }], total: 0, closest: false })).toBeNull();
    expect(onlyVerseFound({ rows: [], total: 0, closest: false })).toBeNull();
  });
});

describe('the redesign (Majd, Nov 16 2026: the mic in reach of a thumb, clearer results)', () => {
  it('the field and the mic are in one bar at the bottom, under the results; the keyboard pushes it up', async () => {
    await open();
    const bar = screen.getByTestId('search-bar');
    expect(within(bar).getByTestId('search-input')).toBeTruthy();
    expect(within(bar).getByTestId('search-mic')).toBeTruthy();
    const { KeyboardAvoidingView } = require('react-native');
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    // The bar comes after the body: the bottom of the screen.
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);
    const kids = React.Children.toArray(kav.props.children).filter(Boolean) as React.ReactElement<{ testID?: string }>[];
    expect(kids[kids.length - 1].props.testID).toBe('search-bar');
  });

  it('listening: what is heard so far, large, and the voice’s level; one tap on the same button stops it', async () => {
    mockVoice.status = 'listening';
    mockVoice.partial = 'قل لو شاء';
    await open();
    expect(screen.getByTestId('search-partial')).toHaveTextContent('قل لو شاء');
    expect(screen.getByTestId('search-wave')).toBeTruthy();
    expect(screen.getByLabelText('Stop listening')).toBeTruthy();
    fireEvent.press(within(screen.getByTestId('search-bar')).getByTestId('search-mic'));
    expect(mockVoice.stop).toHaveBeenCalledTimes(1);
  });

  it('a result: where it is, the ayah large, the chosen translation as given with its footnote and credit', async () => {
    mockUser = { id: 'u1', previewTester: true, translationId: 'en.sahih' };
    await open();
    await search('قل لو شاء الله');
    await act(async () => {});
    const card = screen.getByTestId('search-verse-10-16');
    expect(within(card).getByText('Yunus, ayah 16', { normalizer: (t) => plainText(t).trim() })).toBeTruthy();
    expect(within(card).getByTestId('search-verse-arabic')).toBeTruthy();
    expect(within(card).getByTestId('search-verse-translation')).toHaveTextContent(/Had Allah willed/);
    expect(within(card).getByText('A note on it.', { exact: false })).toBeTruthy();
    expect(within(card).getByTestId('search-verse-credit')).toHaveTextContent(/Saheeh International.*v1\.1\.2.*QuranEnc\.com/);
    expect(mockTranslation.calls).toEqual([[10, 16, 'en.sahih']]);
  });

  it('Copy puts the ayah and where it is on the clipboard, and says “Copied”; Share hands the same to the share sheet', async () => {
    const { Share } = require('react-native');
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await open();
    await search('قل لو شاء الله');
    const card = screen.getByTestId('search-verse-10-16');
    fireEvent.press(within(card).getByTestId('search-verse-copy'));
    expect(mockClipboard.copied).toHaveLength(1);
    expect(mockClipboard.copied[0]).toMatch(/تَعْقِلُونَ﴿ ١٦ ﴾/);
    expect(mockClipboard.copied[0]).toMatch(/Yūnus, Ayah 16$/);
    expect(screen.getByText('Copied')).toBeTruthy();
    fireEvent.press(within(card).getByTestId('search-verse-share'));
    expect(share).toHaveBeenCalledWith({ message: mockClipboard.copied[0] });
    share.mockRestore();
  });
});
