// Whether Arabic text in Amiri shows every haraka (Majd, Nov 22 2026: on a mistake's card "u cant even see if theres a
// dumma or fatha on the top"). A Text draws only inside its own box on iOS and Android, so its line must hold the ink:
// AMIRI_INK above and below the baseline, as React Native lays the line out (amiriRoom). Layout tests can't see ink.

import { AMIRI_INK, amiriRoom, fontsV2 } from '../src/theme/v2';

// A rendered element as the testing library returns it.
interface Node {
  type: unknown;
  props: Record<string, any> | null;
  children: Array<Node | string>;
}

/** A style prop as one object (arrays and nested arrays merged, falsy entries skipped). */
function flat(style: unknown): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) return style.reduce<Record<string, any>>((acc, s) => ({ ...acc, ...flat(s) }), {});
  return typeof style === 'object' ? (style as Record<string, any>) : {};
}

/**
 * Why Amiri text in this style would clip its harakat, or null when its line holds them all. No lineHeight is the
 * font's own line, whose ascent (1.124×) is below the marks' (1.481×).
 */
export function harakatClip(style: unknown): string | null {
  const s = flat(style);
  if (s.fontFamily !== fontsV2.arabic) return null;
  const size: number = s.fontSize ?? 14;
  const line: number | undefined = s.lineHeight;
  if (line == null) return `${size} pt with the font's own line`;
  const room = amiriRoom(size, line);
  if (room.above < AMIRI_INK.above * size || room.below < AMIRI_INK.below * size) {
    return `${size} pt on a ${line} pt line: ${room.above.toFixed(1)} above and ${room.below.toFixed(1)} below, the marks need ${(AMIRI_INK.above * size).toFixed(1)} and ${(AMIRI_INK.below * size).toFixed(1)}`;
  }
  return null;
}

function textOf(node: Node): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}

/**
 * Every Amiri text under `root` (the host Text that sets the font; nested Texts take its line): its text and why it
 * would clip (null when every haraka shows).
 */
export function arabicLines(root: Node): Array<{ text: string; clip: string | null }> {
  const out: Array<{ text: string; clip: string | null }> = [];
  const walk = (node: Node) => {
    if (node.type === 'Text' && flat(node.props?.style).fontFamily === fontsV2.arabic) {
      out.push({ text: textOf(node), clip: harakatClip(node.props?.style) });
      return;
    }
    for (const c of node.children) if (typeof c !== 'string') walk(c);
  };
  walk(root);
  return out;
}

/** The Amiri texts under `root` that would clip, as "its text: why"; empty when every haraka shows. */
export function clippedArabic(root: Node): string[] {
  return arabicLines(root)
    .filter((l) => l.clip)
    .map((l) => `${l.text.slice(0, 24)}: ${l.clip}`);
}
