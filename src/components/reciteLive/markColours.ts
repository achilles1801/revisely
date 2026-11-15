// A mark's colour, wherever it shows (the page, the bar, the card, the summary): three groups, each a highlight with a
// firmer shade for the mark a card is open for (theme/v2: markWord…; Majd, Nov 15 2026).

import type { PaletteV2 } from '../../theme/v2';
import type { Mark } from '../../lib/reciteLive/contract';
import { markGroup } from '../../lib/reciteLive/contract';

type Colours = Pick<PaletteV2, 'markWord' | 'markWordFirm' | 'markSlip' | 'markSlipFirm' | 'markTajweed' | 'markTajweedFirm'>;

/** The mark's highlight: red for words, amber for slips and "Not clear", violet for tajweed. */
export function markFill(p: Colours, mark: Pick<Mark, 'kind'>): string {
  const group = markGroup(mark);
  return group === 'word' ? p.markWord : group === 'slip' ? p.markSlip : p.markTajweed;
}

/** Its firmer shade: the mark a card is open for. */
export function markFirm(p: Colours, mark: Pick<Mark, 'kind'>): string {
  const group = markGroup(mark);
  return group === 'word' ? p.markWordFirm : group === 'slip' ? p.markSlipFirm : p.markTajweedFirm;
}
