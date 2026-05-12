/**
 * 10-step spacing scale. Densified from the original 6 steps so layouts can
 * use 12 / 20 / 28 / 40 / 64 — values needed for tight component design.
 *
 * Numeric aliases (sp4..sp64) are also exported for places where naming-by-size
 * is clearer than naming-by-role.
 */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  base: 20,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
  huge: 64,
} as const;

export type Spacing = typeof spacing;
