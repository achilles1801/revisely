// Screen readers in the live recitation: the Undo's time, and the bar's words read with their marks.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: {}, theme: {}, isDark: false }) }));

import { undoMs } from '../a11y';
import { spokenBarWord } from '../ReciteBar';

describe('screen readers in the live recitation', () => {
  it('the Undo after Not a mistake stays 15 s with a screen reader (there is a toast to reach first), 5 s without', () => {
    expect(undoMs(false)).toBe(5000);
    expect(undoMs(true)).toBe(15000);
  });

  it('a bar word says its mark in words: colour is never the only signal', () => {
    expect(spokenBarWord({ text: 'وَأُوهِيَتْ', tone: 'wrong' })).toBe('وَأُوهِيَتْ, wrong word,');
    expect(spokenBarWord({ text: 'شَىْءٍ', tone: 'slip' })).toBe('شَىْءٍ, slip,');
    expect(spokenBarWord({ text: 'عَظِيمٌ', tone: 'tajweed' })).toBe('عَظِيمٌ, tajweed note,');
    expect(spokenBarWord({ text: 'مِن', tone: 'current' })).toBe('مِن');
  });
});
