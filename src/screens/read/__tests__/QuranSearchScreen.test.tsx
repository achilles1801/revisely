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
let mockUser: { id: string; previewTester?: boolean } = { id: 'u1', previewTester: true };
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
};
jest.mock('../../../components/search/useVoiceSearch', () => ({
  useVoiceSearch: (onHeard: (text: string) => void, enabled: boolean) => {
    mockVoice.heard = onHeard;
    return { ...mockVoice, available: enabled && mockVoice.available };
  },
}));

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
    fireEvent.press(row);
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
    fireEvent.press(row);
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
    // Its row opens the page as before, with no take.
    fireEvent.press(screen.getByTestId('search-verse-10-16'));
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
