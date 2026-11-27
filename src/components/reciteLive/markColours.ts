// A mark's colour, wherever it shows (the page, the bar, the card, the summary): three colours, each a highlight with a
// firmer shade for the mark a card is open for (theme/v2: markWord…; Majd, Nov 15 2026), and a fourth that is never a
// mistake's, for a word corrected straight away (markCorrected; RECITE-33).

import type { PaletteV2 } from '../../theme/v2';
import type { Mark, MarkGroup } from '../../lib/reciteLive/contract';
import { isCorrected, markGroup, markTier } from '../../lib/reciteLive/contract';

type Colours = Pick<
  PaletteV2,
  'markWord' | 'markWordFirm' | 'markSlip' | 'markSlipFirm' | 'markTajweed' | 'markTajweedFirm' | 'markCorrected' | 'markCorrectedFirm'
>;

/** Which colour a mark takes: one of the three groups, or a corrected word's own (RECITE-33). */
export type ColourGroup = MarkGroup | 'corrected';

/**
 * Whether the colours follow the two tiers (lib/reciteLive/contract's `markTier`) instead of what a mark is about.
 * Off: Majd hasn't decided colours (Nov 22 2026; his tiers decision says nothing about them). On, every mistake is red
 * (a wrong haraka or letter joins the words), amber is only "Not clear", and violet is tajweed (Beta). The one switch:
 * `colourGroup`, `markFill`, `markFirm` and the bar's `toneFill` read it; turning it on changes RECITE-2's colours too.
 */
export const COLOURS_FOLLOW_TIERS = false;

/** A mark's group in test ids: its memory group, or `corrected` for a word corrected straight away (RECITE-33). */
export function shownGroup(mark: Pick<Mark, 'kind' | 'corrected'>): ColourGroup {
  return isCorrected(mark) ? 'corrected' : markGroup(mark);
}

/** Which colour a mark takes. The memory group (`markGroup`) never changes with it. */
export function colourGroup(mark: Pick<Mark, 'kind' | 'sure' | 'corrected'>, byTier: boolean = COLOURS_FOLLOW_TIERS): ColourGroup {
  if (isCorrected(mark)) return 'corrected';
  if (!byTier) return markGroup(mark);
  const tier = markTier(mark);
  return tier === 'mistake' ? 'word' : tier === 'unclear' ? 'slip' : 'tajweed';
}

/** The mark's highlight: red for words, amber for a haraka or letter and "Not clear", violet for tajweed, green for corrected. */
export function markFill(p: Colours, mark: Pick<Mark, 'kind' | 'sure' | 'corrected'>, byTier: boolean = COLOURS_FOLLOW_TIERS): string {
  const group = colourGroup(mark, byTier);
  return group === 'word' ? p.markWord : group === 'slip' ? p.markSlip : group === 'corrected' ? p.markCorrected : p.markTajweed;
}

/** Its firmer shade: the mark a card is open for. */
export function markFirm(p: Colours, mark: Pick<Mark, 'kind' | 'sure' | 'corrected'>, byTier: boolean = COLOURS_FOLLOW_TIERS): string {
  const group = colourGroup(mark, byTier);
  return group === 'word' ? p.markWordFirm : group === 'slip' ? p.markSlipFirm : group === 'corrected' ? p.markCorrectedFirm : p.markTajweedFirm;
}

/**
 * A word's highlight in the recite bar (lib/reciteLive/view's tones): a wrong word red, a wrong haraka or letter amber
 * (red once the colours follow the tiers: the bar never shows a Not clear), a tajweed note violet, else none.
 */
export function toneFill(p: Colours, tone: string, byTier: boolean = COLOURS_FOLLOW_TIERS): string | undefined {
  if (tone === 'wrong') return p.markWord;
  if (tone === 'slip') return byTier ? p.markWord : p.markSlip;
  if (tone === 'tajweed') return p.markTajweed;
  if (tone === 'corrected') return p.markCorrected;
  return undefined;
}

/**
 * Whether any of these marks shows amber (RECITE-31's note, the first time a take shows one): a wrong haraka or letter
 * and "Not clear", or "Not clear" alone once the colours follow the tiers.
 */
export function anyAmber(marks: Iterable<Pick<Mark, 'kind' | 'sure' | 'corrected'>>, byTier: boolean = COLOURS_FOLLOW_TIERS): boolean {
  for (const m of marks) if (colourGroup(m, byTier) === 'slip') return true;
  return false;
}
