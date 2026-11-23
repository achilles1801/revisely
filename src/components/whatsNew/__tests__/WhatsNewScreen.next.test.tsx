// The mistake detection release's walkthrough (1.0.5), live: every account set up before it goes through it once, Recite
// first, on a phone that streams the microphone (every 1.0.5 binary).

import React from 'react';
import { Dimensions } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockApp = { user: { id: 'u1', previewTester: false }, markWhatsNewSeen: jest.fn(async () => undefined) };
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
// The store app (not Revisely Dev), on a phone that streams the microphone (Recite's own gate).
jest.mock('../../../lib/variant', () => ({ ...jest.requireActual('../../../lib/variant'), isDevVariant: () => false }));
jest.mock('../../../lib/recite/micSource', () => ({ ...jest.requireActual('../../../lib/recite/micSource'), isMicStreamAvailable: () => true }));

import { WhatsNewScreen } from '../WhatsNewScreen';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DesignProvider } from '../../../design/DesignContext';
import { CURRENT_RELEASE, NEXT_RELEASE } from '../../../lib/help/whatsNew';
import { loadWhatsNew, resetWhatsNewForTests } from '../../../lib/whatsNew/state';
import { setQuranWordsForTests } from '../../../lib/recite/quranWords';
import { wordsData } from '../../../lib/recite/__fixtures__/quranWords';

async function show(mode: 'required' | 'forced' | 'replay') {
  await loadWhatsNew('u1');
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <WhatsNewScreen mode={mode} onClose={jest.fn()} />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}
const title = () => screen.getByTestId('whats-new-title').props.children;

beforeAll(() => setQuranWordsForTests(wordsData()));
afterAll(() => setQuranWordsForTests(null));
beforeEach(async () => {
  await AsyncStorage.clear();
  resetWhatsNewForTests();
});

describe('<WhatsNewScreen /> the mistake detection release (1.0.5), live', () => {
  it("an App Store account's walkthrough: mistake detection first, then Insights, then the rest", async () => {
    expect(NEXT_RELEASE).toBeNull();
    expect(CURRENT_RELEASE.id).toBe('1.0.5');
    // An iPhone at the usual text size: the moment plays (past 1.6× text, card 1 is its words, as any card).
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
    await show('required');
    const titles = CURRENT_RELEASE.cards.map((c) => c.title);
    // Card 1 is a moment: a take plays, Skip goes to its end, where its words and Next are.
    expect(screen.getByTestId('recite-moment')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recite-moment-skip'));
    await act(async () => {});
    expect(title()).toBe(titles[0]);
    for (let i = 1; i < titles.length; i++) {
      fireEvent.press(screen.getByTestId('whats-new-next'));
      await act(async () => {});
      expect(title()).toBe(titles[i]);
    }
  });

  it('a replay shows the same release, from its first card', async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
    await show('replay');
    expect(screen.getByTestId('recite-moment')).toBeTruthy();
  });
});
