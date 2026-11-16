// The pictures show the screens' own words: when a screen's words change, so must its picture.

import React from 'react';
import { act, render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
import { readRepo } from '../../../../jest/behaviourRules';
import { PICTURE_WORDS, demoTakeOf, pictureFor } from '../pictures';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DesignProvider } from '../../../design/DesignContext';
import { setQuranWordsForTests } from '../../../lib/recite/quranWords';
import { quranWords, wordsData } from '../../../lib/recite/__fixtures__/quranWords';

beforeAll(() => setQuranWordsForTests(wordsData()));
afterAll(() => setQuranWordsForTests(null));

const source = (p: string) => readRepo(p).replace(/’/g, "'");
const plain = (s: string) => s.replace(/’/g, "'");

describe('the pictures', () => {
  it("the + sheet's title and rows are AddToDaySheet's", () => {
    const sheet = source('src/components/activity/AddToDaySheet.tsx');
    expect(sheet).toContain('Add to ${dayName}');
    expect(PICTURE_WORDS.addTitle).toBe('Add to today');
    for (const [title, sub] of PICTURE_WORDS.rows) {
      expect(sheet).toContain(`'${plain(title)}'`);
      // "Today's pages, …" is `${whose} pages, …` there.
      expect(sheet).toContain(plain(sub).replace("Today's ", ''));
    }
  });

  it("the demo take is Al-Mulk 1–2 from the word data, as src/data/whatsNewTake.json holds it", () => {
    // UPDATE_WHATS_NEW_TAKE=1 writes the copy the pictures read (so the first card draws before the word data loads).
    const { writeFileSync, readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const file = join(__dirname, '../../../data/whatsNewTake.json');
    const fresh = demoTakeOf(quranWords());
    if (process.env.UPDATE_WHATS_NEW_TAKE === '1') writeFileSync(file, JSON.stringify(fresh) + '\n');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(fresh);
    // Three marks, one of each colour, on words of the two ayat; the word being said is on the last line.
    expect(fresh.marks.map((m) => m.kind)).toEqual(['word', 'harakat', 'tajweed']);
    expect(fresh.lines[fresh.lines.length - 1].some((x) => x.w === fresh.cursor)).toBe(true);
  });

  it("the drill's button is the take summary's", () => {
    expect(source('src/components/reciteLive/TakeSummarySheet.tsx')).toContain(`title="${PICTURE_WORDS.drill}"`);
  });

  it('each draws, hidden from VoiceOver and never touched', async () => {
    for (const p of ['activity', 'elsewhere', 'ayah', 'recite', 'marks', 'again', 'gaps'] as const) {
      render(
        <DesignProvider initial={{}}>
          <ThemeProvider>{pictureFor(p)}</ThemeProvider>
        </DesignProvider>,
      );
      await act(async () => {});
      const window = screen.getByTestId(`whats-new-picture-${p}`, { includeHiddenElements: true });
      expect(window.props.pointerEvents).toBe('none');
      expect(window.props.accessibilityElementsHidden).toBe(true);
      expect(window.props.importantForAccessibility).toBe('no-hide-descendants');
      screen.unmount();
    }
  });

  it('name surahs and juz, never page numbers (NAME-1)', () => {
    const file = source('src/components/whatsNew/pictures.tsx');
    expect(file).not.toMatch(/'[^']*\bp\.\s*\d[^']*'|pp\.\s*\d/);
  });
});
