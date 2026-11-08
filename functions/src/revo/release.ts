/**
 * Who has Revo (REVO-37): Firestore config/app's `revo`, which the app reads too
 * (src/lib/revo/release.ts, the same values). Set it with
 * functions/scripts/set-app-config.js --revo <testers|everyone|off>; the functions see a change
 * within a minute, phones when they next read the config (at launch, and back in front after
 * REVO_RELEASE_EVERY_MS there).
 *   'testers' (or unset, or anything else): previewTester accounts only, as before the release.
 *   'everyone': every signed-in account. Set at the production release.
 *   'off': nobody, testers included. For an emergency (a leaked key, a runaway bill).
 * Turning Revo off and deleting its data stay open to every account whatever the release.
 */
export type RevoRelease = 'testers' | 'everyone' | 'off';

export const REVO_RELEASES: readonly RevoRelease[] = ['testers', 'everyone', 'off'];

/** The release a config value gives: 'everyone' and 'off' as written; anything else is 'testers'. */
export function revoReleaseOf(value: unknown): RevoRelease {
  return value === 'everyone' || value === 'off' ? value : 'testers';
}

/** Whether an account may use Revo under a release. */
export function revoAllowed(release: RevoRelease, tester: boolean): boolean {
  return release === 'everyone' || (release === 'testers' && tester);
}
