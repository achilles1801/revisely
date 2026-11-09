// Chrome text (CLAUDE.md, UI traps): Insights' titles, figures, labels and its sheets' rows stop growing
// at 1.4×, as headers and menu rows do; their layout gives way (wraps, shrinks numbers to fit) rather
// than clip. Nothing in Insights is reading text.

import React from 'react';
import { Text, type TextProps } from 'react-native';

export const CHROME_MAX_SCALE = 1.4;

/** From this text size Insights' side-by-side figures stack (Pace's tiles, a figure's right-hand words). */
export const STACK_AT_SCALE = 1.2;

export function ChromeText(props: TextProps) {
  return <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} {...props} />;
}
