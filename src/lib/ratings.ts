import { t } from '../i18n';
/**
 * Canonical labels for the 1–5 self-rating a user gives a page after revising.
 * Used by both the rating modal and any read-only display so the wording the
 * user picks matches what they later see.
 */
export const RATINGS = [
  { value: 1, get label() { return t('lib.ratings.veryWeak'); } },
  { value: 2, get label() { return t('lib.ratings.weak'); } },
  { value: 3, get label() { return t('lib.ratings.moderate'); } },
  { value: 4, get label() { return t('lib.ratings.strong'); } },
  { value: 5, get label() { return t('lib.ratings.veryStrong'); } },
] as const;

export function getRatingLabel(rating: number): string {
  return RATINGS.find((r) => r.value === rating)?.label ?? t('lib.ratings.notRated');
}
