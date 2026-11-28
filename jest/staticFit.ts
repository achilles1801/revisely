// How tall a static screen is drawn, from its rendered tree, so a test can say it fits a phone without scrolling (Majd,
// Nov 28 2026: "the sign in shouldn't be scrollable it should be static"). Layout tests can't measure, so this lays the
// tree out the way React Native's flexbox does for the cases a static screen uses: columns and rows, padding, margins,
// borders, gap, minHeight and height, flex children sharing a row's width, absolute children taking no room. Text wraps
// word by word at the system font's own widths (jest/sfAdvances.json, kerning left out, so it errs wide), at the phone's
// text size capped by each text's maxFontSizeMultiplier. It errs tall, so a screen it says fits, fits.

const ADVANCES: Record<string, Record<string, number>> = require('./sfAdvances.json');

/** A host element as the testing library's toJSON gives it. */
export interface HostNode {
  type: string;
  props: Record<string, any>;
  children: Array<HostNode | string> | null;
}

/** A style prop as one object (arrays and nested arrays merged, falsy entries skipped). */
export function flatStyle(style: unknown): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) return style.reduce<Record<string, any>>((acc, s) => ({ ...acc, ...flatStyle(s) }), {});
  return typeof style === 'object' ? (style as Record<string, any>) : {};
}

const ARABIC_MARK = /[ً-ٰٟۖ-ۭ⁦-⁩]/;
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/** One character's advance at `size` pt and `weight`, from the measured tables (Arabic letters at 0.6 em, marks at 0). */
function advance(ch: string, size: number, weight: string | number | undefined): number {
  if (ARABIC_MARK.test(ch)) return 0;
  if (ARABIC.test(ch)) return 0.6 * size;
  const w = String(weight ?? '400');
  const [table, at] = w === '700' || w === 'bold' || w === '800' || w === '900' ? ['figure@20', 20] : w === '600' || w === '500' ? ['title@17', 17] : ['meta@13', 13];
  const t = ADVANCES[table];
  return ((t[ch] ?? t.M) * size) / (at as number);
}

export function lineWidth(text: string, size: number, weight?: string | number, letterSpacing = 0): number {
  let w = 0;
  for (const ch of text) w += advance(ch, size, weight) + Math.max(0, letterSpacing);
  return w;
}

/** How many lines `text` takes in `width`, wrapped at spaces (a word wider than the line takes as many lines as it needs). */
export function linesOf(text: string, width: number, size: number, weight?: string | number, letterSpacing = 0): number {
  if (!text) return 0;
  let lines = 0;
  for (const para of text.split('\n')) {
    let line = 0;
    let count = 1;
    const space = lineWidth(' ', size, weight, letterSpacing);
    for (const word of para.split(' ')) {
      const w = lineWidth(word, size, weight, letterSpacing);
      if (w > width) {
        // A word longer than the line: it starts on its own line and runs on.
        if (line > 0) count++;
        const extra = Math.ceil(w / width);
        count += extra - 1;
        line = w - (extra - 1) * width;
        continue;
      }
      if (line > 0 && line + space + w > width) {
        count++;
        line = w;
      } else line += (line > 0 ? space : 0) + w;
    }
    lines += count;
  }
  return lines;
}

function textOf(node: HostNode | string): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(textOf).join('');
}

const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const vertical = (s: Record<string, any>, side: 'margin' | 'padding') =>
  num(s[`${side}Top`] ?? s[`${side}Vertical`] ?? s[side]) + num(s[`${side}Bottom`] ?? s[`${side}Vertical`] ?? s[side]);
const horizontal = (s: Record<string, any>, side: 'margin' | 'padding') =>
  num(s[`${side}Start`] ?? s[`${side}Left`] ?? s[`${side}Horizontal`] ?? s[side]) +
  num(s[`${side}End`] ?? s[`${side}Right`] ?? s[`${side}Horizontal`] ?? s[side]);

/** The text size a Text or TextInput is drawn at: the phone's, capped by its own maxFontSizeMultiplier. */
function scaleOf(props: Record<string, any>, fontScale: number): number {
  if (props.allowFontScaling === false) return 1;
  const cap = props.maxFontSizeMultiplier;
  return cap && cap >= 1 ? Math.min(fontScale, cap) : fontScale;
}

const isIcon = (n: HostNode) => typeof n.props?.testID === 'string' && n.props.testID.startsWith('icon-');

/** A child's natural width in a row (before flex children share what's left). */
function naturalWidth(node: HostNode, room: number, fontScale: number): number {
  const s = flatStyle(node.props.style);
  if (s.position === 'absolute') return 0;
  const margins = horizontal(s, 'margin');
  if (typeof s.width === 'number') return s.width + margins;
  if (isIcon(node)) return 22 + margins;
  if (node.type === 'Text') {
    const scale = scaleOf(node.props, fontScale);
    const size = (s.fontSize ?? 14) * scale;
    return Math.min(room, lineWidth(textOf(node), size, s.fontWeight, s.letterSpacing) + horizontal(s, 'padding') + margins);
  }
  const kids = (node.children ?? []).filter((c): c is HostNode => typeof c !== 'string');
  const inner = horizontal(s, 'padding') + 2 * num(s.borderWidth);
  const dir = s.flexDirection ?? 'column';
  const widths = kids.map((k) => naturalWidth(k, room - inner, fontScale));
  const content = dir === 'row' ? widths.reduce((a, b) => a + b, 0) + num(s.gap ?? s.columnGap) * Math.max(0, kids.length - 1) : Math.max(0, ...widths);
  return Math.min(room, Math.max(num(s.minWidth), content + inner) + margins);
}

/** The height a node takes in a column of `width`, margins included. */
export function heightOf(node: HostNode, width: number, fontScale: number): number {
  const s = flatStyle(node.props.style);
  // A modal draws over the screen, never in its column.
  if (s.position === 'absolute' || s.display === 'none' || node.type === 'Modal') return 0;
  const border = num(s.borderWidth);
  let outer = width - horizontal(s, 'margin');
  if (typeof s.width === 'number') outer = s.width;
  if (typeof s.maxWidth === 'number') outer = Math.min(outer, s.maxWidth);
  const inner = outer - horizontal(s, 'padding') - 2 * border;
  let content = 0;
  if (isIcon(node)) content = 22;
  else if (node.type === 'Text') {
    const scale = scaleOf(node.props, fontScale);
    const size = (s.fontSize ?? 14) * scale;
    const line = (s.lineHeight ?? (s.fontSize ?? 14) * 1.2) * scale;
    content = linesOf(textOf(node), inner, size, s.fontWeight, s.letterSpacing) * line;
  } else if (node.type === 'TextInput') {
    const scale = scaleOf(node.props, fontScale);
    content = (s.lineHeight ?? (s.fontSize ?? 14) * 1.2) * scale;
  } else {
    const kids = (node.children ?? []).filter((c): c is HostNode => typeof c !== 'string');
    const placed = kids.filter((k) => flatStyle(k.props.style).position !== 'absolute');
    const dir = s.flexDirection ?? 'column';
    if (dir === 'row') {
      const gap = num(s.gap ?? s.columnGap);
      const flexing = placed.filter((k) => num(flatStyle(k.props.style).flex) > 0);
      const fixed = placed.filter((k) => !flexing.includes(k));
      const fixedW = fixed.map((k) => naturalWidth(k, inner, fontScale));
      const left = Math.max(0, inner - fixedW.reduce((a, b) => a + b, 0) - gap * Math.max(0, placed.length - 1));
      const heights = placed.map((k) => {
        const w = flexing.includes(k) ? left / flexing.length : fixedW[fixed.indexOf(k)];
        return heightOf(k, w, fontScale);
      });
      content = Math.max(0, ...heights);
    } else {
      const gap = num(s.gap ?? s.rowGap);
      content = placed.reduce((sum, k) => sum + heightOf(k, inner, fontScale), 0) + gap * Math.max(0, placed.length - 1);
    }
  }
  const box = typeof s.height === 'number' ? s.height : Math.max(num(s.minHeight), content + vertical(s, 'padding') + 2 * border);
  return box + vertical(s, 'margin');
}

/**
 * In a column, the height from its top to the bottom of the child holding `testID` (that child included): what must
 * stay above the keyboard.
 */
export function heightUntil(column: HostNode, testID: string, width: number, fontScale: number): number {
  const s = flatStyle(column.props.style);
  const inner = width - horizontal(s, 'margin') - horizontal(s, 'padding') - 2 * num(s.borderWidth);
  const gap = num(s.gap ?? s.rowGap);
  let sum = num(s.paddingTop ?? s.paddingVertical ?? s.padding) + num(s.marginTop ?? s.marginVertical ?? s.margin);
  const kids = (column.children ?? []).filter((c): c is HostNode => typeof c !== 'string' && flatStyle(c.props.style).position !== 'absolute');
  for (let i = 0; i < kids.length; i++) {
    sum += heightOf(kids[i], inner, fontScale) + (i > 0 ? gap : 0);
    if (contains(kids[i], testID)) return sum;
  }
  throw new Error(`${testID} isn't in this column`);
}

export function contains(node: HostNode | string, testID: string): boolean {
  if (typeof node === 'string') return false;
  if (node.props?.testID === testID) return true;
  return (node.children ?? []).some((c) => contains(c, testID));
}

export function find(node: HostNode | string | null, testID: string): HostNode | null {
  if (!node || typeof node === 'string') return null;
  if (node.props?.testID === testID) return node;
  for (const c of node.children ?? []) {
    const hit = find(c, testID);
    if (hit) return hit;
  }
  return null;
}

/** Every host node of `type` under `node`. */
export function allOf(node: HostNode | string | null, type: string): HostNode[] {
  if (!node || typeof node === 'string') return [];
  return [...(node.type === type ? [node] : []), ...(node.children ?? []).flatMap((c) => allOf(c, type))];
}
