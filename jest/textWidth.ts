// How wide a line of chrome text is drawn, in points, from the system font's own advance widths (SF Pro, measured by
// scripts/measure-sf-advances.swift into jest/sfAdvances.json). Kerning is left out, so it errs a little wide: a line it
// says fits, fits. A character it has no width for (Arabic, an emoji) counts as an "M", the widest it has.

const ADVANCES: Record<string, Record<string, number>> = require('./sfAdvances.json');

/** The styles measured: a row's grey words (13 pt), its figure (20 pt bold), its title (17 pt semibold). */
export type ChromeStyle = 'meta@13' | 'figure@20' | 'title@17';

export function textWidth(text: string, style: ChromeStyle, scale = 1): number {
  const table = ADVANCES[style];
  if (!table) throw new Error(`No widths for ${style}: run scripts/measure-sf-advances.swift`);
  let width = 0;
  for (const ch of text) width += table[ch] ?? table.M;
  return width * scale;
}
