// An Insights page's top bar (ACT-35): back and help on one side, the range chip on the other, the page's name between.
// With both on the right (sides of 150 pt) every name was cut on a 402 pt iPhone ("Memo…", "Cover…": the iOS E2E shots of
// Nov 28 2026). Nothing in the bar is ever cut: where the name wouldn't fit beside the chip, the chip goes to the top of the
// page. Measured with the system font's own widths (jest/textWidth), which err a little wide; the names in English
// (textWidth counts an Arabic letter as an "M", far wider than it is).

import { textWidth } from '../../../../jest/textWidth';
import { INSIGHTS_SECTIONS, LONGEST_SECTION_NAME, SECTION_LABELS, SECTION_NAME_SHRINK, sectionBar } from '../../../lib/activitySections';
import { INSIGHTS_RANGES, rangeLabel } from '../../../lib/insightsRange';

const GUTTER = 16;
const SE = 375;
const PRO = 402;
const PRO_MAX = 440;
// Every text size iOS offers, up to the largest accessibility size (AX5, about 3.1×); the bar's name stops at 1.4×.
const SCALES = [0.82, 1, 1.12, 1.24, 1.35, 1.65, 2, 2.4, 2.8, 3.12];
const NAME_CAP = 1.4;
// Back (28 pt) and help (22 pt), 18 pt apart; icons don't grow with the text.
const BACK_AND_HELP = 28 + 18 + 22;

const middle = (width: number, scale: number) => width - 2 * GUTTER - 2 * sectionBar(width, scale).side;
// ChoiceChip md: 15 pt semibold (title@17's widths, scaled), 14 + 11 padding, a 15 pt chevron 4 pt after, a 1 pt border.
const chip = (label: string, scale: number) => textWidth(label, 'title@17', Math.min(Math.max(scale, 1), 1.4) * (15 / 17)) + 14 + 11 + 4 + 15 + 2;

describe('[ACT-35] an Insights page’s top bar', () => {
  it('the longest name the bar plans for is the longest there is', () => {
    for (const s of INSIGHTS_SECTIONS) expect(textWidth(SECTION_LABELS.insights[s], 'title@17')).toBeLessThanOrEqual(LONGEST_SECTION_NAME);
  });

  it.each([SE, PRO, PRO_MAX].flatMap((w) => SCALES.map((s) => [w, s] as const)))(
    'at %i pt, text ×%s, every page’s name fits whole (shrunk at most to 80%%), never cut',
    (width, scale) => {
      const shown = Math.min(Math.max(scale, 1), NAME_CAP);
      for (const s of INSIGHTS_SECTIONS) {
        const name = SECTION_LABELS.insights[s];
        expect({ name, fits: textWidth(name, 'title@17', shown) * SECTION_NAME_SHRINK <= middle(width, scale) }).toEqual({ name, fits: true });
      }
      // Back and help fit their side, and the chip its own when it is in the bar.
      expect(BACK_AND_HELP).toBeLessThanOrEqual(sectionBar(width, scale).side);
      if (sectionBar(width, scale).chipInBar) for (const r of INSIGHTS_RANGES) expect(chip(rangeLabel(r), scale)).toBeLessThanOrEqual(sectionBar(width, scale).side);
    },
  );

  it('at the default text size the range stays in the bar on every iPhone, as the board drew it', () => {
    for (const width of [SE, PRO, PRO_MAX]) expect(sectionBar(width, 1).chipInBar).toBe(true);
  });

  it('at text ×1 on a 402 pt iPhone and wider, every name fits whole, unshrunk', () => {
    for (const width of [PRO, PRO_MAX]) {
      for (const s of INSIGHTS_SECTIONS) expect(textWidth(SECTION_LABELS.insights[s], 'title@17')).toBeLessThanOrEqual(middle(width, 1));
    }
  });

  it('with the largest text the range goes to the top of the page on every iPhone, so the name keeps the bar', () => {
    for (const width of [SE, PRO, PRO_MAX]) expect(sectionBar(width, 3.12).chipInBar).toBe(false);
  });
});

