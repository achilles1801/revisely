import { Platform, ViewStyle } from 'react-native';

/**
 * Cross-platform elevation tokens. Use these instead of writing shadow
 * properties inline — keeps cards consistent and avoids accidentally mixing
 * iOS shadows with Android elevation incorrectly.
 *
 *   sm  hairline lift (resting cards on light surfaces)
 *   md  elevated cards (default for Card with variant="elevated")
 *   lg  modals + bottom sheets
 */
function shadow(
  iosOffset: { width: number; height: number },
  iosRadius: number,
  iosOpacity: number,
  androidElevation: number,
): ViewStyle {
  return Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: iosOffset,
      shadowRadius: iosRadius,
      shadowOpacity: iosOpacity,
    },
    android: { elevation: androidElevation },
    default: {},
  }) as ViewStyle;
}

export const shadows = {
  sm: shadow({ width: 0, height: 1 }, 2, 0.05, 1),
  md: shadow({ width: 0, height: 4 }, 12, 0.06, 3),
  lg: shadow({ width: 0, height: 10 }, 28, 0.12, 8),
} as const;

export type Shadows = typeof shadows;
