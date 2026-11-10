// An update ready to apply, for E2E builds (which never fetch updates): as if a preview update had
// just downloaded, so "A new update is ready" opens by itself as it would on a tester's phone. Flow
// 17 uses it to open the offer while the Today menu is up (Nov 9 2026: iOS refused it there, and
// Home took no more taps). "Update now" restarts into the same built-in JavaScript.
//
//   revisely://e2e/update-ready

import { notePendingUpdate } from '../updates/ota';

/** Handles revisely://e2e/update-ready; true if the URL was one. */
export function handleUpdateLink(url: string): boolean {
  if (!/^revisely:\/\/e2e\/update-ready\b/i.test(url)) return false;
  notePendingUpdate(`e2e-update-${Date.now()}`);
  // eslint-disable-next-line no-console
  console.log('[e2e] update ready');
  return true;
}
