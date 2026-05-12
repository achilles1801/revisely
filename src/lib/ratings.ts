/**
 * Canonical labels for the 1–5 self-rating a user gives a page after revising.
 * Used by both the rating modal and any read-only display so the wording the
 * user picks matches what they later see.
 */
export const RATINGS = [
  { value: 1, label: 'Very weak' },
  { value: 2, label: 'Weak' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'Strong' },
  { value: 5, label: 'Very strong' },
] as const;

export function getRatingLabel(rating: number): string {
  return RATINGS.find((r) => r.value === rating)?.label ?? 'Not rated';
}
