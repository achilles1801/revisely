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

/**
 * A juz or surah filled by share (ACT-26): from the left, the part revised this week (`heat[3]`) then this
 * month (`heat[1]`), like Home's juz dots. The rest is the screen's ground, with the outline saying what it
 * is: grey for not revised yet, red for 30+ days. A part not memorized is the quiet `heat[0]` tile.
 */
export interface FillLook {
  /** The unfilled ground and its label colour. */
  ground: { backgroundColor?: string; color: string; dim: boolean };
  /** Filled from the left, in order: each `share` of the whole (0–1), its colour and its label's. */
  segments: { share: number; backgroundColor: string; color: string }[];
  /** Grey (not revised yet) or red (30+ days); none when every page was revised within 30 days. */
  outline: string | null;
}

export function fillLook(state: JuzState, counts: Record<'week' | 'month' | 'new' | 'stale', number>, palette: PaletteV2): FillLook {
  const total = counts.week + counts.month + counts.new + counts.stale;
  if (state === 'none' || total === 0) {
    return { ground: { backgroundColor: palette.heat[0], color: palette.secondary, dim: true }, segments: [], outline: null };
  }
  const segments: FillLook['segments'] = [];
  if (counts.week > 0) segments.push({ share: counts.week / total, backgroundColor: palette.heat[3], color: palette.heatInk[3] });
  if (counts.month > 0) segments.push({ share: counts.month / total, backgroundColor: palette.heat[1], color: palette.heatInk[1] });
  return {
    ground: { color: counts.stale > 0 && segments.length === 0 ? palette.red : palette.text, dim: false },
    segments,
    outline: counts.stale > 0 ? palette.red : counts.new > 0 ? palette.secondary : null,
  };
}
