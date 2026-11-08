// The pictures show the screens' own words: when a screen's words change, so must its picture.

import React from 'react';
import { act, render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
import { readRepo } from '../../../../jest/behaviourRules';
import { PICTURE_WORDS, pictureFor } from '../pictures';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DesignProvider } from '../../../design/DesignContext';

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

  it('each draws, hidden from VoiceOver and never touched', async () => {
    for (const p of ['activity', 'elsewhere', 'ayah'] as const) {
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
