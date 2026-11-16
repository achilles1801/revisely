// Insights' Recitation section (Revisely Dev, RINS-2), through InsightsView: the score and its line, the passages that
// keep slipping with their words on their highlights, the similar ayahs, the quiet line, Smart Tracking on and off,
// Weak spots naming words Recite still marks, and each row opening the reader at its ayahs.
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InsightsView, type InsightsData } from '../InsightsView';
import { paletteV2 } from '../../../theme/v2';
import { quranWords } from '../../../lib/recite/__fixtures__/quranWords';
import type { Mark } from '../../../lib/reciteLive/contract';
import type { MemoryRecord, TakeRecord } from '../../../lib/reciteMemory/record';
import { openRevo } from '../../../lib/revo/open';
import { plainText } from '../../../lib/passages';

const mockPalette = paletteV2(false, 'indigo');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: [], user: { smartTrackingEnabled: true } }) }));
jest.mock('../../../lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../lib/revo/useRevoContext', () => ({ useRevoContext: () => ({ sources: () => null }) }));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const TODAY = '2026-11-16';
const words = quranWords();
const day = (offset: number) => new Date(Date.UTC(2026, 10, 16 + offset)).toISOString().slice(0, 10);

// Al-Kahf 17–26, recited four times; Al-Baqarah 40–48 twice, slipping into 2:123.
const KAHF: [number, number] = [words.verseRange(18, 17)[0], words.verseRange(18, 26)[1] - 1];
const BAQ: [number, number] = [words.verseRange(2, 40)[0], words.verseRange(2, 48)[1] - 1];
const w22 = words.verseRange(18, 22)[0] + 3;
const w23 = words.verseRange(18, 23)[0] + 2;
const w48 = words.verseRange(2, 48)[0] + 11;

const mark = (w: number, kind: Mark['kind'], extra: Partial<Mark> = {}): Mark => {
  const r = words.ref(w);
  return { id: `${w}:${kind}:`, w, ayah: [r.sura, r.ayah], kind, sure: 'clear', ...extra };
};

let n = 0;
const take = (offset: number, [from, to]: [number, number], marks: Mark[], accuracy: number): TakeRecord => {
  n += 1;
  const createdAt = Date.UTC(2026, 10, 16 + offset, 19) + n * 1000;
  return { id: `t${n}`, kind: 'take', take: null, createdAt, rev: createdAt, day: day(offset), level: 'words', hidden: false, from, to, secs: 120, mistakes: marks.length, tajweed: 0, unclear: 0, accuracy, marks, passed: [], recordingId: null };
};

const records: MemoryRecord[] = [
  take(-30, KAHF, [], 0.97),
  take(-9, KAHF, [mark(w22, 'word')], 0.98),
  take(-5, KAHF, [mark(w22, 'word'), mark(w23, 'harakat'), mark(w23 + 1, 'letter', { sure: 'likely' })], 0.975),
  take(-2, KAHF, [mark(w22, 'word')], 0.985),
  take(-2, BAQ, [mark(w48, 'word', { into: { w: 1900, ayah: [2, 123] } })], 0.99),
  take(-1, BAQ, [mark(w48, 'skipped', { into: { w: 1900, ayah: [2, 123] } })], 0.99),
];

const KAHF_PAGE = words.pageOf(w22);

const data = (over: Partial<InsightsData> = {}): InsightsData => ({
  today: TODAY,
  memorized: new Set([KAHF_PAGE, words.pageOf(w48)]),
  learning: new Set(),
  rating: (p) => (p === KAHF_PAGE ? 2 : 5),
  ratedWeak: new Map(),
  revised: [],
  read: [],
  memorizations: [],
  capacity: 5,
  revo: true,
  smartTracking: true,
  range: 30,
  recitation: { records, words },
  ...over,
});

let onOpenAyahs: jest.Mock;
async function open(d: InsightsData) {
  onOpenAyahs = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InsightsView data={d} onReviseTomorrow={jest.fn()} onPlanIt={jest.fn()} onOpenPage={jest.fn()} onOpenAyahs={onOpenAyahs} onTurnOnSmartTracking={jest.fn()} />
    </SafeAreaProvider>,
  );
  await act(async () => {});
}
const text = (testID: string) => plainText(within(screen.getByTestId(testID)).getAllByText(/./).map((t) => [t.props.children].flat().join(''))
    // (an icon's glyph is text too: left out)
    .filter((t) => t.trim() !== '' && !/^[\uE000-\uF8FF]+$/.test(t)).join(' | '));

beforeEach(async () => {
  await AsyncStorage.clear();
  (openRevo as jest.Mock).mockClear();
});

describe('Insights: Recitation (RINS-2)', () => {
  it('[RINS-2] shows the range’s score and how it moved, the passages still slipping, the similar ayahs and the quiet line', async () => {
    await open(data());
    const section = text('insights-recitation');
    expect(section).toContain('Recitation');
    expect(section).toContain('Your takes with Mark mistakes in 30 days');
    // Five takes in the range (the one 30 days ago is the window before).
    expect(text('insights-recitation-figure')).toMatch(/^\d+\.\d% \| 5 takes · up from 97\.0%$/);
    expect(screen.getByTestId('insights-recitation-weeks').props.accessibilityLabel).toBe('Score by week: no takes, no takes, no takes, 97.0%, no takes, no takes, 98.0%, this week 98.3%');
    // Al-Kahf 22–23: a wrong word and a harakat slip still marked; Not clear never.
    expect(text('insights-recitation-slip-18-22')).toContain('Al-Kahf, ayahs 22–23 | 2 words still marked · wrong in 3 of 4 takes');
    expect(text('insights-recitation-slip-2-48')).toContain('Al-Baqarah, ayah 48 | 1 word still marked · wrong in 2 of 2 takes');
    expect(text('insights-recitation-similar-2-48')).toBe('Al-Baqarah 48 → 123 | You went on with the similar ayah · twice, last yesterday');
    // Words first; the Not clear letter in Al-Kahf 23 never counted. Nothing cleared yet, so one line.
    expect(text('insights-recitation-quiet')).toBe('Mostly words: 4 wrong · 1 skipped · 1 harakat. 1 wasn’t clear enough to check (not counted).');
  });

  it('[RINS-2] a row opens the reader at its ayahs, and Ask opens Revo on the section', async () => {
    await open(data());
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-slip-18-22')));
    expect(onOpenAyahs).toHaveBeenCalledWith(18, 22, 23);
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-similar-2-48')));
    expect(onOpenAyahs).toHaveBeenLastCalledWith(2, 48, 48);
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-ask')));
    expect(openRevo).toHaveBeenCalledWith({ attach: { kind: 'insight', label: 'Recitation', insight: 'recitation' } });
  });

  it('[RINS-2] Smart Tracking on: a passage rated strong that still slips is named, and Weak spots count Recite’s marks', async () => {
    await open(data());
    expect(text('insights-recitation-strong-2-48')).toBe('Al-Baqarah, ayah 48 | Rated strong · wrong in 2 takes');
    expect(screen.queryByTestId('insights-recitation-strong-18-22')).toBeNull();
    expect(text(`weak-spot-${KAHF_PAGE}`)).toContain('2 words still marked in Recite');
  });

  it('[RINS-2] Smart Tracking off: nothing about strength; rows say when the passage was last recited', async () => {
    await open(data({ smartTracking: false }));
    const section = text('insights-recitation');
    expect(section).not.toMatch(/strong|weak|rated|wrong in/i);
    expect(text('insights-recitation-slip-18-22')).toContain('2 words still marked · last recited Saturday');
    expect(screen.queryByTestId('insights-weak-spots')).toBeNull();
  });

  it('[RINS-2] the words still marked show on their highlights, in the page’s colours', async () => {
    await open(data());
    const row = screen.getByTestId('insights-recitation-slip-18-22');
    const chips = within(row).getAllByText(/[؀-ۿ]/, { includeHiddenElements: true });
    expect(chips.map((c) => c.props.children)).toEqual([words.uthmani(w22), words.uthmani(w23)]);
  });

  it('[RINS-2] nothing shows for an account that doesn’t recite', async () => {
    await open(data({ recitation: null }));
    expect(screen.queryByTestId('insights-recitation')).toBeNull();
  });
});
