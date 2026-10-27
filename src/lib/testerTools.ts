// Tools only testers see (e.g. Settings → "New design (preview)"): development
// builds, and accounts marked `previewTester` on a TestFlight install, which is
// what puts them on the preview channel (lib/updateChannel). Never the App
// Store (production) and never App Review: its account isn't a tester.

import InstallSource from '../../modules/install-source';
import type { ReleaseInfo } from './releaseInfo';

function installedFromTestFlight(): boolean {
  try {
    return InstallSource?.isTestFlight() === true;
  } catch {
    return false;
  }
}

export function testerToolsAllowed(
  release: Pick<ReleaseInfo, 'isDev' | 'channel'>,
  previewTester: boolean | undefined,
  fromTestFlight: () => boolean = installedFromTestFlight,
): boolean {
  if (release.isDev) return true;
  if (previewTester !== true) return false;
  // The preview channel; or TestFlight before the switch has taken effect (the
  // channel changes on the next cold start), which is the same condition.
  return release.channel === 'preview' || fromTestFlight();
}
