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

export interface InkWash {
  box: Rect;
  colour: string;
  opacity?: number;
  testID: string;
}

export interface HiddenInkPlan {
  /** Each line: its cover, its faint rule's parts (where words are still hidden), and the band its ink is drawn in. */
  lines: { line: number; cover: Rect; rules: Span[]; ruleY: number; top: number; bottom: number }[];
  /** What is drawn in the page's ink: the verse markers, whole, and each run of words shown, in bounds space. */
  ink: { box: Rect; kind: 'marker' | 'shown' }[];
}

/**
 * A hidden page drawn as an empty page (Majd, Nov 22 2026, of Tarteel's: "yeah kinda similar to the ink color change i
 * mentioned earlier, let's do it and test it"): each line covered in the page's colour, a faint rule where its words are
 * still hidden, and over it, in the page's own ink, the verse markers whole and every run of words shown (recited,
 * peeked or in a verse shown), each drawn again from the page's image through its words' boxes. Pure, in bounds space.
 */
export function hiddenInkPlan(words: QuranWords, page: number, shown: (w: number) => boolean): HiddenInkPlan {
  const [from, to] = words.pageRange(page);
  const runs = new Map<number, Span[]>();
  let run: { line: number; x0: number; x1: number } | null = null;
  const close = () => {
    if (!run) return;
    const list = runs.get(run.line) ?? [];
    list.push([run.x0, run.x1]);
    runs.set(run.line, list);
    run = null;
  };
  for (let w = from; w < to; w++) {
    if (!shown(w)) {
      close();
      continue;
    }
    const line = words.lineOf(w);
    const r = words.rect(w);
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
  const ink: HiddenInkPlan['ink'] = [];
  for (const l of pageLines(page)) {
    const shownSpans = runs.get(l.line) ?? [];
    const band = (a: number, b: number): Rect => ({ x0: a - INK_EDGE, x1: b + INK_EDGE, y0: l.coverTop, y1: l.coverBottom });
    for (const [a, b] of l.markers) ink.push({ box: band(a, b), kind: 'marker' });
    for (const [a, b] of shownSpans) ink.push({ box: band(a, b), kind: 'shown' });
    lines.push({
      line: l.line,
      cover: { x0: l.x0 - COVER_EDGE, x1: l.x1 + COVER_EDGE, y0: l.coverTop, y1: l.coverBottom },
      rules: subtractSpans(l.x0, l.x1, [...l.markers, ...shownSpans]).filter(([a, b]) => b - a > 2),
      ruleY: l.y0 + RULE_AT * (l.y1 - l.y0),
      top: l.coverTop,
      bottom: l.coverBottom,
    });
  }
  return { lines, ink };
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
 * The hidden page (hiddenInkPlan), drawn: the covers and rules, then the washes (mistakes, past mistakes, the covered
 * word being said, `off`: over the covers, so a shown word's wash is whole and a hidden word's marks its place), then
 * the ink: markers and the words shown in the page's ink (`ink`: the page image's own tint), and the newest word shown
 * in the following colour (`follow`), its own ink drawn again over it. Without the page's image yet, only the covers.
 */
export function HiddenInkLayer({
  page,
  scale,
  words,
  shown,
  image,
  ink,
  colors,
  washes,
  follow,
}: {
  page: number;
  scale: number;
  words: QuranWords;
  shown: (w: number) => boolean;
  image: { uri: string; width: number; height: number } | null;
  /** How the pager tints the page image (dark pages: white at 0.92), so words drawn again match the rest. */
  ink: { colour: string | null; opacity?: number };
  colors: { cover: string; guide: string };
  washes: readonly InkWash[];
  follow: { w: number; colour: string } | null;
}) {
  const plan = useMemo(() => hiddenInkPlan(words, page, shown), [words, page, shown]);
  const inked = follow && words.pageOf(follow.w) === page && shown(follow.w) ? follow : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`hidden-page-${page}`}>
      {plan.lines.map((l) => (
        <View
          key={`cover-${l.line}`}
          testID="hidden-cover"
          style={[styles.abs, { backgroundColor: colors.cover, left: l.cover.x0 * scale, top: l.cover.y0 * scale, width: (l.cover.x1 - l.cover.x0) * scale, height: (l.cover.y1 - l.cover.y0) * scale }]}
        />
      ))}
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
      {image
        ? plan.ink.map((p, i) => (
            <PageInk key={`ink-${i}`} testID={p.kind === 'marker' ? 'hidden-marker' : 'hidden-shown'} box={p.box} scale={scale} image={image} tint={ink} />
          ))
        : null}
      {image && inked ? (
        <PageInk
          testID="live-follow-ink"
          box={followBox(words, plan, inked.w)}
          scale={scale}
          image={image}
          tint={{ colour: inked.colour }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  rule: { height: 1, opacity: 0.35, borderRadius: 1 },
});
