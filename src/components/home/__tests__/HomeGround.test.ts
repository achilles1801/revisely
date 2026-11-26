// Home's ground (HOME-6): grey text reads at 4.5:1 or more anywhere on it, in every accent, light and dark, with the
// glow, its wash down to the tab bar and the glow rising from the tab bar (accent or the Ramadan theme's amber).
import { ACCENTS, HERO_FIRST_TEXT_OFFSET, HERO_SHAPE, paletteV2, ramadanV2, type HeroStops } from '../../../theme/v2';
import { floorOf, tailOf, TAIL_SHAPE } from '../HomeGround';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const over = (base: number[], hex: string, alpha: number) => rgb(hex).map((c, i) => base[i] + (c - base[i]) * alpha);
const lum = (c: number[]) => {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** A gradient's opacity at `at` (0–1), between its stops. */
function along(stops: readonly (readonly [number, number])[], at: number): number {
  for (let i = 1; i < stops.length; i++) {
    const [a, va] = stops[i - 1];
    const [b, vb] = stops[i];
    if (at <= b) return va + ((vb - va) * (at - a)) / (b - a || 1);
  }
  return stops[stops.length - 1][1];
}
const heroAt = (hero: HeroStops, at: number) => ({
  color: hero[0].color,
  alpha: along(
    hero.map((s) => [s.offset, s.opacity] as const),
    Math.min(1, at),
  ),
});

describe('Home’s ground keeps grey text readable', () => {
  const combos = ACCENTS.flatMap((accent) => [false, true].map((dark) => [accent, dark] as const));

  it.each(combos)('[HOME-6] %s, dark %s: on the glow and its wash, from the first text to the tab bar', (accent, dark) => {
    const p = paletteV2(dark, accent);
    const tail = tailOf(p.hero, dark);
    const shape = dark ? HERO_SHAPE.dark : HERO_SHAPE.light;
    // An iPhone SE's ground and a Pro Max's: the screen less the tab bar.
    for (const ground of [584, 846]) {
      for (let y = HERO_FIRST_TEXT_OFFSET * shape.height; y <= ground; y += 4) {
        let bg = rgb(p.bg);
        if (p.hero) {
          const g = heroAt(p.hero, y / shape.height);
          bg = over(bg, g.color, g.alpha);
        }
        if (tail) bg = over(bg, tail.color, tail.peak * along(TAIL_SHAPE, y / ground));
        expect(contrast(rgb(p.secondary), bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(combos)('[HOME-6] %s, dark %s: on the glow rising from the tab bar, at its brightest', (accent, dark) => {
    const p = paletteV2(dark, accent);
    for (const amber of [null, ramadanV2(dark, accent).bulbs[0]]) {
      const floor = floorOf(p.hero, dark, amber);
      if (!floor) continue;
      const bg = over(rgb(p.bg), floor.color, floor.opacity);
      expect(contrast(rgb(p.secondary), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
