import React, { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { Rect } from '../../lib/ayahBounds';
import { pageImageProps } from '../../lib/quranImages';
import type { QuranWords } from '../../lib/recite/quranWords';
import { pageLines, subtractSpans, type Span } from '../../lib/recite/pageLines';
import { verseKey, type WordFollow } from '../../lib/recite/hiddenPage';
import { Wash } from './Wash';

/** Where the faint rule runs in a line's band (from the top): about the baseline. */
const RULE_AT = 0.74;
/** Room past a word's box, or a marker's, that its ink is drawn through (anti-aliasing). */
const INK_EDGE = 1;
/** Room past a line's text that its cover takes. */
const COVER_EDGE = 4;
/** A rule shorter than this (bounds units) is the gap at a line's end beside its last word shown, not a hidden word. */
const MIN_RULE = 12;
/** How far a cover over or under a marker reaches into the line's cover beside it, so no seam shows between them. */
const SEAM = 0.5;

export interface InkWash {
  box: Rect;
  colour: string;
  opacity?: number;
  testID: string;
}

export interface HiddenInkPlan {
  /**
   * Each line: its covers (over the words still hidden, leaving the markers and the words shown open), its faint rule's
   * parts (where words are still hidden), and the band a word's ink takes.
   */
  lines: { line: number; covers: Rect[]; rules: Span[]; ruleY: number; top: number; bottom: number }[];
  /** What the covers leave open: the verse markers, whole, in their own rows, and each run of words shown, in bounds space. */
  open: { line: number; box: Rect; kind: 'marker' | 'shown' }[];
}

/**
 * A hidden page (Majd, Nov 22 2026, of Tarteel's: "let's do it and test it"): covers in the page's colour over the words
 * still hidden, with a faint rule on each, leaving the verse markers whole (in their own rows) and every run of words shown
 * (recited, peeked or in a verse shown) open, so they show in the page's own ink from the page's image underneath: ready
 * at once, nothing drawn again (Majd, Nov 22: "it should just appear ready from the start like it was before"). Pure, in
 * bounds space.
 */
export function hiddenInkPlan(words: QuranWords, page: number, shown: (w: number) => boolean): HiddenInkPlan {
  const [from, to] = words.pageRange(page);
  const runs = new Map<number, Span[]>();
  // Each line's words, for the words beside each marker.
  const onLine = new Map<number, { x0: number; x1: number; shown: boolean }[]>();
  let run: { line: number; x0: number; x1: number } | null = null;
  const close = () => {
    if (!run) return;
    const list = runs.get(run.line) ?? [];
    list.push([run.x0, run.x1]);
    runs.set(run.line, list);
    run = null;
  };
  for (let w = from; w < to; w++) {
    const line = words.lineOf(w);
    const r = words.rect(w);
    const isShown = shown(w);
    const list = onLine.get(line) ?? [];
    list.push({ x0: r.x0, x1: r.x1, shown: isShown });
    onLine.set(line, list);
    if (!isShown) {
      close();
      continue;
    }
    if (run && run.line === line) {
      run.x0 = Math.min(run.x0, r.x0);
      run.x1 = Math.max(run.x1, r.x1);
    } else {
      close();
      run = { line, x0: r.x0, x1: r.x1 };
    }
  }
  close();
  const lines: HiddenInkPlan['lines'] = [];
  const open: HiddenInkPlan['open'] = [];
  for (const l of pageLines(page)) {
    const shownSpans = runs.get(l.line) ?? [];
    const band = (a: number, b: number): Rect => ({ x0: a - INK_EDGE, x1: b + INK_EDGE, y0: l.coverTop, y1: l.coverBottom });
    l.markers.forEach(([a, b], k) => open.push({ line: l.line, box: { ...band(a, b), y0: l.markerRows[k][0], y1: l.markerRows[k][1] }, kind: 'marker' }));
    for (const [a, b] of shownSpans) open.push({ line: l.line, box: band(a, b), kind: 'shown' });
    const shownHoles: Span[] = shownSpans.map(([a, b]) => [a - INK_EDGE, b + INK_EDGE]);
    const holes: Span[] = [...l.markers.map(([a, b]): Span => [a - INK_EDGE, b + INK_EDGE]), ...shownHoles];
    const covers = subtractSpans(l.x0 - COVER_EDGE, l.x1 + COVER_EDGE, holes)
      .filter(([a, b]) => b - a > 0.5)
      .map(([a, b]): Rect => ({ x0: a, x1: b, y0: l.coverTop, y1: l.coverBottom }));
    // Over and under each marker, in its columns: covered, so a sajdah's overline or a hidden word's dot there doesn't show
    // (Nov 22 2026, page 379's ۲٤). Each half goes with its side's word, since a word's stroke over a marker (a kaf's
    // top) reaches no further than the middle (scripts/check-page-markers.py checks it): the right half is covered while
    // the word before the marker (the page reads right to left) is hidden, the left half while the word after is.
    const lineWords = onLine.get(l.line) ?? [];
    l.markers.forEach(([a, b], k) => {
      const [top, bottom] = l.markerRows[k];
      if (top <= l.coverTop && bottom >= l.coverBottom) return;
      const mid = (a + b) / 2;
      let before: { x0: number; shown: boolean } | null = null;
      let after: { x1: number; shown: boolean } | null = null;
      for (const w of lineWords) {
        if (w.x0 >= mid && (!before || w.x0 < before.x0)) before = w;
        if (w.x1 <= mid && (!after || w.x1 > after.x1)) after = w;
      }
      const leftOpen = after?.shown ?? false;
      const rightOpen = before?.shown ?? false;
      if (leftOpen && rightOpen) return;
      const x0 = leftOpen ? mid : a - INK_EDGE - SEAM;
      const x1 = rightOpen ? mid : b + INK_EDGE + SEAM;
      for (const [p, q] of subtractSpans(x0, x1, shownHoles)) {
        if (q - p <= 0.5) continue;
        if (top > l.coverTop) covers.push({ x0: p, x1: q, y0: l.coverTop, y1: top });
        if (bottom < l.coverBottom) covers.push({ x0: p, x1: q, y0: bottom, y1: l.coverBottom });
      }
    });
    lines.push({
      line: l.line,
      covers,
      rules: subtractSpans(l.x0, l.x1, [...l.markers, ...shownSpans]).filter(([a, b]) => b - a > MIN_RULE),
      ruleY: l.y0 + RULE_AT * (l.y1 - l.y0),
      top: l.coverTop,
      bottom: l.coverBottom,
    });
  }
  return { lines, open };
}

/** The newest word's box for its following ink: its own x, its line's band (as the runs of words shown). */
export function followBox(words: QuranWords, plan: HiddenInkPlan, w: number): Rect {
  const r = words.rect(w);
  const line = plan.lines.find((l) => l.line === words.lineOf(w));
  return { x0: r.x0 - INK_EDGE, x1: r.x1 + INK_EDGE, y0: line?.top ?? r.y0, y1: line?.bottom ?? r.y1 };
}

/** Whether a hidden page shows word `w`: recited (or peeked) by the take, or in a verse shown whole. */
export function shownOnHiddenPage(words: QuranWords, follow: WordFollow, revealed: ReadonlySet<string>) {
  return (w: number) => follow.shown(w) || revealed.has(verseKey(words.ref(w)));
}

function PageInk({ box, scale, image, tint, testID }: { box: Rect; scale: number; image: { uri: string; width: number; height: number }; tint: { colour: string | null; opacity?: number }; testID: string }) {
  const left = box.x0 * scale;
  const top = box.y0 * scale;
  return (
    <View testID={testID} pointerEvents="none" style={{ position: 'absolute', left, top, width: (box.x1 - box.x0) * scale, height: (box.y1 - box.y0) * scale, overflow: 'hidden' }}>
      <Image
        testID={`${testID}-image`}
        source={{ uri: image.uri }}
        {...pageImageProps()}
        fadeDuration={0}
        style={[
          { position: 'absolute', left: -left, top: -top, width: image.width, height: image.height },
          tint.colour != null ? { tintColor: tint.colour } : null,
          tint.opacity != null ? { opacity: tint.opacity } : null,
        ]}
      />
    </View>
  );
}

/**
 * The hidden page (hiddenInkPlan), drawn over the page's image: the covers and their rules, the washes that mark a word
 * still hidden (no take running: RECITE-13; `off`), and the newest word shown in the following colour (`follow`), its own
 * ink drawn again over it (the one copy of the page's image: Majd, Nov 22 2026, "i dont see the words being a different
 * color as its recited"). A shown word's wash is behind the page's ink (the underlay).
 */
export function HiddenInkLayer({
  page,
  scale,
  words,
  shown,
  image,
  colors,
  washes,
  follow,
}: {
  page: number;
  scale: number;
  words: QuranWords;
  shown: (w: number) => boolean;
  image: { uri: string; width: number; height: number } | null;
  colors: { cover: string; guide: string };
  /** Over the covers: only for words still hidden. */
  washes: readonly InkWash[];
  follow: { w: number; colour: string } | null;
}) {
  const plan = useMemo(() => hiddenInkPlan(words, page, shown), [words, page, shown]);
  const inked = follow && words.pageOf(follow.w) === page && shown(follow.w) ? follow : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`hidden-page-${page}`}>
      {plan.lines.flatMap((l) =>
        l.covers.map((c, i) => (
          <View
            key={`cover-${l.line}-${i}`}
            testID="hidden-cover"
            style={[styles.abs, { backgroundColor: colors.cover, left: c.x0 * scale, top: c.y0 * scale, width: (c.x1 - c.x0) * scale, height: (c.y1 - c.y0) * scale }]}
          />
        )),
      )}
      {plan.lines.flatMap((l) =>
        l.rules.map(([a, b], i) => (
          <View
            key={`rule-${l.line}-${i}`}
            testID="hidden-guide"
            style={[styles.abs, styles.rule, { backgroundColor: colors.guide, left: a * scale, width: (b - a) * scale, top: l.ruleY * scale }]}
          />
        )),
      )}
      {washes.map((w) => (
        <Wash key={w.testID + w.box.x0} testID={w.testID} box={w.box} scale={scale} colour={w.colour} opacity={w.opacity} />
      ))}
      {image && inked ? (
        <PageInk testID="live-follow-ink" box={followBox(words, plan, inked.w)} scale={scale} image={image} tint={{ colour: inked.colour }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  rule: { height: 1, opacity: 0.35, borderRadius: 1 },
});
