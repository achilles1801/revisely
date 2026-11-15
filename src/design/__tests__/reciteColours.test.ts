// Recite's colours never follow the accent (Majd, Nov 14 and 15 2026): the word being followed is blue, a mistake red, a
// slip amber, in every accent and theme. In Crimson, an accent-coloured highlight over the ayah read as a mistake.
import { ACCENTS, paletteV2 } from '../../theme/v2';

const RECITE = ['followBand', 'followWord', 'followInk', 'red', 'redSubtle', 'warn', 'warnSubtle'] as const;

/** A colour's hue in degrees. */
function hue(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('Recite’s colours, in every accent and theme', () => {
  for (const isDark of [false, true]) {
    it(`are the same whatever the accent (${isDark ? 'dark' : 'light'})`, () => {
      const base = paletteV2(isDark, 'indigo');
      for (const accent of ACCENTS) {
        const p = paletteV2(isDark, accent);
        for (const k of RECITE) expect([accent, k, p[k]]).toEqual([accent, k, base[k]]);
      }
    });

    it(`follow in blue, never anything that reads as a mistake (${isDark ? 'dark' : 'light'})`, () => {
      const p = paletteV2(isDark, 'crimson');
      for (const k of ['followBand', 'followWord', 'followInk'] as const) {
        const h = hue(p[k]);
        expect([k, h >= 200 && h <= 240]).toEqual([k, true]);
      }
    });
  }
});
