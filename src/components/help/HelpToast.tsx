import React from 'react';
import { UndoToast } from '../revision/UndoToast';
import { clearHelpToast, useHelpToast } from '../../lib/help/state';
import type { HelpScreen } from '../../lib/help/topics';
import { useHelpButtons } from './useHelpButtons';
import { t } from '../../i18n';

/**
 * "Help buttons hidden", with Undo, on the screen they were hidden from (HELP-2). Put it at the
 * screen's root, beside its other toasts, with the same bottom inset.
 */
export function HelpToast({ screen, bottomInset = 0 }: { screen: HelpScreen; bottomInset?: number }) {
  const toast = useHelpToast(screen);
  const help = useHelpButtons();
  return (
    <UndoToast
      key={toast?.id}
      visible={!!toast}
      message={t('help.hidden')}
      onUndo={() => {
        clearHelpToast();
        help.setShown(true);
      }}
      onDismiss={clearHelpToast}
      duration={6000}
      bottomInset={bottomInset}
    />
  );
}
