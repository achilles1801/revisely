import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from '../v2/Tap';
import { HELP, type HelpScreen } from '../../lib/help/topics';
import { HelpSheet } from './HelpSheet';
import { useHelpButtons } from './useHelpButtons';
import { t } from '../../i18n';

export const HELP_ICON = 'help-circle-outline' as const;

/**
 * A screen's help sheet, for a screen that places its own way in (a menu row, a round button):
 * `shown` while the help buttons show, `open()`, and the sheet to render.
 */
export function useHelpSheet(
  screen: HelpScreen,
  opts: { liveRecite?: boolean; hideAs?: HelpScreen } = {},
) {
  const help = useHelpButtons();
  const [open, setOpen] = useState(false);
  const sheet =
    help.shown || open ? (
      <HelpSheet
        screen={screen}
        visible={open}
        liveRecite={opts.liveRecite}
        onClose={() => setOpen(false)}
        // Said by the screen it's on (its HelpToast): the reader's, for Recite's sheet.
        onHide={() => help.hideFrom(opts.hideAs ?? screen)}
      />
    ) : null;
  return { shown: help.shown, open: () => setOpen(true), sheet, label: t('help.button', { title: HELP[screen].title }) };
}

/**
 * A screen's ? (HELP-1): opens its help sheet. Shown to every account until its user hides the buttons
 * (HELP-2). It sits where the screen has room: Home's Today post header, a top bar before its
 * action. Pair it with <HelpToast screen=…> at the screen's root, which says so when it's hidden.
 * `render` draws it another way (the reader's round button); `placeholder` holds its room when it's
 * hidden (a centred title stays centred).
 */
export function HelpButton({
  screen,
  size = 22,
  color,
  maxFontSizeMultiplier,
  render,
  placeholder = null,
  liveRecite,
  hideAs,
}: {
  screen: HelpScreen;
  /** The reader's Recite is offered (Revisely Dev): its topics show. */
  liveRecite?: boolean;
  /** Hidden from this screen's help, "Help buttons hidden" shows on this one (the screen it's on). */
  hideAs?: HelpScreen;
  size?: number;
  /** The glyph's colour (a top bar's ink by default; Home's post header uses grey). */
  color?: string;
  /** Grows with the header it sits in (e.g. the Today post's 1.4). */
  maxFontSizeMultiplier?: number;
  render?: (open: () => void, label: string) => React.ReactNode;
  placeholder?: React.ReactNode;
}) {
  const { palette } = useTheme();
  const help = useHelpSheet(screen, { liveRecite, hideAs });
  return (
    <>
      {!help.shown ? (
        placeholder
      ) : render ? (
        render(help.open, help.label)
      ) : (
        <Tap onPress={help.open} hitSlop={12} accessibilityRole="button" accessibilityLabel={help.label} testID={`help-button-${screen}`}>
          <Ionicons name={HELP_ICON} size={size} color={color ?? palette.text} maxFontSizeMultiplier={maxFontSizeMultiplier} />
        </Tap>
      )}
      {help.sheet}
    </>
  );
}
