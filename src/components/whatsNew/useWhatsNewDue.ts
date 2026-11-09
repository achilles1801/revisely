// RootNavigator's question: does "What's new" open before Home, and how (lib/whatsNew/due)?

import { useApp } from '../../context/AppContext';
import { CURRENT_RELEASE, hasSeen } from '../../lib/help/whatsNew';
import { walkthroughDue, whatsNewLiveForTests, type WalkthroughMode } from '../../lib/whatsNew/due';
import { useWhatsNewOff } from '../../lib/whatsNew/killSwitch';
import { useForcedAtLaunch, useWhatsNewSaved } from '../../lib/whatsNew/state';

export function useWhatsNewDue(): WalkthroughMode | 'wait' | null {
  const { user, onboardingComplete } = useApp();
  const uid = user?.id;
  const tester = user?.previewTester === true;
  const live = whatsNewLiveForTests() ?? CURRENT_RELEASE.live;
  const unseen = live && !!user && !hasSeen(user.whatsNewSeen);
  // Nothing is read for an account it can't show to: the switch only while it would show, the
  // phone's copy only for testers (the run at launch) and accounts it would show to.
  const off = useWhatsNewOff(unseen);
  const saved = useWhatsNewSaved(unseen || tester ? uid : null);
  const forced = useForcedAtLaunch(tester ? uid : null);
  return walkthroughDue({
    onboarded: !!user && onboardingComplete,
    mark: user?.whatsNewSeen,
    off,
    savedLoaded: saved !== undefined,
    tester,
    forced,
    live,
  });
}
