// Revo in the app's theme and accent (Majd, Nov 7 2026: it was dark purple whatever the accent).
// Its mark and glows are tokens per accent (palette.revo), checked here like design.test's.
import { ACCENTS, paletteV2, revoV2 } from '../../theme/v2';

const lum = (hex: string) => {
  const [r, g, b] = [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
const over = (color: string, alpha: number, ground: string) =>
  '#' +
  [0, 1, 2]
    .map((i) => Math.round(channel(color, i) * alpha + channel(ground, i) * (1 - alpha)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

const combos = ACCENTS.flatMap((accent) => [false, true].map((isDark) => [`${accent} ${isDark ? 'dark' : 'light'}`, accent, isDark] as const));

describe('Revo’s colours follow the accent', () => {
  it.each(combos)('%s: the R reads on its disc (3:1, both ends of its gradient)', (_n, accent, isDark) => {
    const t = paletteV2(isDark, accent).revo;
    for (const c of t.r) {
      expect(contrast(c, revoV2.discMid)).toBeGreaterThanOrEqual(3);
      expect(contrast(c, revoV2.discEdge)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(combos)('%s: text keeps 4.5:1 where the sheet’s glow is strongest', (_n, accent, isDark) => {
    const p = paletteV2(isDark, accent);
    const glow = p.revo.sheetGlow;
    if (!glow) return;
    const ground = over(glow.color, glow.opacity, p.sheet);
    expect(contrast(p.text, ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.secondary, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it('each accent has its own mark and glow; Indigo is the mocks’; Jade has no glow in dark, as on Home', () => {
    expect(paletteV2(false, 'indigo').revo.r).toEqual(['#624BD5', '#9789DA']);
    expect(new Set(ACCENTS.map((a) => paletteV2(true, a).revo.glow)).size).toBe(ACCENTS.length);
    expect(new Set(ACCENTS.map((a) => paletteV2(false, a).revo.r[0])).size).toBe(ACCENTS.length);
    expect(paletteV2(true, 'jade').revo.sheetGlow).toBeNull();
    expect(paletteV2(true, 'jade').hero).toBeNull();
  });
});
