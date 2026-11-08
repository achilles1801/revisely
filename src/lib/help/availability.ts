// Who gets the help buttons (HELP-1, HELP-4): previewTester accounts until the release that brings them,
// then every account. The release PR sets HELP_FOR_EVERYONE (it switches on the release's "What's new",
// whose "Help on screens" row needs it: a live release that needs a testers-only feature fails its test).
// Whoever has help sees the ? by default; only the user hides them (lib/help/state, HELP-2).

import type { User } from '../../types';

/** The release's switch: true from the production release that brings the help buttons. */
export const HELP_FOR_EVERYONE = false;

export function helpAvailable(user: Pick<User, 'previewTester'> | null | undefined, forEveryone = HELP_FOR_EVERYONE): boolean {
  if (!user) return false;
  return forEveryone || user.previewTester === true;
}
