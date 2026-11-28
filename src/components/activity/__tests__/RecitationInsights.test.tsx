// Insights' Recitation (Revisely Dev, ACT-44 and RINS-2), through InsightsView: the trend first (mistakes a page against
// the period before), mistakes by kind week by week on the one chart (a tap on a week, a tap on a kind), the words fixed
// against those still slipping with the worst passage and See all (its similar ayahs and, with Smart Tracking, passages
// rated strong), your takes' length, and each row opening the reader at its ayahs. The page with 0, 1, a few and many
// takes, a young account and the longest figures, at an SE's and a Pro Max's width: tests/scenarios/properties/
// recitationPage.property.ts (its fit) and the last tests here (its chart never collapses).
import React from 'react';
import { StyleSheet } from 'react-native';
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
import { harakatClip } from '../../../../jest/arabicLines';
import { liveTakes } from '../../../lib/reciteInsights/insights';
import { kindBars, perPage, rateOf, takeLengths } from '../../../lib/reciteInsights/trend';
import { perPageText, takesLine, takesTitle } from '../../../lib/reciteInsights/trendWords';

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

describe('Insights: Recitation’s page (ACT-44, RINS-2)', () => {
  const inRange = () => liveTakes(records).filter((r) => r.day >= day(-29));

  it('[ACT-44] starts from the trend: mistakes a page in the range, against the month before', async () => {
    await open(data());
    const section = text('insights-recitation');
    expect(section).toContain('Recitation');
    // Five takes in the range: 6 mistakes (the Not clear letter in Al-Kahf 23 never counts). The take 30 days ago, the
    // month before, had none: so up, from 0.
    const now = rateOf(inRange(), words);
    expect(now.mistakes).toBe(6);
    expect(text('insights-recitation-rate')).toBe(perPageText(perPage(now)!));
    expect(text('insights-recitation-trend-up')).toBe('from 0');
    expect(text('insights-recitation-line')).toMatch(/^5 takes · \d+\.\d% of words said right · last 30 days, against the month before$/);
  });

  it('[ACT-44] mistakes by kind, a bar a week: a tap on a week sets the line, a tap on a kind shows it alone', async () => {
    await open(data());
    // 30 days opens on 4 weeks: a bar a week from its Monday, this week last (16 Nov 2026 is a Monday).
    const bars = kindBars(records, TODAY, '4w', words);
    expect(bars.map((b) => b.key)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
    expect(text('insights-recitation-chart')).toContain('Your mistakes, week by week | a page | Wrong or skipped words | Hesitations | Harakat and letters');
    // Nothing recited this week yet: the chart opens on the newest week with takes, last week (9–15 Nov: Al-Kahf on
    // Wednesday and Saturday, Al-Baqarah on Saturday and Sunday), as its board does.
    const last = bars[2];
    expect(last.takes).toBe(4);
    expect(text('insights-recitation-pick')).toBe(`Week of 9 Nov · ${perPageText(last.mistakes / last.pages)} a page`);
    expect(screen.getByTestId('insights-recitation-bars-bar-2026-11-09').props.accessibilityState).toEqual({ selected: true });
    // A tap on it clears it: the newest week is lit, and says it has no takes. Another tap picks it again.
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-bars-bar-2026-11-09')));
    expect(text('insights-recitation-pick')).toBe('This week · no takes');
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-bars-bar-2026-11-09')));
    expect(text('insights-recitation-pick')).toBe(`Week of 9 Nov · ${perPageText(last.mistakes / last.pages)} a page`);
    // Its kinds stacked: wrong or skipped words (4) and a harakat slip, no hesitation.
    expect(screen.queryByTestId('insights-recitation-bars-part-2026-11-09-0')).toBeTruthy();
    expect(screen.queryByTestId('insights-recitation-bars-part-2026-11-09-1')).toBeNull();
    expect(screen.queryByTestId('insights-recitation-bars-part-2026-11-09-2')).toBeTruthy();
    // Harakat and letters alone: last week's one slip; the week before, none.
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-kind-slips')));
    expect(text('insights-recitation-pick')).toBe(`Week of 9 Nov · ${perPageText(1 / last.pages)} harakat and letter slips a page`);
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-bars-bar-2026-11-02')));
    expect(text('insights-recitation-pick')).toBe('Week of 2 Nov · no harakat and letter slips');
    // The same week again clears it: the newest is lit.
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-bars-bar-2026-11-02')));
    expect(text('insights-recitation-pick')).toBe('This week · no takes');
    // A year: a bar a month.
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-span-1y')));
    expect(text('insights-recitation-chart')).toContain('Your mistakes, month by month');
    expect(screen.getAllByTestId(/^insights-recitation-bars-bar-/)).toHaveLength(12);
  });

  it('[ACT-44] fixed and still slipping: the words still marked, the share fixed, the worst passage and See all', async () => {
    await open(data());
    expect(text('insights-recitation-fixed-tile')).toBe('0 | words fixed so far: a word is fixed once it’s said right on 2 days');
    // Al-Kahf 22–23's three (the Not clear letter remembered like a slip, RMEM-2) and Al-Baqarah 48's one.
    expect(text('insights-recitation-slipping-tile')).toBe('4 | still slipping, in 2 passages; 4 new in the last 30 days');
    expect(text('insights-recitation-fixed')).toContain('0 of the 4 words you’ve slipped on are fixed');
    // The passage that slips most, then See all: the other passage, the similar ayah and the passage rated strong.
    expect(text('insights-recitation-slip-18-22')).toContain('Al-Kahf, 4th page · middle | 3 words still marked · wrong in 3 of 4 takes');
    expect(screen.queryByTestId('insights-recitation-slip-2-48')).toBeNull();
    expect(text('insights-recitation-see-all')).toBe('See all 2 passages');
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-see-all')));
    expect(text('insights-recitation-slip-2-48')).toContain('Al-Baqarah, 6th page · end | 1 word still marked · wrong in 2 of 2 takes');
    expect(text('insights-recitation-similar-2-48')).toBe('Al-Baqarah 48 → 123 | You went on with the similar ayah · twice, last yesterday');
    expect(text('insights-recitation-strong-2-48')).toBe('Al-Baqarah, 6th page · end | Rated strong · wrong in 2 takes');
    expect(screen.queryByTestId('insights-recitation-strong-18-22')).toBeNull();
  });

  it('[ACT-44] a word said right on 2 days is fixed, and leaves the words still slipping', async () => {
    const right = (offset: number) => take(offset, KAHF, [mark(w23 + 1, 'letter', { sure: 'likely' })], 0.99);
    // Al-Kahf 22 said right on the next two revision days after its last slip; 23's harakat too.
    await open(data({ recitation: { records: [...records, right(0)].concat([take(-1, KAHF, [mark(w23 + 1, 'letter', { sure: 'likely' })], 0.99)]), words } }));
    expect(text('insights-recitation-fixed-tile')).toBe('2 | words fixed: said right on 2 days, 2 of them in the last 30 days');
    expect(text('insights-recitation-slipping-tile')).toBe('2 | still slipping, in 2 passages; 2 new in the last 30 days');
    expect(text('insights-recitation-fixed')).toContain('2 of the 4 words you’ve slipped on are fixed');
  });

  it('[ACT-44] your takes: the usual length and time, the longest, long takes against short ones', async () => {
    await open(data());
    const l = takeLengths(records, TODAY, 30, words)!;
    expect(text('insights-recitation-takes-title')).toBe(plainText(takesTitle(l)));
    expect(takesTitle(l)).toMatch(/^Usually .+, about 2 minutes$/);
    // Al-Kahf 17–26 reaches two pages (295–296): a long take; Al-Baqarah 40–48, one: a short one.
    expect(l.long?.takes).toBe(3);
    expect(l.short?.takes).toBe(2);
    expect(text('insights-recitation-takes-line')).toBe(plainText(takesLine(l, TODAY)));
    expect(takesLine(l, TODAY)).toMatch(/^Longest: .+\. Takes of 2 pages or more: [\d.]+ mistakes a page; shorter ones: [\d.]+\.$/);
  });

  it('[RINS-2] a row opens the reader at its ayahs, and Ask opens Revo on the section', async () => {
    await open(data());
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-slip-18-22')));
    expect(onOpenAyahs).toHaveBeenCalledWith(18, 22, 23);
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-see-all')));
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-similar-2-48')));
    expect(onOpenAyahs).toHaveBeenLastCalledWith(2, 48, 48);
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-ask')));
    expect(openRevo).toHaveBeenCalledWith({ attach: { kind: 'insight', label: 'Recitation', insight: 'recitation' } });
  });

  it('[RINS-2] Smart Tracking on: Weak spots count Recite’s marks', async () => {
    await open(data());
    expect(text(`weak-spot-${KAHF_PAGE}`)).toContain('3 words still marked in Recite');
  });

  it('[RINS-2] Smart Tracking off: nothing about strength; rows say when the passage was last recited', async () => {
    await open(data({ smartTracking: false }));
    await act(async () => fireEvent.press(screen.getByTestId('insights-recitation-see-all')));
    const section = text('insights-recitation');
    expect(section).not.toMatch(/strong|weak|rated|wrong in/i);
    expect(text('insights-recitation-slip-18-22')).toContain('3 words still marked · last recited Saturday');
    expect(screen.queryByTestId('insights-weak-spots')).toBeNull();
  });

  it('[RINS-2] the words still marked show on their highlights, in the page’s colours', async () => {
    await open(data());
    const row = screen.getByTestId('insights-recitation-slip-18-22');
    const chips = within(row).getAllByText(/[؀-ۿ]/, { includeHiddenElements: true });
    // The Not clear letter too, remembered like a slip (RMEM-2).
    expect(chips.map((c) => c.props.children)).toEqual([words.uthmani(w22), words.uthmani(w23), words.uthmani(w23 + 1)]);
    // Each word whole: a line that holds every haraka (arabicFullV2; a shorter one cut them off).
    for (const c of chips) expect(harakatClip(c.props.style)).toBeNull();
  });

  it('[ACT-44] no takes in the range: it says so, and still shows what slips', async () => {
    const old = records.map((r) => (r.kind === 'take' ? { ...r, day: day(-40), createdAt: r.createdAt - 40 * 86_400_000 } : r));
    await open(data({ recitation: { records: old, words } }));
    expect(text('insights-recitation-figure')).toBe('No takes in 30 days');
    expect(text('insights-recitation-no-takes')).toBe('No takes in the last 4 weeks');
    expect(screen.queryByTestId('insights-recitation-slipping-tile')).toBeTruthy();
    expect(screen.queryByTestId('insights-recitation-takes')).toBeNull();
  });

  it('[ACT-44] takes kept without their final answer only: the takes, no rate', async () => {
    const unfinished = [{ ...take(-3, KAHF, [mark(w22, 'word')], 0.98), unfinished: true as const }];
    await open(data({ recitation: { records: unfinished, words } }));
    expect(screen.queryByTestId('insights-recitation-rate')).toBeNull();
    // Nothing before it to compare with: no chip, and the line says only its span.
    expect(text('insights-recitation-line')).toBe('1 take · last 30 days');
  });

  it('[ACT-44] takes without a mistake say so in place of empty bars', async () => {
    const clean = [take(-3, KAHF, [], 1), take(-1, BAQ, [], 1)];
    await open(data({ recitation: { records: clean, words } }));
    expect(text('insights-recitation-rate')).toBe('0');
    expect(text('insights-recitation-clean')).toBe('No mistakes in any of these takes');
    expect(screen.queryByTestId('insights-recitation-fixed')).toBeNull();
  });

  it('[RINS-2] nothing shows for an account that doesn’t recite', async () => {
    await open(data({ recitation: null }));
    expect(screen.queryByTestId('insights-recitation')).toBeNull();
  });
});

describe('Recitation’s chart never collapses (ACT-44)', () => {
  const many = (): MemoryRecord[] => {
    const out: MemoryRecord[] = [];
    for (let i = 0; i < 160; i++) {
      const sura = 2 + (i % 40);
      const [a] = words.verseRange(sura, 1);
      const to = Math.min(a + 300, words.verseRange(sura, 1)[1] + 300);
      out.push(take(-(i % 85), [a, to], [mark(a + 3, 'word'), mark(a + 9, 'added'), mark(a + 15, 'harakat'), mark(a + 20, 'skipped')], 0.95));
    }
    return out;
  };

  it.each([
    ['one take', () => [take(-1, KAHF, [mark(w22, 'word')], 0.98)]],
    ['a few takes', () => records.slice(0, 3)],
    ['a young account (this week only)', () => [take(0, KAHF, [mark(w22, 'word')], 0.98), take(0, BAQ, [mark(w48, 'harakat')], 0.98)]],
    ['many takes', many],
  ])('[ACT-44] %s: every slot of the span, the bars with mistakes drawn', async (_name, make) => {
    const recs = (make as () => MemoryRecord[])();
    for (const [range, slots] of [[30, 4], [90, 13], ['all', 12]] as const) {
      await open(data({ range, firstDay: '2026-01-01', recitation: { records: recs, words } }));
      const cols = screen.getAllByTestId(/^insights-recitation-bars-bar-/);
      expect(cols).toHaveLength(slots);
      // A bar with mistakes is drawn at least 4 pt tall; none is wider than the chart allows (ACT-41).
      const fills = screen.queryAllByTestId(/^insights-recitation-bars-fill-/);
      expect(fills.length).toBeGreaterThan(0);
      for (const f of fills) expect(StyleSheet.flatten(f.props.style).height).toBeGreaterThanOrEqual(4);
      screen.unmount();
    }
  });
});
