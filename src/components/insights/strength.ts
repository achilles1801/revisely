// A page's 1–5 strength (lib/ratings) as the new design shows it: a status
// colour, weak red and strong green whatever the accent, moderate grey.

import type { PaletteV2 } from '../../theme/v2';

export type StrengthBucket = 'weak' | 'moderate' | 'strong';

/** A 1–5 rating's bucket: 1–2 weak, 3 moderate, 4–5 strong. */
export function strengthBucket(rating: number): StrengthBucket {
  if (rating <= 2) return 'weak';
  if (rating === 3) return 'moderate';
  return 'strong';
}

/** A rating as a status colour: `red` weak, `secondary` moderate, `good` strong. */
export function strengthTone(rating: number, palette: PaletteV2): string {
  const bucket = strengthBucket(rating);
  if (bucket === 'weak') return palette.red;
  if (bucket === 'moderate') return palette.secondary;
  return palette.good;
}

/** How many of `ratings` fall in each bucket. */
export function countStrengths(ratings: number[]): Record<StrengthBucket, number> {
  const counts: Record<StrengthBucket, number> = { weak: 0, moderate: 0, strong: 0 };
  for (const r of ratings) counts[strengthBucket(r)]++;
  return counts;
}
