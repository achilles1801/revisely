// [RECITE-20] A hidden page shows no ink but its verse markers and its words shown, on every page (Majd, Nov 26 2026:
// "theres still instances where the white still shows up when the page is hidden like that symbol ... part of it and other
// letters and symbols show -- we should do a full run through of every page and ensure that never happens again").
//
// scripts/check-hidden-page.py lays the covers over the page images (all three sets) for every page and every reading
// state, and fails on any ink of a hidden word that shows, or of a shown word that is covered. That holds because each
// word's ink lies in its box (across its line's cover rows) or in its patches and notches (lib/recite/hiddenInk), which the
// script measures. This test holds the other half, the plan, on all 604 pages and every reading state: a hidden word's box
// and patches covered, a shown word's box and notches open, the markers whole. And it pins ink measured on the images.
import fs from 'fs';
import path from 'path';
import type { Rect } from '../../ayahBounds';
import { pageLines } from '../pageLines';
import { hiddenInk, rectMinus } from '../hiddenInk';
import { markerCorners } from '../markerOutline';
import { quranWords } from '../__fixtures__/quranWords';
const { followBox, hiddenInkPlan } = require('../../../components/reciteLive/HiddenInkLayer');

type Cover = Rect;
// The words' boxes are 32-bit floats (QuranWords), the lines' 64-bit: a thousandth of a unit is the same edge.
const EPS = 1e-3;
const overlaps = (a: Rect, b: Rect) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > EPS && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > EPS;
/** What of `r` no cover takes (rects, empty when all of it is covered). */
const area = (c: Rect) => (c.x1 - c.x0) * (c.y1 - c.y0);
const uncovered = (r: Rect, covers: Cover[]): Rect[] => {
  let left = [r];
  for (const c of covers) {
    if (!overlaps(c, r)) continue;
    left = left.flatMap((p) => rectMinus(p, c)).filter((p) => p.x1 - p.x0 > EPS && p.y1 - p.y0 > EPS);
    if (left.length === 0) break;
  }
  return left;
};
const covered = (covers: Cover[], x: number, y: number) => covers.some((c) => c.x0 <= x && x <= c.x1 && c.y0 <= y && y <= c.y1);

/**
 * A page's reading states, each word in every arrangement with the words beside it: nothing shown, everything shown, every
 * other word shown (each way round: each word hidden between two shown, and shown between two hidden), and from the page's
 * start to each line's start, and from each line's start to the page's end (whole lines shown above or below lines hidden).
 */
function* states(from: number, to: number, lineStarts: number[]): Generator<[string, (w: number) => boolean]> {
  yield ['nothing shown', () => false];
  yield ['all shown', () => true];
  yield ['every other word', (w) => (w - from) % 2 === 0];
  yield ['every other word, the others', (w) => (w - from) % 2 === 1];
  for (const k of lineStarts) {
    yield [`up to ${k}`, (w) => w < k];
    yield [`from ${k}`, (w) => w >= k];
  }
}

/** Each line's first word on the page. */
const lineStartsOf = (words: { lineOf: (w: number) => number }, from: number, to: number) => {
  const out: number[] = [];
  for (let w = from; w < to; w++) if (w === from || words.lineOf(w) !== words.lineOf(w - 1)) out.push(w);
  return out;
};

/** Every state from a page's start to each word, and from each word to its end, each word alone and all but each. */
function* everyState(from: number, to: number): Generator<[string, (w: number) => boolean]> {
  yield ['nothing shown', () => false];
  for (let k = from; k <= to; k++) yield [`up to ${k}`, (w) => w < k];
  for (let k = from; k < to; k++) {
    yield [`from ${k}`, (w) => w >= k];
    yield [`only ${k}`, (w) => w === k];
    yield [`all but ${k}`, (w) => w !== k];
  }
}

describe('[RECITE-20] a hidden page, every page and every reading state', () => {
  const words = quranWords();

  it('a hidden word: its box and its patches covered; a shown word: its box and its notches open; the markers whole', () => {
    const bad: string[] = [];
    for (let page = 1; page <= 604; page++) {
      const [from, to] = words.pageRange(page);
      const lines = pageLines(page);
      const lineByNumber = new Map(lines.map((l) => [l.line, l]));
      const ink = hiddenInk(page, from);
      for (const [state, shown] of states(from, to, lineStartsOf(words, from, to))) {
        const plan = hiddenInkPlan(words, page, shown);
        const all: Cover[] = plan.lines.flatMap((l: { covers: Cover[] }) => l.covers);
        // Each line's covers and its neighbours' (a cover reaches no further than the next line's).
        const near = new Map<number, Cover[]>();
        plan.lines.forEach((l: { line: number; covers: Cover[] }, i: number) => {
          // Biggest first: a box is mostly under one cover, so it is done after one or two.
          near.set(l.line, [...(plan.lines[i - 1]?.covers ?? []), ...l.covers, ...(plan.lines[i + 1]?.covers ?? [])].sort((a, b) => area(b) - area(a)));
        });
        const ownCovers = new Map<number, Cover[]>(plan.lines.map((l: { line: number; covers: Cover[] }) => [l.line, l.covers]));
        const patches = new Set<Cover>(plan.patches);
        const notchesShown = ink.filter((r) => r.kind === 'notch' && shown(r.w)).map((r) => r.rect);
        const shownBoxes = new Map<number, Rect[]>();
        for (let w = from; w < to; w++) {
          if (!shown(w)) continue;
          const r = words.rect(w);
          const l = lineByNumber.get(words.lineOf(w));
          if (!l) continue;
          shownBoxes.set(l.line, [...(shownBoxes.get(l.line) ?? []), { x0: r.x0, x1: r.x1, y0: l.coverTop, y1: l.coverBottom }]);
        }
        for (let w = from; w < to; w++) {
          const r = words.rect(w);
          const l = lineByNumber.get(words.lineOf(w));
          if (!l) continue;
          const box = { x0: r.x0, x1: r.x1, y0: l.coverTop, y1: l.coverBottom };
          if (!shown(w)) {
            // Covered, but where a shown word's box or notch (its own ink, no other's) is: two words' boxes can share a
            // tenth of a unit (each rounded outwards to a tenth, scripts/check-word-boxes.py).
            let left = uncovered(box, near.get(l.line) ?? all);
            if (left.length) left = left.flatMap((p) => uncovered(p, [...(shownBoxes.get(l.line) ?? []), ...notchesShown]));
            if (left.length) bad.push(`${page} ${state}: hidden word ${w}'s box shows at ${JSON.stringify(left[0])}`);
          } else {
            // No cover of its own line reaches into it, but a hidden word's patch (that word's ink, no other's).
            const into = (ownCovers.get(l.line) ?? []).filter((c) => !patches.has(c) && overlaps(c, box));
            if (into.length) bad.push(`${page} ${state}: a cover reaches into shown word ${w} at ${JSON.stringify(into[0])}`);
          }
        }
        for (const r of ink) {
          const covers = near.get(words.lineOf(r.w)) ?? all;
          if (r.kind === 'patch' && !shown(r.w) && uncovered(r.rect, covers).length) bad.push(`${page} ${state}: word ${r.w}'s patch shows`);
          if (r.kind === 'notch' && shown(r.w)) {
            const into = covers.filter((c) => !patches.has(c) && overlaps(c, r.rect));
            if (into.length) bad.push(`${page} ${state}: word ${r.w}'s notch is covered`);
          }
        }
        for (const l of lines) {
          const own = ownCovers.get(l.line) ?? [];
          l.markers.forEach(([a, b], k) => {
            const [top, bottom] = l.markerRows[k];
            const corners = markerCorners({ x0: a - 1, x1: b + 1, y0: top, y1: bottom }).map((x) => x.rect);
            for (const c of near.get(l.line) ?? own) {
              if (patches.has(c) || !overlaps(c, { x0: a, x1: b, y0: top, y1: bottom })) continue;
              const inCorner = corners.some((q) => c.x0 >= q.x0 - EPS && c.x1 <= q.x1 + EPS && c.y0 >= q.y0 - EPS && c.y1 <= q.y1 + EPS);
              if (!inCorner) bad.push(`${page} ${state}: a cover in marker ${l.line}:${k} at ${JSON.stringify(c)}`);
            }
          });
        }
        if (bad.length > 20) break;
      }
      if (bad.length > 20) break;
    }
    expect(bad.slice(0, 20)).toEqual([]);
    // All 604 pages: about 10 s here, more on a loaded runner.
  }, 180_000);

  it('the patches and notches are the words of their page, inside their lines', () => {
    for (let page = 1; page <= 604; page++) {
      const [from, to] = words.pageRange(page);
      for (const r of hiddenInk(page, from)) {
        expect({ page, w: r.w, ok: r.w >= from && r.w < to && r.rect.x1 > r.rect.x0 && r.rect.y1 > r.rect.y0 }).toEqual({ page, w: r.w, ok: true });
      }
    }
  });

  // Ink measured on the page images (the originals, 1024-wide bounds space) by scripts/check-hidden-page.py: a point of a
  // word's ink, and the word. Hidden, it is covered in every state; shown, it is open.
  const PINS: { why: string; page: number; ref: [number, number, number]; at: [number, number] }[] = [
    // Majd's screenshot (Nov 26 2026, dark): the hamzat wasl's sign over ٱلْأَعْلَىٰ (20:68) reaches to 0.24 of its box's
    // right edge, where أَنتَ's box begins. With a unit open past a shown word's box, its end showed beside أَنتَ.
    { why: 'the wasla over ٱلأعلى, beside أنت', page: 316, ref: [20, 68, 6], at: [911.163, 354.265] },
    { why: 'the wasla over ٱلأعلى, its tip', page: 316, ref: [20, 68, 6], at: [911.557, 354.658] },
    // Its edge reaches half a unit past its box, into أَنتَ's: a patch while ٱلْأَعْلَىٰ is hidden, a notch once it is shown.
    { why: 'the wasla’s edge, inside أنت’s box', page: 316, ref: [20, 68, 6], at: [912.345, 356.234] },
    // On Android's smaller images the scaling spreads that edge a pixel further, faint (alpha 58 of 255 on w1440, 94 on
    // w1080): over about 8% opacity it counts too (Nov 27 2026).
    { why: 'the wasla’s faint fringe on w1440', page: 316, ref: [20, 68, 6], at: [912.711, 355.911] },
    { why: 'the wasla’s faint fringe on w1080', page: 316, ref: [20, 68, 6], at: [912.593, 356.03] },
    // The hamza under إِلَىٰ's alif (40:43) reaches 5.8 units past its box, under مَرَدَّنَآ: no straight edge parts them,
    // so it is a patch while إِلَىٰ is hidden and a notch while it is shown (src/data/hiddenInk.dat).
    { why: 'the hamza under إلى, inside مردنا’s box', page: 472, ref: [40, 43, 16], at: [806.4, 517.317] },
    { why: 'the hamza under إلى, at its box’s edge', page: 472, ref: [40, 43, 16], at: [801.28, 516.529] },
  ];

  it('ink measured on the images: covered while its word is hidden, whatever is shown beside it; open once it is shown', () => {
    for (const p of PINS) {
      const w = words.verseFirstWord(p.ref[0], p.ref[1]) + p.ref[2] - 1;
      const [from, to] = words.pageRange(p.page);
      expect(words.pageOf(w)).toBe(p.page);
      for (const [state, shown] of everyState(from, to)) {
        const all = hiddenInkPlan(words, p.page, shown).lines.flatMap((l: { covers: Cover[] }) => l.covers);
        const want = !shown(w);
        if (covered(all, p.at[0], p.at[1]) !== want) {
          throw new Error(`${p.why} (page ${p.page}, ${state}): ${want ? 'shows while hidden' : 'covered while shown'}`);
        }
      }
    }
  });

  // Surah headers and the basmala stay visible on a hidden page: only the ayahs' words are hidden (Majd, Nov 27 2026: "Keep
  // them visible"). Where their ink is on the page images: __fixtures__/headerInk.json (scripts/check-hidden-page.py
  // --write-headers; per page, each run of it, the three sets' pixels together, flat x0, y0, x1, y1). Page 221's basmala
  // reached a unit into line 9's cover rows until Nov 27 2026; page 2's ends 0.04 above line 3's.
  it('no cover reaches a surah header or the basmala, in any reading state, on any page', () => {
    const heads: Record<string, number[]> = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '__fixtures__', 'headerInk.json'), 'utf8'));
    // Every surah's header is measured, on the page of its first ayah.
    for (let s = 1; s <= 114; s++) {
      const page = words.pageOf(words.verseFirstWord(s, 1));
      expect({ s, page, measured: String(page) in heads }).toEqual({ s, page, measured: true });
    }
    const bad: string[] = [];
    for (const [p, flat] of Object.entries(heads)) {
      const page = Number(p);
      const [from, to] = words.pageRange(page);
      const rects: Rect[] = [];
      for (let i = 0; i + 4 <= flat.length; i += 4) rects.push({ x0: flat[i], y0: flat[i + 1], x1: flat[i + 2], y1: flat[i + 3] });
      for (const [state, shown] of states(from, to, lineStartsOf(words, from, to))) {
        const plan = hiddenInkPlan(words, page, shown);
        const all: Cover[] = [...plan.lines.flatMap((l: { covers: Cover[] }) => l.covers), ...plan.patches];
        for (const r of rects) {
          const into = all.find((c) => overlaps(c, r));
          if (into) bad.push(`${page} ${state}: a cover at ${JSON.stringify(into)} reaches the header or basmala at ${JSON.stringify(r)}`);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('the newest word’s following ink stays in its box and its line’s own rows', () => {
    for (const page of [2, 50, 316, 379, 592]) {
      const [from, to] = words.pageRange(page);
      const plan = hiddenInkPlan(words, page, (w: number) => w < from + 5);
      for (let w = from; w < to; w += 7) {
        const box = followBox(words, plan, w);
        const r = words.rect(w);
        expect([box.x0, box.x1]).toEqual([r.x0, r.x1]);
        const l = plan.lines.find((x: { line: number }) => x.line === words.lineOf(w));
        for (const o of plan.lines) {
          if (o === l) continue;
          expect(Math.min(box.y1, o.bottom) - Math.max(box.y0, o.top)).toBeLessThanOrEqual(EPS);
        }
      }
    }
  });

  // HIDDEN_PLAN_OUT=<file>: the app's covers for a few states a page, for scripts/check-hidden-page.py --js-plans (it
  // checks that its copy of the plan matches this one before sweeping the images).
  (process.env.HIDDEN_PLAN_OUT ? it : it.skip)('export', () => {
    const out: Record<string, Record<string, number[][]>> = {};
    for (let page = 1; page <= 604; page++) {
      const [from, to] = words.pageRange(page);
      const half = from + Math.floor((to - from) / 2);
      const st: Record<string, (w: number) => boolean> = { hidden: () => false, fwd: (w) => w < half, bwd: (w) => w >= half, alt: (w) => w % 3 === 0 };
      out[page] = {};
      for (const [k, f] of Object.entries(st)) {
        out[page][k] = hiddenInkPlan(words, page, f).lines.flatMap((l: { covers: Cover[] }) => l.covers.map((c) => [c.x0, c.y0, c.x1, c.y1]));
      }
    }
    fs.writeFileSync(path.resolve(process.env.HIDDEN_PLAN_OUT as string), JSON.stringify(out));
  });
});
