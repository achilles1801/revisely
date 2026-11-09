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
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: { id: 'u1', previewTester: true } }) }));
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
  useVoiceSearch: (onHeard: (text: string) => void) => {
    mockVoice.heard = onHeard;
    return mockVoice;
  },
}));

import QuranSearchScreen from '../QuranSearchScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { setQuranWordsForTests } from '../../../lib/recite/quranWords';
import { wordsData } from '../../../lib/recite/__fixtures__/quranWords';
import { pageOfVerse } from '../../../lib/verses';

beforeAll(() => setQuranWordsForTests(wordsData()));
afterAll(() => setQuranWordsForTests(null));

beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = undefined;
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
      highlight: { sura: 10, ayah: 16 },
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
});
