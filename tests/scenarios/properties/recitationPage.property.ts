// Recitation's own page (BEHAVIOUR.md ACT-44; Majd, Nov 27 2026: "the point of the graph is to illustrate a users trend in
// making mistakes categorized by the type of mistake ... what mistakes has the user corrected and doesn't make anymore and
// which are still slipping all the time and maybe even length of recitations"). Over generated takes on real ayahs (every
// kind of mark, Not clear, corrected words, unfinished and forgotten takes, Clear now):
//   - the rate is fair: a take's pages are the shares of the pages it reached, a line at least, and its mistakes are the
//     summary's; the bars split the span's takes between them, every slot there, the last ending today;
//   - fixed and still slipping never hold the same word, and a word cleared by hand is never "fixed";
//   - whatever it shows fits: the figures, the trend chip, the kinds and the pills stay on one line at an SE's width and a
//     Pro Max's, from the usual text size to the largest Insights allows (jest/textWidth, the system font's own widths).
import fc from 'fast-check';
import { textWidth } from '../../../jest/textWidth';
import { quranWords } from '../../../src/lib/recite/__fixtures__/quranWords';
import type { Mark, MarkKind } from '../../../src/lib/reciteLive/contract';
import { isMistake } from '../../../src/lib/reciteLive/contract';
import { wordMemories } from '../../../src/lib/reciteMemory/memory';
import type { ClearRecord, MemoryRecord, TakeRecord } from '../../../src/lib/reciteMemory/record';
import { liveTakes, markedWords } from '../../../src/lib/reciteInsights/insights';
import {
  CHART_SPANS,
  fixedAndSlipping,
  KINDS,
  kindBars,
  MIN_TAKE_PAGES,
  rangeTrend,
  rateOf,
  takeLengths,
  takePages,
  weekStart,
} from '../../../src/lib/reciteInsights/trend';
import { kindName, perPageText, spanLabel, trendChip } from '../../../src/lib/reciteInsights/trendWords';
import { CHROME_MAX_SCALE, STACK_AT_SCALE } from '../../../src/components/activity/ChromeText';
import { PAGE_TYPE, tilesStack } from '../../../src/components/activity/RecitationInsights';
import { formatNumber, t } from '../../../src/i18n';
import { runs } from './fixtures';

const TODAY = '2026-11-16';
const day = (offset: number) => new Date(Date.UTC(2026, 10, 16 + offset)).toISOString().slice(0, 10);
const words = quranWords();
// Al-Kahf 17–26 (two pages), Al-Baqarah 40–48 (one), and Al-Mulk whole (two and a bit).
const PASSAGES: [number, number][] = [
  [words.verseRange(18, 17)[0], words.verseRange(18, 26)[1] - 1],
  [words.verseRange(2, 40)[0], words.verseRange(2, 48)[1] - 1],
  [words.verseRange(67, 1)[0], words.verseRange(67, 30)[1] - 1],
];

const markArb = (from: number, to: number) =>
  fc
    .record({
      at: fc.double({ min: 0, max: 0.999, noNaN: true }),
      kind: fc.constantFrom<MarkKind>('word', 'skipped', 'added', 'harakat', 'letter', 'tajweed'),
      likely: fc.boolean(),
      corrected: fc.constantFrom(false, false, false, true),
    })
    .map((m): Mark => {
      const w = from + Math.floor(m.at * (to - from + 1));
      const ref = words.ref(w);
      const mark: Mark = { id: `${w}:${m.kind}:`, w, ayah: [ref.sura, ref.ayah], kind: m.kind, sure: m.likely ? 'likely' : 'clear' };
      if (m.kind === 'tajweed') mark.rule = 'ghunnah';
      if (m.corrected && m.kind === 'word') mark.corrected = true;
      return mark;
    });

const takeArb = fc
  .record({
    passage: fc.constantFrom(0, 1, 2),
    offset: fc.integer({ min: -400, max: 0 }),
    start: fc.double({ min: 0, max: 0.6, noNaN: true }),
    end: fc.double({ min: 0, max: 1, noNaN: true }),
    unfinished: fc.constantFrom(false, false, false, true),
    deleted: fc.constantFrom(false, false, false, false, true),
    secs: fc.integer({ min: 5, max: 1800 }),
  })
  .chain((g) => {
    const [a, b] = PASSAGES[g.passage];
    const from = a + Math.floor(g.start * (b - a));
    const to = Math.max(from, a + Math.floor(g.end * (b - a)));
    return fc.array(markArb(from, to), { maxLength: 10 }).map((marks) => ({ ...g, from, to, marks }));
  });

let n = 0;
type GenTake = typeof takeArb extends fc.Arbitrary<infer T> ? T : never;
function records(takes: GenTake[], clears: { offset: number; pick: number }[]): MemoryRecord[] {
  const out: MemoryRecord[] = takes.map((g) => {
    n += 1;
    const createdAt = Date.UTC(2026, 10, 16 + g.offset, 18) + n * 1000;
    const marks = [...new Map(g.marks.map((m) => [m.id, m])).values()];
    const rec: TakeRecord = {
      id: `t${n}`,
      kind: 'take',
      take: null,
      createdAt,
      rev: createdAt,
      day: day(g.offset),
      level: 'words',
      hidden: false,
      from: g.from,
      to: g.to,
      secs: g.secs,
      mistakes: 0,
      tajweed: 0,
      unclear: 0,
      accuracy: 0.97,
      marks,
      passed: [],
      recordingId: null,
      ...(g.unfinished ? { unfinished: true } : {}),
      ...(g.deleted ? { deleted: true } : {}),
    };
    return rec;
  });
  const marked = out.flatMap((r) => (r.kind === 'take' ? r.marks : []));
  for (const c of clears) {
    const m = marked[c.pick % Math.max(1, marked.length)];
    if (!m) continue;
    n += 1;
    const createdAt = Date.UTC(2026, 10, 16 + c.offset, 22) + n * 1000;
    const group = m.kind === 'tajweed' ? 'tajweed' : m.kind === 'harakat' || m.kind === 'letter' ? 'slip' : 'word';
    const clear: ClearRecord = { id: `c${n}`, kind: 'clear', createdAt, rev: createdAt, day: day(c.offset), w: m.w, group };
    out.push(clear);
  }
  return out;
}

const accountArb = fc.record({
  takes: fc.array(takeArb, { maxLength: 24 }),
  clears: fc.array(fc.record({ offset: fc.integer({ min: -400, max: 0 }), pick: fc.nat() }), { maxLength: 3 }),
  window: fc.constantFrom(7, 30, 90, 400),
});

describe('[ACT-44] Recitation’s page over generated takes', () => {
  it('[ACT-44] a take’s pages are the shares of the pages it reached, a line at least; its mistakes are the summary’s', () => {
    fc.assert(
      fc.property(accountArb, ({ takes, clears, window }) => {
        const recs = records(takes, clears);
        const live = liveTakes(recs);
        for (const tk of live) {
          const p = takePages(tk, words);
          const reached = words.pageOf(tk.to) - words.pageOf(tk.from) + 1;
          expect(p).toBeGreaterThanOrEqual(MIN_TAKE_PAGES - 1e-9);
          expect(p).toBeLessThanOrEqual(reached + 1e-9);
        }
        const trend = rangeTrend(recs, TODAY, window, window === 400, words);
        const inRange = live.filter((tk) => tk.day >= day(-(window - 1)));
        expect(trend.takes).toBe(inRange.length);
        // Finished takes only; never Not clear, a corrected word or a tajweed note.
        const counted = inRange.filter((tk) => !tk.unfinished);
        expect(trend.now.takes).toBe(counted.length);
        expect(trend.now.mistakes).toBe(counted.reduce((x, tk) => x + tk.marks.filter(isMistake).length, 0));
        expect(KINDS.reduce((x, k) => x + trend.now.kinds[k], 0)).toBe(trend.now.mistakes);
        if (window === 400) expect(trend.before).toBeNull();
      }),
      { numRuns: runs(150) },
    );
  });

  it('[ACT-44] the bars: every slot of the span, the last ending today, splitting the span’s takes between them', () => {
    fc.assert(
      fc.property(accountArb, ({ takes, clears }) => {
        const recs = records(takes, clears);
        const live = liveTakes(recs).filter((tk) => !tk.unfinished);
        for (const span of CHART_SPANS) {
          const bars = kindBars(recs, TODAY, span, words);
          expect(bars).toHaveLength(span === '4w' ? 4 : span === '3m' ? 13 : 12);
          expect(bars[bars.length - 1].to).toBe(TODAY);
          if (span !== '1y') for (const b of bars) expect(weekStart(b.from)).toBe(b.from);
          for (let i = 1; i < bars.length; i++) expect(bars[i].from > bars[i - 1].to).toBe(true);
          const inSpan = live.filter((tk) => tk.day >= bars[0].from && tk.day <= TODAY);
          expect(bars.reduce((x, b) => x + b.takes, 0)).toBe(inSpan.length);
          expect(bars.reduce((x, b) => x + b.mistakes, 0)).toBe(rateOf(inSpan, words).mistakes);
        }
      }),
      { numRuns: runs(100) },
    );
  });

  it('[ACT-44] fixed and still slipping never hold the same word; a word cleared by hand is never fixed', () => {
    fc.assert(
      fc.property(accountArb, ({ takes, clears, window }) => {
        const recs = records(takes, clears);
        const from = day(-(window - 1));
        const f = fixedAndSlipping(recs, from, TODAY);
        const { words: marked } = markedWords(wordMemories(recs));
        expect(f.slipping).toBe(marked.length);
        expect(f.newInRange).toBeLessThanOrEqual(f.slipping);
        expect(f.fixedInRange).toBeLessThanOrEqual(f.fixed);
        // A fixed word: no open memory (but tajweed), and none of it cleared by Clear now.
        const mems = [...wordMemories(recs).values()].filter((m) => m.group !== 'tajweed');
        const openWords = new Set(mems.filter((m) => m.open).map((m) => m.w));
        const cleared = new Set(mems.filter((m) => !m.open && m.attempts.some((a) => !a.right)).map((m) => m.w));
        expect(f.fixed).toBeLessThanOrEqual([...cleared].filter((w) => !openWords.has(w)).length);
        const l = takeLengths(recs, TODAY, window, words);
        if (l) expect((l.long?.takes ?? 0) + (l.short?.takes ?? 0)).toBe(liveTakes(recs).filter((tk) => tk.day >= from && !tk.unfinished).length);
      }),
      { numRuns: runs(150) },
    );
  });
});

/** The room on a phone `width` wide (layoutV2's gutter each side), in the chart's card (its padding), in a tile. */
const WIDTHS = [320, 375, 440];
const inner = (w: number) => w - 2 * 16;
// Semibold and bold run a little wider than the measured regular and bold styles: 6% for safety.
const WIDE = 1.06;

describe('[ACT-44] whatever the page shows stays whole, on an SE and a Pro Max, at any text size', () => {
  const scaleArb = fc.double({ min: 1, max: 3, noNaN: true }).map((s) => Math.min(s, CHROME_MAX_SCALE));

  it('[ACT-44] the figure and its unit side by side under 1.2× text, the pill beside or under them; none ever cut', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 99.9, noNaN: true }), fc.double({ min: 0, max: 99.9, noNaN: true }), scaleArb, (now, then, scale) => {
        const figure = textWidth(perPageText(now), 'figure@20', (PAGE_TYPE.figure / 20) * scale) * WIDE;
        const unit = textWidth(t('reciteInsights.page.unit'), 'title@17', (PAGE_TYPE.unit / 17) * scale);
        const chip = trendChip(
          { takes: 1, pages: 1, mistakes: now, kinds: { words: now, hesitations: 0, slips: 0 } },
          { takes: 1, pages: 1, mistakes: then, kinds: { words: then, hesitations: 0, slips: 0 } },
          'the month before',
        );
        // Insights' pages' pill (InsightPageParts): a 12 pt arrow, 3 between, 8 inside each side, 4 before it.
        const chipW = chip ? textWidth(chip.text, 'meta@13', scale) * WIDE + 12 + 3 + 16 + 4 : 0;
        for (const w of WIDTHS) {
          // The hero's row wraps when full (InsightHero): the pill goes under, then the words; each fits a line.
          expect(figure).toBeLessThanOrEqual(inner(w));
          expect(unit).toBeLessThanOrEqual(inner(w));
          expect(chipW).toBeLessThanOrEqual(inner(w));
          if (scale < STACK_AT_SCALE) expect(figure + 6 + unit).toBeLessThanOrEqual(inner(w));
        }
      }),
      { numRuns: runs(300) },
    );
  });

  it('[ACT-44] the tiles’ figures: side by side at the usual size, stacked from the size where Insights stacks', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999 }), scaleArb, (count, scale) => {
        const figure = textWidth(formatNumber(count), 'figure@20', (PAGE_TYPE.tileFigure / 20) * scale) * WIDE;
        for (const w of WIDTHS) {
          // Two tiles with 10 between, each with 14 inside either side; one tile the whole width once stacked.
          const room = tilesStack(formatNumber(count).length, w, scale) ? inner(w) - 28 : (inner(w) - 10) / 2 - 28;
          expect(figure).toBeLessThanOrEqual(room);
        }
      }),
      { numRuns: runs(300) },
    );
  });

  it('[ACT-44] each kind fits its chip in the card; the three pills fit one row at the usual size, each its own at any', () => {
    for (const scale of [1, 1.2, CHROME_MAX_SCALE]) {
      for (const w of WIDTHS) {
        const card = inner(w) - 28;
        for (const k of KINDS) {
          // The chip: its padding, the dot and the gap, its border.
          expect(textWidth(kindName(k), 'meta@13', scale) * WIDE + 20 + 8 + 6 + 2).toBeLessThanOrEqual(card);
        }
        // The pills (PillButton sm: 14 pt, 12 either side) with 6 between; the row wraps when they don't fit (ChartPills).
        const pill = (s: (typeof CHART_SPANS)[number]) => textWidth(spanLabel(s), 'meta@13', scale) * WIDE * (14 / 13) + 24;
        for (const s of CHART_SPANS) expect(pill(s)).toBeLessThanOrEqual(inner(w));
        if (scale === 1) expect(CHART_SPANS.reduce((x, s) => x + pill(s), 0) + 12).toBeLessThanOrEqual(inner(w));
      }
    }
  });
});
