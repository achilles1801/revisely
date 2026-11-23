// A mark's colour, wherever it shows (the page, the bar, the card, the summary): three colours, each a highlight with a
// firmer shade for the mark a card is open for (theme/v2: markWord…; Majd, Nov 15 2026).

import type { PaletteV2 } from '../../theme/v2';
import type { Mark, MarkGroup } from '../../lib/reciteLive/contract';
import { markGroup, markTier } from '../../lib/reciteLive/contract';

type Colours = Pick<PaletteV2, 'markWord' | 'markWordFirm' | 'markSlip' | 'markSlipFirm' | 'markTajweed' | 'markTajweedFirm'>;

/**
 * Whether the colours follow the two tiers (lib/reciteLive/contract's `markTier`) instead of what a mark is about.
 * Off: Majd hasn't decided colours (Nov 22 2026; his tiers decision says nothing about them). On, every mistake is red
 * (a wrong haraka or letter joins the words), amber is only "Not clear", and violet is tajweed (Beta). The one switch:
 * `colourGroup`, `markFill`, `markFirm` and the bar's `toneFill` read it; turning it on changes RECITE-2's colours too.
 */
export const COLOURS_FOLLOW_TIERS = false;

/** Which of the three colours a mark takes. The memory group (`markGroup`) never changes with it. */
export function colourGroup(mark: Pick<Mark, 'kind' | 'sure'>, byTier: boolean = COLOURS_FOLLOW_TIERS): MarkGroup {
  if (!byTier) return markGroup(mark);
  const tier = markTier(mark);
  return tier === 'mistake' ? 'word' : tier === 'unclear' ? 'slip' : 'tajweed';
}

/** The mark's highlight: red for words, amber for a haraka or letter and "Not clear", violet for tajweed. */
export function markFill(p: Colours, mark: Pick<Mark, 'kind' | 'sure'>, byTier: boolean = COLOURS_FOLLOW_TIERS): string {
  const group = colourGroup(mark, byTier);
  return group === 'word' ? p.markWord : group === 'slip' ? p.markSlip : p.markTajweed;
}

/** Its firmer shade: the mark a card is open for. */
export function markFirm(p: Colours, mark: Pick<Mark, 'kind' | 'sure'>, byTier: boolean = COLOURS_FOLLOW_TIERS): string {
  const group = colourGroup(mark, byTier);
  return group === 'word' ? p.markWordFirm : group === 'slip' ? p.markSlipFirm : p.markTajweedFirm;
}

/**
 * A word's highlight in the recite bar (lib/reciteLive/view's tones): a wrong word red, a wrong haraka or letter amber
 * (red once the colours follow the tiers: the bar never shows a Not clear), a tajweed note violet, else none.
 */
export function toneFill(p: Colours, tone: string, byTier: boolean = COLOURS_FOLLOW_TIERS): string | undefined {
  if (tone === 'wrong') return p.markWord;
  if (tone === 'slip') return byTier ? p.markWord : p.markSlip;
  if (tone === 'tajweed') return p.markTajweed;
  return undefined;
}
