import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from '../v2/Tap';
import { HELP, type HelpScreen } from '../../lib/help/topics';
import { HelpSheet } from './HelpSheet';
import { useHelpButtons } from './useHelpButtons';

export const HELP_ICON = 'help-circle-outline' as const;

/**
 * A screen's ? (HELP-1): opens its help sheet. Shown to testers until they hide the buttons
 * (HELP-2). It sits where the screen has room: Home's Today post header, a top bar before its
 * action. Pair it with <HelpToast screen=…> at the screen's root, which says so when it's hidden.
 */
export function HelpButton({
  screen,
  size = 22,
  color,
  maxFontSizeMultiplier,
}: {
  screen: HelpScreen;
  size?: number;
  /** The glyph's colour (a top bar's ink by default; Home's post header uses grey). */
  color?: string;
  /** Grows with the header it sits in (e.g. the Today post's 1.4). */
  maxFontSizeMultiplier?: number;
}) {
  const { palette } = useTheme();
  const help = useHelpButtons();
  const [open, setOpen] = useState(false);
  if (!help.shown && !open) return null;
  return (
    <>
      {help.shown ? (
        <Tap
          onPress={() => setOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Help: ${HELP[screen].title}`}
          testID={`help-button-${screen}`}
        >
          <Ionicons name={HELP_ICON} size={size} color={color ?? palette.text} maxFontSizeMultiplier={maxFontSizeMultiplier} />
        </Tap>
      ) : null}
      <HelpSheet screen={screen} visible={open} onClose={() => setOpen(false)} onHide={() => help.hideFrom(screen)} />
    </>
  );
}
