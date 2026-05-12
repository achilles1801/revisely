/**
 * Border-radius scale. Use these instead of magic numbers.
 *
 *   xs    chips, small badges
 *   sm    buttons, inputs, small toggles
 *   md    standard cards
 *   lg    large cards, sheet corners
 *   full  pills, avatars, progress bars, circular indicators
 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  full: 999,
} as const;

export type Radius = typeof radius;
