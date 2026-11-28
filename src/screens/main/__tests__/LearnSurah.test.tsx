// Learn's player (BEHAVIOUR.md BEGIN-7): Listen plays the ayah three times at 0.75× in Al-Husary's Mu'allim recitation,
// Repeat adds a pause as long as it after each, another ayah or step stops what was playing, and leaving gives the
// player back as it was (the reader's Audio Options and reciter). And its words stay whole on an SE at the largest text:
// the steps wrap rather than clip, Learn next's name wraps beside its button (BEGIN-6).
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { paletteV2 } from '../../../theme/v2';
import { setQuranWordsForTests } from '../../../lib/recite/quranWords';
import { wordsData } from '../../../lib/recite/__fixtures__/quranWords';
import { LearnNextRow } from '../../../components/beginner/LearnNextRow';

const mockPalette = paletteV2(false, 'indigo');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const { Text: T } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{name}</T> };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('../../../lib/saheeh', () => ({
  peekSaheehVerse: () => null,
  getSaheehVerse: () => Promise.reject(new Error('offline')),
}));
jest.mock('../../../lib/nowPlaying', () => ({ setPresenting: jest.fn() }));

type Listener = (s: { status: string; verse: unknown; owner?: string }) => void;
const mockRecitation = {
  state: { status: 'idle', verse: null as unknown, owner: undefined as string | undefined },
  options: { speed: 1.25, repeat: 1, pauseFactor: 0 },
  voice: 'alafasy:murattal',
  listeners: new Set<Listener>(),
  calls: [] as unknown[][],
  getState() {
    return this.state;
  },
  getOptions() {
    return this.options;
  },
  getVoice() {
    return this.voice;
  },
  setOptions(o: object) {
    this.calls.push(['setOptions', o]);
    this.options = { ...this.options, ...o };
  },
  setVoice(v: string) {
    this.calls.push(['setVoice', v]);
    this.voice = v;
  },
  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  },
  play(verse: unknown, advance: (v: unknown) => unknown, owner: string) {
    this.calls.push(['play', verse, advance(verse), owner]);
    this.state = { status: 'playing', verse, owner };
    this.listeners.forEach((l) => l(this.state));
  },
  pause() {
    this.calls.push(['pause']);
  },
  resume() {
    this.calls.push(['resume']);
  },
  stop(owner?: string) {
    this.calls.push(['stop', owner]);
    if (owner === undefined || this.state.owner === owner) {
      this.state = { status: 'idle', verse: null, owner: undefined };
      this.listeners.forEach((l) => l(this.state));
    }
  },
};
jest.mock('../../../lib/recitation', () => ({
  ...jest.requireActual('../../../lib/recitation'),
  getRecitation: () => mockRecitation,
}));

const mockNavigation = { goBack: jest.fn(), replace: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ key: 'learn', params: { sura: 108 } }),
}));
jest.mock('../../../context/AppContext', () => ({
  useApp: () => ({ user: { id: 'u' }, pages: [], updatePages: jest.fn(async () => undefined) }),
}));

import LearnSurahScreen from '../LearnSurahScreen';

beforeAll(() => setQuranWordsForTests(wordsData()));
afterAll(() => setQuranWordsForTests(null));
beforeEach(() => {
  mockRecitation.calls = [];
  mockRecitation.state = { status: 'idle', verse: null, owner: undefined };
});

async function open() {
  const view = render(<LearnSurahScreen />);
  await act(async () => undefined);
  return view;
}

const played = () => mockRecitation.calls.filter((c) => c[0] !== 'stop');

describe('[BEGIN-7] Learn’s player', () => {
  it('Listen: the ayah alone, three times at 0.75×, in Al-Husary’s Mu’allim recitation, as Learn’s own', async () => {
    await open();
    expect(screen.getByTestId('learn-arabic')).toBeTruthy();
    fireEvent.press(screen.getByTestId('learn-play'));
    expect(played()).toEqual([
      ['setVoice', 'husary:muallim'],
      ['setOptions', { speed: 0.75, repeat: 3, pauseFactor: 0 }],
      // This ayah alone: nothing follows it.
      ['play', { sura: 108, ayah: 1 }, null, 'learn-surah'],
    ]);
    // Playing, the button pauses.
    fireEvent.press(screen.getByTestId('learn-play'));
    expect(played().pop()).toEqual(['pause']);
  });

  it('Repeat: a pause as long as the ayah after each play; the next ayah stops what was playing', async () => {
    await open();
    fireEvent.press(screen.getByTestId('learn-step-repeat'));
    fireEvent.press(screen.getByTestId('learn-next-ayah'));
    fireEvent.press(screen.getByTestId('learn-play'));
    expect(played().slice(-2)).toEqual([
      ['setOptions', { speed: 0.75, repeat: 3, pauseFactor: 1 }],
      ['play', { sura: 108, ayah: 2 }, null, 'learn-surah'],
    ]);
    fireEvent.press(screen.getByTestId('learn-next-ayah'));
    expect(mockRecitation.state.status).toBe('idle');
  });

  it('leaving stops Learn’s recitation and gives the player back its options and reciter', async () => {
    const view = await open();
    fireEvent.press(screen.getByTestId('learn-play'));
    view.unmount();
    expect(mockRecitation.calls.slice(-3)).toEqual([
      ['stop', 'learn-surah'],
      ['setOptions', { speed: 1.25, repeat: 1, pauseFactor: 0 }],
      ['setVoice', 'alafasy:murattal'],
    ]);
  });

  it('Without looking hides the ayah, and the rest of the surah, until shown', async () => {
    await open();
    fireEvent.press(screen.getByTestId('learn-step-recall'));
    expect(screen.queryByTestId('learn-arabic')).toBeNull();
    expect(screen.queryByTestId('learn-play')).toBeNull();
    fireEvent.press(screen.getByTestId('learn-show'));
    expect(screen.getByTestId('learn-arabic')).toBeTruthy();
  });
});

describe('[BEGIN-6] [BEGIN-7] words stay whole at the largest text', () => {
  it('the steps wrap onto another line rather than clip, and no Learn text is held to a number of lines', async () => {
    await open();
    expect(StyleSheet.flatten(screen.getByTestId('learn-steps').props.style)).toMatchObject({ flexWrap: 'wrap' });
    // Learn's own words (the bar's title and the buttons' labels are the shared components', made to fit).
    for (const el of screen.getByTestId('learn-surah').findAllByType(Text)) expect(el.props.numberOfLines).toBeUndefined();
  });

  it('Learn next: 0, 1, a few and all but one learned; the name wraps beside its button, never pushing it off', () => {
    for (const learned of [0, 1, 7, 37]) {
      const view = render(<LearnNextRow sura={83} learned={learned} onLearn={() => undefined} />);
      expect(screen.getByTestId('learn-next-learned').props.children).toBe(`${learned} of 38 learned`);
      const name = screen.getByTestId('learn-next-name');
      expect(name.props.numberOfLines).toBeUndefined();
      expect(StyleSheet.flatten(name.parent?.parent?.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
      view.unmount();
    }
  });
});
