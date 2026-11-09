// How a Coverage tile looks for each state: Insights' juz tiles and Revo's juz map draw the same
// (ACT-4, ACT-25). "Not revised yet" is neutral, an outline like 30+ days but never red.

import type { ViewStyle } from 'react-native';
import type { PaletteV2 } from '../../theme/v2';
import type { JuzState } from '../../lib/insightsView';

export interface CoverageLook {
  box: ViewStyle;
  /** The juz number's colour. */
  color: string;
  /** Not memorized: the number is quieter. */
  dim: boolean;
}

export function coverageLook(state: JuzState, palette: PaletteV2): CoverageLook {
  switch (state) {
    case 'week':
      return { box: { backgroundColor: palette.heat[3] }, color: palette.heatInk[3], dim: false };
    case 'month':
      return { box: { backgroundColor: palette.heat[1] }, color: palette.heatInk[1], dim: false };
    case 'new':
      return { box: { borderWidth: 1.5, borderColor: palette.secondary }, color: palette.text, dim: false };
    case 'stale':
      return { box: { borderWidth: 1.5, borderColor: palette.red }, color: palette.red, dim: false };
    default:
      return { box: { backgroundColor: palette.heat[0] }, color: palette.secondary, dim: true };
  }
}

/** The legend's words for each state shown. */
export const COVERAGE_LABELS: Record<JuzState, string> = {
  week: 'This week',
  month: 'This month',
  new: 'Not revised yet',
  stale: '30+ days',
  none: 'Not memorized',
};
