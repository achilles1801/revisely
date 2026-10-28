// Who sees tester-only settings (a comparison the user is still choosing from,
// e.g. Settings → Home screen → Progress style): development builds, and a
// TestFlight install signed in to a `previewTester` account, the same two
// conditions that put an install on the preview channel (lib/updateChannel).
// Never the App Store, and never App Review (its account isn't a tester).

import { installedFromTestFlight } from './updateChannel';

export function isTester(
  user: { previewTester?: boolean } | null | undefined,
  env: { dev?: boolean; testFlight?: () => boolean } = {},
): boolean {
  const dev = env.dev ?? __DEV__;
  if (dev) return true;
  return user?.previewTester === true && (env.testFlight ?? installedFromTestFlight)();
}
