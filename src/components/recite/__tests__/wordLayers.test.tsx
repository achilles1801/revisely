import React from 'react';
import { StyleSheet } from 'react-native';
import { RECITE_COLORS, wordLayers, WordLayerInput } from '../wordLayers';
import { quranWords } from '../../../lib/recite/__fixtures__/quranWords';
import { pageLines } from '../../../lib/recite/pageLines';
import { fitPage } from '../../../lib/pageFit';
import type { WordStatus } from '../../../lib/recite/tracker';

const words = quranWords();
type Box = { left: number; top: number; width: number; height: number; backgroundColor?: string };

function layers(page: number, scale: number, over: Partial<WordLayerInput> = {}) {
  const out = wordLayers({
    words,
    page,
    scale,
    status: () => 'pending',
    position: null,
    hide: true,
    revealed: () => false,
    past: null,
    pageColor: '#fff',
    inkColor: '#000000',
    ...over,
  });
  const boxes = (nodes: React.ReactNode) =>
    (nodes as React.ReactElement<{ style: unknown }>[]).map((el) => {
      const s = StyleSheet.flatten(el.props.style as never) as Box;
      // Back to bounds space.
      return {
        key: el.key as string,
        box: { ...s, left: s.left / scale, top: s.top / scale, width: s.width / scale, height: s.height / scale },
      };
    });
  return { under: boxes(out.under), over: boxes(out.over) };
}

const covers = (l: ReturnType<typeof layers>) => l.over.filter((b) => b.key.startsWith('h')).map((b) => b.box);
const covered = (cs: Box[], x: number, y: number) =>
  cs.some((c) => x >= c.left - 0.01 && x <= c.left + c.width + 0.01 && y >= c.top - 0.01 && y <= c.top + c.height + 0.01);

/** Every sampled point of a word's box (its line's full height) is under a cover. */
function wordCovered(cs: Box[], w: number) {
  const r = words.rect(w);
  for (let fx = 0; fx <= 1; fx += 0.25) {
    for (let fy = 0; fy <= 1; fy += 0.25) {
      if (!covered(cs, r.x0 + fx * (r.x1 - r.x0), r.y0 + fy * (r.y1 - r.y0))) return false;
    }
  }
  return true;
}

const SIZES: [string, number, number][] = [
  ['iPhone SE', 375, 520],
  ['iPhone 17 Pro Max', 440, 860],
  ['iPad', 820, 1100],
];
const PAGES = [1, 2, 3, 50, 379, 604];

describe('hidden words: whole lines covered', () => {
  it.each(SIZES)('every word of pages 1-3, 50, 379, 604 is covered whole (%s)', (_label, width, height) => {
    const { scale } = fitPage(width, height);
    for (const page of PAGES) {
      const cs = covers(layers(page, scale));
      const [from, to] = words.pageRange(page);
      const open: number[] = [];
      for (let w = from; w < to; w++) if (!wordCovered(cs, w)) open.push(w);
      expect({ page, open }).toEqual({ page, open: [] });
    }
  });

  it('leaves the verse markers open, one for (nearly) every verse ending on the page', () => {
    for (const page of PAGES) {
      const cs = covers(layers(page, 0.4));
      let markers = 0;
      for (const l of pageLines(words, page)) {
        for (const [x0, x1] of l.markers) {
          markers++;
          expect(covered(cs, (x0 + x1) / 2, (l.y0 + l.y1) / 2)).toBe(false);
        }
      }
      const [from, to] = words.pageRange(page);
      let ends = 0;
      for (let w = from; w < to; w++) if (w + 1 >= words.count || !words.sameVerse(w, w + 1)) ends++;
      expect({ page, markers: markers >= ends - 1 }).toEqual({ page, markers: true });
    }
  });

  it('finds every verse marker in the mushaf, also one printed at the start of the next line', () => {
    let markers = 0;
    for (let page = 1; page <= 604; page++) for (const l of pageLines(words, page)) markers += l.markers.length;
    // 6236 verses; one marker may share a line edge too tightly to tell apart.
    expect(markers).toBeGreaterThanOrEqual(6235);
    // 2:30 ends at the left of line 3 on page 6; its marker opens line 4.
    expect(pageLines(words, 6).find((l) => l.line === 4)!.markers[0][1]).toBeGreaterThan(980);
  });

  it('page 379 (An-Naml 23-35): fifteen lines, thirteen markers', () => {
    const lines = pageLines(words, 379);
    expect(lines).toHaveLength(15);
    expect(lines.reduce((n, l) => n + l.markers.length, 0)).toBe(13);
  });

  it('a cover spans its own band and never reaches into the next line’s', () => {
    for (const page of PAGES) {
      const lines = pageLines(words, page);
      lines.forEach((l, i) => {
        expect(l.coverTop).toBeLessThanOrEqual(l.y0);
        expect(l.coverBottom).toBeGreaterThanOrEqual(l.y1);
        const next = lines[i + 1];
        if (next) expect(l.coverBottom).toBeLessThanOrEqual(Math.max(l.y1, next.y0));
      });
    }
  });

  it('nothing is covered when words are shown', () => {
    expect(covers(layers(3, 0.4, { hide: false }))).toEqual([]);
  });
});

describe('recited words open in place', () => {
  const [from, to] = words.pageRange(3);
  const recitedTo = from + 20;
  const status = (w: number): WordStatus => (w < recitedTo ? 'correct' : 'pending');

  it('opens what was recited and keeps the rest covered', () => {
    const cs = covers(layers(3, 0.5, { status }));
    for (let w = from; w < to; w++) {
      const r = words.rect(w);
      if (w < recitedTo) expect(covered(cs, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)).toBe(false);
      else expect(wordCovered(cs, w)).toBe(true);
    }
  });

  it('opens a hint and the utterance in progress too', () => {
    const cs = covers(layers(3, 0.5, { revealed: (w) => w === from + 30 }));
    const r = words.rect(from + 30);
    expect(covered(cs, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)).toBe(false);
    expect(wordCovered(cs, from + 31)).toBe(true);
    expect(wordCovered(cs, from + 29)).toBe(true);
  });
});

describe('feedback on the words', () => {
  const [from] = words.pageRange(3);
  const marks: Record<number, WordStatus> = { [from + 2]: 'wrong', [from + 4]: 'missed', [from + 6]: 'corrected' };
  const status = (w: number): WordStatus => marks[w] ?? (w < from + 10 ? 'correct' : 'pending');

  it('underlines mistakes in their colour, under the word', () => {
    const l = layers(3, 0.5, { status });
    const lines = l.over.filter((b) => b.key.startsWith('u'));
    const colorOf = (w: number) => lines.find((b) => b.key === `u${w}`)?.box.backgroundColor;
    expect(colorOf(from + 2)).toBe(RECITE_COLORS.wrong);
    expect(colorOf(from + 4)).toBe(RECITE_COLORS.missed);
    expect(colorOf(from + 6)).toBe(RECITE_COLORS.corrected);
    expect(lines).toHaveLength(3);
    const r = words.rect(from + 2);
    const u = lines.find((b) => b.key === `u${from + 2}`)!.box;
    expect(u.left).toBeCloseTo(r.x0);
    expect(u.width).toBeCloseTo(r.x1 - r.x0);
    expect(u.top).toBeGreaterThan(r.y1 - 3);
  });

  it('underlines a hint so the reciter knows they were helped', () => {
    const l = layers(3, 0.5, { revealed: (w) => w === from + 12, hinted: (w) => w === from + 12 });
    expect(l.over.find((b) => b.key === `u${from + 12}`)?.box.backgroundColor).toBe(RECITE_COLORS.current);
  });

  it('puts a light band across the line being recited, and only that line', () => {
    const position = from + 25;
    const l = layers(3, 0.5, { position, status });
    const bands = l.over.filter((b) => b.key.startsWith('c'));
    expect(bands).toHaveLength(1);
    const line = pageLines(words, 3).find((x) => x.line === words.lineOf(position))!;
    expect(bands[0].box.top).toBeCloseTo(line.coverTop);
    expect(bands[0].box.left).toBeCloseTo(line.x0);
    // Drawn after the covers, so it shows across the whole line.
    expect(l.over.findIndex((b) => b.key.startsWith('c'))).toBeGreaterThan(l.over.findIndex((b) => b.key.startsWith('h')));
    expect(layers(4, 0.5, { position }).over.filter((b) => b.key.startsWith('c'))).toHaveLength(0);
    // With the words shown too, so the reciter can see where they are.
    expect(layers(3, 0.5, { position, status, hide: false }).over.filter((b) => b.key.startsWith('c'))).toHaveLength(1);
  });
});
