// Whether Arabic text in Amiri shows every letter and haraka (Majd, Nov 22 2026: on a mistake's card "u cant even see
// if theres a dumma or fatha on the top"). A Text draws only inside its own box on iOS and Android, so its line must
// hold the ink above and below the baseline, as React Native lays the line out (amiriRoom): AMIRI_INK for text with
// harakat, AMIRI_NAME_INK for unvoweled text (a surah's name). Layout tests can't see ink.

import { AMIRI_INK, AMIRI_NAME_INK, amiriRoom, fontsV2, hasHarakat } from '../src/theme/v2';

// A rendered element as the testing library returns it.
interface Node {
  type: unknown;
  props: Record<string, any> | null;
  children: Array<Node | string>;
}

type Ink = { above: number; below: number };

/** The ink a text needs room for: the voweled reach when it carries harakat, else the reach of unvoweled names. */
export const inkFor = (text: string): Ink => (hasHarakat(text) ? AMIRI_INK : AMIRI_NAME_INK);

/** A style prop as one object (arrays and nested arrays merged, falsy entries skipped). */
function flat(style: unknown): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) return style.reduce<Record<string, any>>((acc, s) => ({ ...acc, ...flat(s) }), {});
  return typeof style === 'object' ? (style as Record<string, any>) : {};
}

/**
 * Why Amiri text in this style would clip `ink` (voweled by default), or null when its line holds it. No lineHeight
 * is the font's own line, whose ascent (1.124×) is below voweled marks (1.481×) and whose descent (0.634×) is above a
 * name's lowest tail (0.651×).
 */
export function harakatClip(style: unknown, ink: Ink = AMIRI_INK): string | null {
  const s = flat(style);
  if (s.fontFamily !== fontsV2.arabic) return null;
  const size: number = s.fontSize ?? 14;
  const line: number | undefined = s.lineHeight;
  if (line == null) return `${size} pt with the font's own line`;
  const room = amiriRoom(size, line);
  if (room.above < ink.above * size || room.below < ink.below * size) {
    return `${size} pt on a ${line} pt line: ${room.above.toFixed(1)} above and ${room.below.toFixed(1)} below, the text needs ${(ink.above * size).toFixed(1)} and ${(ink.below * size).toFixed(1)}`;
  }
  return null;
}

function textOf(node: Node): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}

/**
 * Every Amiri text under `root` (the host Text that sets the font; nested Texts take its line): its text and why it
 * would clip what it shows (null when every letter and haraka fits).
 */
export function arabicLines(root: Node): Array<{ text: string; clip: string | null }> {
  const out: Array<{ text: string; clip: string | null }> = [];
  const walk = (node: Node) => {
    if (node.type === 'Text' && flat(node.props?.style).fontFamily === fontsV2.arabic) {
      const text = textOf(node);
      out.push({ text, clip: harakatClip(node.props?.style, inkFor(text)) });
      return;
    }
    for (const c of node.children) if (typeof c !== 'string') walk(c);
  };
  walk(root);
  return out;
}

/** The Amiri texts under `root` that would clip, as "its text: why"; empty when everything shows. */
export function clippedArabic(root: Node): string[] {
  return arabicLines(root)
    .filter((l) => l.clip)
    .map((l) => `${l.text.slice(0, 24)}: ${l.clip}`);
}
