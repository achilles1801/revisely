// Who gets the help buttons (HELP-1, HELP-4): every account since the November 2026 release (Majd, Nov 8
// 2026), previewTester accounts before. The release's "What's new" has a "Help on screens" row, which
// needs it: a live release that needs a testers-only feature fails its test (whatsNew.test.ts).
// Whoever has help sees the ? by default; only the user hides them (lib/help/state, HELP-2).

import type { User } from '../../types';

/** The release's switch: true since the November 2026 release brought the help buttons to everyone. */
export const HELP_FOR_EVERYONE = true;

export function helpAvailable(user: Pick<User, 'previewTester'> | null | undefined, forEveryone = HELP_FOR_EVERYONE): boolean {
  if (!user) return false;
  return forEveryone || user.previewTester === true;
}
