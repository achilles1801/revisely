// The November 2026 release opens its features to every account (Majd, Nov 8 2026). Accounts that
// aren't testers follow the `production` channel, so nobody can try this on a phone before the update
// is promoted: these gates are what decides it. An App Store account here is one with `previewTester`
// unset (most) or false.

import { activityBlocksEnabled } from '../activityBlocks';
import { sittingsEnabled } from '../sitting';
import { everyTranslationOffered } from '../translationsOffered';
import { ALL_TRANSLATIONS, offeredTranslations, QURANENC_TRANSLATIONS } from '../translation';
import { helpAvailable, HELP_FOR_EVERYONE } from '../help/availability';
import { CURRENT_RELEASE, needsOf } from '../help/whatsNew';
import { replayOffered, walkthroughDue } from '../whatsNew/due';
import { insightsTab, mainTabRoutes, swipeableTabCount } from '../../navigation/tabPages';
import { needOpen } from '../../components/whatsNew/needs';
import { revoAvailable } from '../revo/availability';
import { reciteModeEnabled } from '../recite/availability';
import { showsResetMyData } from '../testerReset';
import { showsTestScenarios } from '../testScenarios';

const APP_STORE = [{}, { previewTester: false }] as const;
const TESTER = { previewTester: true };

describe('everyone’s from the November 2026 release', () => {
  it.each(APP_STORE)('[ACT-2] [ACT-3] the Activity blocks, for %o', (user) => {
    expect(activityBlocksEnabled(user)).toBe(true);
  });

  it.each(APP_STORE)('[ACT-12] Insights in Activity: the tab bar is Home and Read, for %o', (user) => {
    const inActivity = activityBlocksEnabled(user);
    expect(mainTabRoutes(inActivity)).toEqual(['Home', 'Read']);
    expect(insightsTab(true, true, inActivity).shown).toBe(false);
    expect(swipeableTabCount(true, inActivity)).toBe(2);
  });

  it.each(APP_STORE)('[REC-1] [REC-2] [MEM-6] the reader’s sittings and the plan’s “Not in your plan”, for %o', (user) => {
    expect(sittingsEnabled(user)).toBe(true);
  });

  it.each(APP_STORE)('[TRANS-5] every QuranEnc translation in the picker, for %o', (user) => {
    expect(everyTranslationOffered(user)).toBe(true);
    const offered = offeredTranslations(everyTranslationOffered(user));
    expect(offered).toBe(ALL_TRANSLATIONS);
    expect(QURANENC_TRANSLATIONS.length).toBeGreaterThan(70);
  });

  it.each(APP_STORE)('[HELP-1] [HELP-4] the help buttons, for %o', (user) => {
    expect(HELP_FOR_EVERYONE).toBe(true);
    expect(helpAvailable(user)).toBe(true);
  });

  it.each(APP_STORE)('[NEW-1] [NEW-3] What’s new: switched on, shown once to an account from before, its replay offered, for %o', (user) => {
    expect(CURRENT_RELEASE.live).toBe(true);
    const due = (mark: string | undefined) =>
      walkthroughDue({ onboarded: true, mark, off: false, savedLoaded: true, tester: false, forced: false });
    expect(due(undefined)).toBe('required');
    expect(due(CURRENT_RELEASE.id)).toBeNull();
    expect(replayOffered(user)).toBe(true);
  });

  it.each(APP_STORE)('[NEW-1] every card’s feature is open, Revo’s with its own switch, for %o', (user) => {
    for (const need of needsOf(CURRENT_RELEASE)) {
      if (need === 'revo') {
        expect(needOpen(need, user, 'everyone')).toBe(true);
        expect(needOpen(need, user, 'testers')).toBe(false);
      } else {
        expect([need, needOpen(need, user, 'testers')]).toEqual([need, true]);
      }
    }
  });

  it('nobody signed in has any of them', () => {
    for (const gate of [activityBlocksEnabled, sittingsEnabled, everyTranslationOffered, helpAvailable]) {
      expect(gate(null)).toBe(false);
      expect(gate(undefined)).toBe(false);
    }
    expect(replayOffered(null)).toBe(false);
  });
});

describe('still for testers', () => {
  it.each(APP_STORE)('[REVO-1] Revo follows its release switch, not this release, for %o', (user) => {
    expect(revoAvailable(user, 'testers')).toBe(false);
    expect(revoAvailable(user, 'everyone')).toBe(true);
    expect(revoAvailable(TESTER, 'testers')).toBe(true);
  });

  it.each(APP_STORE)('[RESET-2] [RESET-3] hidden recite mode, Reset my data and Load test scenario, for %o', (user) => {
    expect(reciteModeEnabled(user)).toBe(false);
    expect(showsResetMyData(user)).toBe(false);
    expect(showsTestScenarios(user)).toBe(false);
    expect(reciteModeEnabled(TESTER)).toBe(true);
    expect(showsResetMyData(TESTER)).toBe(true);
    expect(showsTestScenarios(TESTER)).toBe(true);
  });

  it('a What’s new run at launch by hand (Settings → Testing) is a tester’s only', () => {
    const due = (tester: boolean) =>
      walkthroughDue({ onboarded: true, mark: CURRENT_RELEASE.id, off: false, savedLoaded: true, tester, forced: true });
    expect(due(false)).toBeNull();
    expect(due(true)).toBe('forced');
  });
});
