// An Insights page's top bar (ACT-35): back and help on one side, the range chip on the other, the page's name between.
// With both on the right (sides of 150 pt) every name was cut on a 402 pt iPhone ("Memo…", "Cover…": the iOS E2E shots of
// Nov 28 2026). Measured with the system font's own widths (jest/textWidth), which err a little wide.

import { textWidth } from '../../../../jest/textWidth';
import { INSIGHTS_SECTIONS, SECTION_LABELS, sectionBarSide } from '../../../lib/activitySections';
import { INSIGHTS_RANGES, rangeLabel } from '../../../lib/insightsRange';

const GUTTER = 16;
const SHRINK = 0.8; // BarTitle's `fit`
const SE = 375;
const PRO = 402;
const PRO_MAX = 440;

const middle = (width: number, scale: number) => width - 2 * GUTTER - 2 * sectionBarSide(scale);
// ChoiceChip md: 15 pt semibold (title@17's widths, scaled), 14 + 11 padding, a 15 pt chevron 4 pt after, a 1 pt border.
const chip = (label: string, scale: number) => textWidth(label, 'title@17', Math.min(scale, 1.4) * (15 / 17)) + 14 + 11 + 4 + 15 + 2;

describe('[ACT-35] an Insights page’s top bar', () => {
  it.each([
    [SE, 1],
    [PRO, 1],
    [PRO_MAX, 1],
    [PRO, 1.2],
    [PRO_MAX, 1.2],
  ])('every page’s name fits its middle at %i pt, text ×%s (shrunk at most to 80%%, never cut)', (width, scale) => {
    for (const s of INSIGHTS_SECTIONS) {
      expect({ name: SECTION_LABELS.insights[s], fits: textWidth(SECTION_LABELS.insights[s], 'title@17', scale) * SHRINK <= middle(width, scale) }).toEqual({
        name: SECTION_LABELS.insights[s],
        fits: true,
      });
    }
  });

  it('at text ×1 on a 402 pt iPhone and wider, every name fits whole, unshrunk', () => {
    for (const width of [PRO, PRO_MAX]) {
      for (const s of INSIGHTS_SECTIONS) expect(textWidth(SECTION_LABELS.insights[s], 'title@17') <= middle(width, 1)).toBe(true);
    }
  });

  it.each([1, 1.2, 1.4, 2])('the range chip fits its side at text ×%s, whichever range', (scale) => {
    for (const r of INSIGHTS_RANGES) expect(chip(rangeLabel(r), scale) <= sectionBarSide(scale)).toBe(true);
  });
});
