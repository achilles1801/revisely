// Consistency's own page (BEHAVIOUR.md ACT-43, Revisely Dev) never breaks on the data it gets (Majd, Nov 27 2026: every
// UI brief checks 0, 1, a few and many points, a young account, the longest values, an SE and a Pro Max, the largest text,
// light and dark). Each case renders the page and then checks what it drew: the figure and its words on one line (measured
// with the system font's own widths, jest/textWidth), a cycle's name and detail each on one line, every chart in at least
// seven slots with bars no wider than 28 pt, every label in room of its own, and nothing drawn as an empty frame.
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { textWidth } from '../../../../jest/textWidth';
import { CHROME_MAX_SCALE, STACK_AT_SCALE } from '../ChromeText';
import { chartLayout, LABEL_WIDTH, LABELS_ALL_UP_TO, MAX_BAR_WIDTH, MIN_SLOTS } from '../TapChart';
import { InsightsView, type InsightsData } from '../InsightsView';
import { setActivityOneTabForTests } from '../../../lib/release/activityOneTab';
import { paletteV2 } from '../../../theme/v2';
import { shiftDay } from '../../../lib/dayKeys';

let mockDark = false;
jest.mock('../../../context/ThemeContext', () => ({
  useTheme: () => {
    const palette = require('../../../theme/v2').paletteV2(mockDark, 'crimson');
    return { palette, theme: palette, isDark: mockDark };
  },
}));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: [], user: { smartTrackingEnabled: false } }) }));
jest.mock('../../../lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../lib/revo/useRevoContext', () => ({ useRevoContext: () => ({ sources: () => null }) }));
jest.mock('../../../services/firestoreService', () => ({ getActivityItemsBetween: jest.fn(async () => ({ revisions: [], memorized: [], reads: [] })) }));

const TODAY = '2026-11-27';
const JUZ_30 = Array.from({ length: 23 }, (_, i) => 582 + i);
const QURAN = Array.from({ length: 604 }, (_, i) => i + 1);

/** An account: revised on `revised` days (`perDay` pages a day, round the memorized pages in order), read on `read` days. */
function account({
  revised = [],
  read = [],
  memorized = JUZ_30,
  perDay = 5,
  firstDay,
  range = 30,
}: {
  revised?: string[];
  read?: string[];
  memorized?: number[];
  perDay?: number;
  firstDay: string;
  range?: InsightsData['range'];
}): InsightsData {
  let next = 0;
  const days = [...revised].sort();
  return {
    today: TODAY,
    memorized: new Set(memorized),
    learning: new Set(),
    rating: () => undefined,
    ratedWeak: new Map(),
    revised: days.map((day, i) => {
      const pages = Array.from({ length: perDay }, (_, k) => memorized[(next + k) % memorized.length]);
      next = (next + perDay) % memorized.length;
      // Mostly at 5:30 in the morning, every fourth at 9:10 at night.
      return { day, countsFor: day, pages, skipped: [], minutes: 20, occurredAt: Date.parse(`${day}T${i % 4 === 0 ? '21:10' : '05:30'}:00`) };
    }),
    read: read.map((day) => ({ day, pages: [1], minutes: 25, occurredAt: Date.parse(`${day}T06:15:00`) })),
    memorizations: [],
    capacity: perDay,
    revo: false,
    smartTracking: false,
    range,
    firstDay,
    itemsFrom: shiftDay(TODAY, -370),
  };
}

/** Every day from `from` to today, but the weekdays left out (0 Sunday … 6 Saturday). */
function everyDay(from: string, but: number[] = []): string[] {
  const out: string[] = [];
  for (let d = from; d <= TODAY; d = shiftDay(d, 1)) if (!but.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) out.push(d);
  return out;
}

const SE = 320;
const PRO_MAX = 440;
/** The page's gutters (16 each side) and a card's padding (InsightCard: 14). */
const pageWidth = (w: number) => w - 32;
const cardWidth = (w: number) => w - 32 - 28;

let dims: jest.SpyInstance | null = null;
function at(width: number, fontScale: number) {
  dims?.mockRestore();
  dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height: 900, scale: 3, fontScale });
}
afterEach(() => {
  dims?.mockRestore();
  dims = null;
  mockDark = false;
});
beforeAll(() => setActivityOneTabForTests(true));
afterAll(() => setActivityOneTabForTests(undefined));

function open(data: InsightsData) {
  return render(
    <InsightsView
      data={data}
      sections={{ order: ['consistency'], hidden: [] }}
      alone
      onReviseTomorrow={jest.fn()}
      onPlanIt={jest.fn()}
      onOpenPage={jest.fn()}
      onOpenCalendar={jest.fn()}
    />,
  );
}

const text = (id: string) => {
  const el = screen.queryByTestId(id);
  if (!el) return null;
  const flat = (n: unknown): string =>
    n == null || typeof n === 'boolean' ? '' : typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(flat).join('') : flat((n as { props?: { children?: unknown } }).props?.children);
  return flat(el.props.children);
};
const kind = (k: 'revising' | 'cycles' | 'reading') => fireEvent.press(screen.getByTestId(`pill-${k}`));

describe('[ACT-43] Consistency’s page: what it says', () => {
  it('many days: the days revised with the trend, how many days most weeks, the weeks tapped, the hours tapped (no hold)', () => {
    at(PRO_MAX, 1);
    // Revised every day but Saturdays for a year; every day in the last month.
    const days = [...new Set([...everyDay('2025-11-01', [6]), ...everyDay('2026-10-29')])];
    open(account({ revised: days, firstDay: '2025-11-01', range: 90 }));
    expect(text('consistency-revising-hero-value')).toBe('82');
    expect(text('consistency-revising-hero-unit')).toBe('of 90 days');
    expect(text('consistency-revising-hero-trend')).toBe('from 77');
    expect(screen.getByTestId('consistency-revising-hero').props.accessibilityLabel).toBe('82 of 90 days, Up from 77 the 3 months before');
    expect(text('consistency-revising-hero-line')).toBe('6 or 7 days most weeks · The last 3 months against the 3 before');
    // The weeks: 3 months by default at 3 months, this week lit; a tap on a week makes the line that week.
    expect(text('consistency-weeks-line')).toBe('This week · 6 of 6 days so far');
    expect(screen.getAllByTestId(/^consistency-weeks-chart-bar-/)).toHaveLength(13);
    fireEvent.press(screen.getByTestId('consistency-weeks-chart-bar-2026-10-18'));
    expect(text('consistency-weeks-line')).toBe('Week of 18 Oct · 6 of 7 days');
    fireEvent.press(screen.getByTestId('consistency-weeks-chart-bar-2026-10-18'));
    expect(text('consistency-weeks-line')).toBe('This week · 6 of 6 days so far');
    fireEvent.press(screen.getByTestId('consistency-weeks-span-1y'));
    expect(screen.getAllByTestId(/^consistency-weeks-chart-bar-/)).toHaveLength(52);
    // When you revise: the busiest hours, and a tap on an hour (never a hold) for its minutes.
    expect(text('consistency-hours-line')).toBe('Mostly 5–6 AM');
    const hour = screen.getByTestId('consistency-hour-bars-bar-21');
    expect(hour.props.onLongPress).toBeUndefined();
    fireEvent.press(hour);
    expect(text('consistency-hours-line')).toMatch(/^9–10 PM · /);
    fireEvent.press(screen.getByTestId('consistency-hour-bars-bar-21'));
    expect(text('consistency-hours-line')).toBe('Mostly 5–6 AM');
  });

  it('full cycles: each cycle’s days against the plan’s, the late ones by how many days', () => {
    at(PRO_MAX, 1);
    // Juz 30, five pages a day: round in 5 days. Every day for 60 days but two missed days in early November.
    const days = everyDay('2026-09-28').filter((d) => d !== '2026-11-04' && d !== '2026-11-05');
    open(account({ revised: days, firstDay: '2026-09-28', range: 30 }));
    kind('cycles');
    expect(text('consistency-cycles-hero-line')).toBe('Your plan goes round all 23 pages every 5 days.');
    expect(text('consistency-cycles-hero-unit')).toMatch(/^of \d+ on time$/);
    const details = screen.getAllByTestId(/^consistency-cycle-.*-detail$/).map((el) => text(el.props.testID));
    expect(details[0]).toMatch(/^\d+ days? · \d+ of 23 pages$/);
    expect(details.some((d) => /days late$/.test(d ?? '') || /day late$/.test(d ?? ''))).toBe(true);
    expect(details.some((d) => /on time$/.test(d ?? ''))).toBe(true);
    expect(screen.getAllByTestId(/^consistency-cycle-.*-late$/).length).toBeGreaterThan(0);
  });

  it('reading: the days read with the time, week by week', () => {
    at(PRO_MAX, 1);
    open(account({ revised: everyDay('2026-09-01'), read: everyDay('2026-09-01', [0, 2, 4, 6]), firstDay: '2026-09-01', range: 30 }));
    kind('reading');
    expect(text('consistency-reading-hero-unit')).toBe('of 30 days read');
    expect(text('consistency-reading-hero-line')).toMatch(/^\d+ h( \d+ min)? · mostly 6–7 AM$/);
    expect(text('consistency-read-weeks-line')).toMatch(/^This week · \d days? · (\d+ h )?\d+ min$/);
  });
});

describe('[ACT-43] the trend: green when better, ink when worse (never red), no pill when the same', () => {
  const pill = () => StyleSheet.flatten(screen.getByTestId('consistency-revising-hero-trend').props.style).backgroundColor;
  it.each([false, true])('dark %s', (dark) => {
    mockDark = dark;
    at(PRO_MAX, 1);
    const p = paletteV2(dark, 'crimson');
    // Better: every day of the last 30, every other day of the 30 before.
    const better = [...everyDay('2026-10-29'), ...everyDay('2026-09-29').filter((d, i) => d < '2026-10-29' && i % 2 === 0)];
    open(account({ revised: better, firstDay: '2026-06-01' }));
    expect(pill()).toBe(p.goodSubtle);
    screen.unmount();
    // Worse: the other way round.
    const worse = [...everyDay('2026-09-29').filter((d) => d < '2026-10-29'), ...everyDay('2026-10-29').filter((_, i) => i % 2 === 0)];
    open(account({ revised: worse, firstDay: '2026-06-01' }));
    expect(pill()).toBe(p.fill);
    expect(pill()).not.toBe(p.redSubtle);
    screen.unmount();
    // The same: no pill.
    open(account({ revised: everyDay('2026-06-01'), firstDay: '2026-06-01' }));
    expect(screen.queryByTestId('consistency-revising-hero-trend')).toBeNull();
    screen.unmount();
  });
});

describe('[ACT-43] Consistency’s page on young accounts and little data: never an empty frame, never one block', () => {
  it('a new account with nothing yet: 0 of 1 day, no trend, the chart’s one line, no hours, and the other two say so', () => {
    at(SE, 1);
    open(account({ firstDay: TODAY }));
    expect(text('consistency-revising-hero-value')).toBe('0');
    expect(text('consistency-revising-hero-unit')).toBe('of 1 day');
    expect(screen.queryByTestId('consistency-revising-hero-trend')).toBeNull();
    expect(text('consistency-revising-hero-line')).toBe('Since 27 November');
    expect(text('consistency-weeks-chart-empty')).toBe('Nothing here yet in this range');
    expect(screen.queryByTestId('consistency-hours')).toBeNull();
    kind('cycles');
    expect(text('consistency-cycles-none')).toBe('Nothing revised yet');
    kind('reading');
    expect(text('consistency-read-weeks-chart-empty')).toBe('Nothing here yet in this range');
  });

  it.each([1, 2, 3])('%i day(s) revised on a young account: one bar, in seven slots, no wider than 28 pt', (n) => {
    at(SE, 1);
    const days = Array.from({ length: n }, (_, i) => shiftDay(TODAY, -i));
    open(account({ revised: days, firstDay: days[days.length - 1] }));
    expect(text('consistency-revising-hero-value')).toBe(String(n));
    expect(screen.getAllByTestId(/^consistency-weeks-chart-bar-/)).toHaveLength(1);
    expect(screen.getAllByTestId('consistency-weeks-chart-slot-empty')).toHaveLength(MIN_SLOTS - 1);
    const fill = StyleSheet.flatten(screen.getByTestId(/^consistency-weeks-chart-fill-/).props.style);
    expect(fill.width).toBeLessThanOrEqual(MAX_BAR_WIDTH);
    // No trend on an account younger than the range and as long before it.
    expect(screen.queryByTestId('consistency-revising-hero-trend')).toBeNull();
  });
});

/**
 * The figure, its words and the trend pill (InsightPageParts' hero: a 34 pt number, 17 pt words, a 13 pt pill with its
 * arrow): one row below 1.2× text, so they must fit side by side or the words wrap; from 1.2× the row wraps, so each must
 * fit on its own.
 */
function heroFits(value: string, unit: string, trend: string | null, scale: number, room: number): boolean {
  const number = textWidth(value, 'figure@20', (34 / 20) * scale);
  const words = textWidth(unit, 'meta@13', (17 / 13) * scale);
  const pill = trend ? 4 + 16 + 12 + 3 + textWidth(trend, 'meta@13', scale) * 1.05 : 0;
  return scale < STACK_AT_SCALE ? number + 6 + words + (trend ? 6 + pill : 0) <= room : Math.max(number, words, pill) <= room;
}
/** A cycle's name (15 pt semibold, from 17 pt semibold's widths) and its detail (13 pt). */
const nameWidth = (s: string, scale: number) => textWidth(s, 'title@17', (15 / 17) * scale);
const metaWidth = (s: string, scale: number) => textWidth(s, 'meta@13', scale);

describe('[ACT-43] nothing wraps, clips or collapses: the longest values, an SE and a Pro Max, the largest text, light and dark', () => {
  // The longest: All time on a five-year account, every page memorized, a page a day (so a cycle is long, and late).
  const longest = () => {
    const days = everyDay('2021-11-01').filter((_, i) => i % 97 !== 5);
    return account({ revised: days, read: days, memorized: QURAN, perDay: 1, firstDay: '2021-11-01', range: 'all' });
  };
  const busy = () => {
    const days = [...new Set([...everyDay('2025-11-01', [6]), ...everyDay('2026-10-29')])];
    return account({ revised: days, read: days, firstDay: '2025-11-01', range: 90 });
  };
  const cases: [string, () => InsightsData][] = [
    ['the longest values', longest],
    ['a busy year', busy],
    ['a young account', () => account({ revised: [TODAY, shiftDay(TODAY, -1)], read: [TODAY], firstDay: shiftDay(TODAY, -1) })],
  ];
  for (const dark of [false, true]) {
    for (const width of [SE, PRO_MAX]) {
      for (const scale of [1, STACK_AT_SCALE, 3.1]) {
        for (const [name, make] of cases) {
          it(`${name}, ${width} pt, text ×${scale}, ${dark ? 'dark' : 'light'}`, () => {
            mockDark = dark;
            at(width, scale);
            const s = Math.min(scale, CHROME_MAX_SCALE);
            open(make());
            for (const k of ['revising', 'cycles', 'reading'] as const) {
              kind(k);
              const hero = k === 'revising' ? 'consistency-revising-hero' : k === 'cycles' ? 'consistency-cycles-hero' : 'consistency-reading-hero';
              const value = text(`${hero}-value`);
              if (value != null) {
                // The figure, its words and the pill: side by side, or each on its own line from 1.2×, never a wrapped word.
                const trend = text(`${hero}-trend`) || null;
                const said = `${k}: "${value}" "${text(`${hero}-unit`)}" "${trend ?? ''}"`;
                expect({ said, fits: heroFits(value, text(`${hero}-unit`)!, trend, s, pageWidth(width)) }).toEqual({ said, fits: true });
              }
              // A cycle's name and its detail: each one line within the card (side by side when both fit, else the detail under
              // the name: the row wraps, never the words).
              for (const row of screen.queryAllByTestId(/^consistency-cycle-[0-9-]+$/)) {
                const id = row.props.testID as string;
                const detail = text(`${id}-detail`)!;
                const cycleName = (row.props.accessibilityLabel as string).replace(`, ${detail}`, '');
                const said = `"${cycleName}" "${detail}"`;
                expect({ said, fits: Math.max(nameWidth(cycleName, s), metaWidth(detail, s)) <= cardWidth(width) }).toEqual({ said, fits: true });
                expect(StyleSheet.flatten(screen.getByTestId(`${id}-head`).props.style).flexWrap).toBe('wrap');
              }
              // Every chart: at least seven slots, bars no wider than 28 pt, each label within its room.
              for (const chart of ['consistency-weeks-chart', 'consistency-read-weeks-chart', 'consistency-hour-bars']) {
                const bars = screen.queryAllByTestId(new RegExp(`^${chart}-bar-`));
                if (bars.length === 0) continue;
                const l = chartLayout(bars.length, cardWidth(width));
                expect(l.slots).toBeGreaterThanOrEqual(MIN_SLOTS);
                expect(l.bar).toBeLessThanOrEqual(MAX_BAR_WIDTH);
                const room = bars.length <= LABELS_ALL_UP_TO ? l.slot / 0.6 : Math.min(cardWidth(width) / 2, LABEL_WIDTH * s);
                for (const label of screen.queryAllByTestId(new RegExp(`^${chart}-label-`))) {
                  const said = `${chart} "${text(label.props.testID)}" in ${room.toFixed(1)} pt`;
                  expect({ said, fits: metaWidth(text(label.props.testID) ?? '', s) <= room }).toEqual({ said, fits: true });
                }
              }
            }
            screen.unmount();
          });
        }
      }
    }
  }
});

it('[ACT-43] the trend chip’s words read at 4.5:1 on their fill, light and dark', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (const dark of [false, true]) {
    const p = paletteV2(dark, 'crimson');
    expect(ratio(p.good, p.goodSubtle)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.onRedSubtle, p.redSubtle)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.secondary, p.fill)).toBeGreaterThanOrEqual(4.5);
  }
});
