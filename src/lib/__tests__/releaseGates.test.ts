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
import { showsResetMyData } from '../testerReset';
import { showsTestScenarios } from '../testScenarios';
import { quranSearchEnabled, voiceSearchEnabled } from '../search/availability';

// A phone whose binary can listen (iPhone, 1.0.3 on): who may is what's tested.
jest.mock('../recite/micSource', () => ({ isMicStreamAvailable: () => true }));

const APP_STORE = [{}, { previewTester: false }] as const;
const TESTER = { previewTester: true };

describe('the journal’s new look: one switch (ACT-33, ACT-34)', () => {
  const { journalDesignEnabled, JOURNAL_DESIGN_RELEASED, setJournalDesignReleasedForTests } =
    require('../release/journalDesign') as typeof import('../release/journalDesign');
  afterEach(() => setJournalDesignReleasedForTests(undefined));

  it('[ACT-33] [ACT-34] is Revisely Dev’s until released, then everyone’s', () => {
    expect(JOURNAL_DESIGN_RELEASED).toBe(false);
    expect(journalDesignEnabled()).toBe(false);
    setJournalDesignReleasedForTests(true);
    expect(journalDesignEnabled()).toBe(true);
  });
});

describe('the Account page’s new look: one switch (ACCOUNT-4 to ACCOUNT-7)', () => {
  const { accountDesignEnabled, ACCOUNT_DESIGN_RELEASED, setAccountDesignReleasedForTests } =
    require('../release/accountDesign') as typeof import('../release/accountDesign');
  afterEach(() => setAccountDesignReleasedForTests(undefined));

  it('[ACCOUNT-4] is Revisely Dev’s until released, then everyone’s', () => {
    expect(ACCOUNT_DESIGN_RELEASED).toBe(false);
    expect(accountDesignEnabled()).toBe(false);
    setAccountDesignReleasedForTests(true);
    expect(accountDesignEnabled()).toBe(true);
  });
});

describe('Help improve mistake detection (RECITE-26): the store app’s through one switch of its own', () => {
  const variant = require('../variant') as typeof import('../variant');
  const { TRAINING_TAKES_RELEASED, TRAINING_STORE_DEFAULT, setTrainingTakesReleasedForTests, trainingTakesOffered } =
    require('../release/trainingTakes') as typeof import('../release/trainingTakes');
  const { keepsTakes, trainingSwitchOn, RECITE_CHECK_DEFAULTS } =
    require('../reciteCheck/settings') as typeof import('../reciteCheck/settings');
  afterEach(() => {
    setTrainingTakesReleasedForTests(undefined);
    jest.restoreAllMocks();
  });

  it('[RECITE-26] off: Revisely Dev offers it and keeps takes (on by default); the store app neither shows nor asks', () => {
    setTrainingTakesReleasedForTests(false);
    jest.spyOn(variant, 'isDevVariant').mockReturnValue(true);
    expect(trainingTakesOffered()).toBe(true);
    expect(keepsTakes(RECITE_CHECK_DEFAULTS)).toBe(true);
    jest.spyOn(variant, 'isDevVariant').mockReturnValue(false);
    expect(trainingTakesOffered()).toBe(false);
    expect(keepsTakes({ keep: true, keepSet: true })).toBe(false);
  });

  it('[RECITE-26] on: the store app offers it; a value the phone saved without the user choosing reads as the store default', () => {
    setTrainingTakesReleasedForTests(true);
    jest.spyOn(variant, 'isDevVariant').mockReturnValue(false);
    expect(trainingTakesOffered()).toBe(true);
    expect(trainingSwitchOn({ keep: false, keepSet: false })).toBe(TRAINING_STORE_DEFAULT);
    expect(trainingSwitchOn({ keep: true, keepSet: false })).toBe(TRAINING_STORE_DEFAULT);
    expect(keepsTakes({ keep: true, keepSet: true })).toBe(true);
    expect(keepsTakes({ keep: false, keepSet: true })).toBe(false);
  });

  it('ships off until Majd opens it; once open, the store app’s switch starts on (Majd, Nov 26 2026: "start on")', () => {
    expect(TRAINING_TAKES_RELEASED).toBe(false);
    expect(TRAINING_STORE_DEFAULT).toBe(true);
  });
});

describe('Home, version 3: one switch (HOME-4, HOME-5)', () => {
  const { homeV3Enabled, HOME_V3_RELEASED, setHomeV3ForTests } =
    require('../release/homeV3') as typeof import('../release/homeV3');
  afterEach(() => setHomeV3ForTests(undefined));

  it('[HOME-4] [HOME-5] is Revisely Dev’s until released, then everyone’s', () => {
    expect(HOME_V3_RELEASED).toBe(false);
    expect(homeV3Enabled()).toBe(false);
    setHomeV3ForTests(true);
    expect(homeV3Enabled()).toBe(true);
  });
});

describe('everyone’s from the November 2026 release', () => {
  it.each(APP_STORE)('[ACT-2] [ACT-3] the Activity blocks, for %o', (user) => {
    expect(activityBlocksEnabled(user)).toBe(true);
  });

  it.each(APP_STORE)('[ACT-12] [TAB-2] Insights in Activity: the tab bar is Home, Activity and Read, for %o', (user) => {
    const inActivity = activityBlocksEnabled(user);
    expect(mainTabRoutes(inActivity)).toEqual(['Home', 'ActivityTab', 'Read']);
    expect(insightsTab(true, true, inActivity).shown).toBe(false);
    expect(swipeableTabCount(true, inActivity)).toBe(3);
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

  // Opened on Nov 9 2026, after the release (Majd: "quran search should be open to everyone").
  it.each(APP_STORE)('[SEARCH-1] [SEARCH-2] searching the Qur’an by typing, from the Read tab, for %o', (user) => {
    expect(quranSearchEnabled(user)).toBe(true);
  });

  // On an iPhone binary with the microphone module (mocked here); Android types only (Majd, Nov 9 2026).
  it.each(APP_STORE)('[SEARCH-1] searching the Qur’an by voice, on an iPhone that can listen, for %o', (user) => {
    expect(voiceSearchEnabled(user)).toBe(true);
  });

  it('[SEARCH-1] Android searches by typing only', () => {
    const { Platform } = require('react-native');
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(voiceSearchEnabled(TESTER)).toBe(false);
    expect(quranSearchEnabled(TESTER)).toBe(true);
    jest.restoreAllMocks();
  });

  it('nobody signed in has any of them', () => {
    for (const gate of [activityBlocksEnabled, sittingsEnabled, everyTranslationOffered, helpAvailable, quranSearchEnabled, voiceSearchEnabled]) {
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

  it.each(APP_STORE)('[RESET-2] [RESET-3] Reset my data and Load test scenario, for %o', (user) => {
    expect(showsResetMyData(user)).toBe(false);
    expect(showsTestScenarios(user)).toBe(false);
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

describe('the mistake detection release (1.0.5): everyone’s, through one switch', () => {
  // Outside Revisely Dev, as the store app is.
  const { reciteLiveForAccount } = require('../reciteLive/availability') as typeof import('../reciteLive/availability');
  const { gapsInsightsEnabled } = require('../insightsGaps') as typeof import('../insightsGaps');
  const { MISTAKE_DETECTION_RELEASED, setMistakeDetectionReleasedForTests } = require('../release/mistakeDetection') as typeof import('../release/mistakeDetection');
  afterEach(() => setMistakeDetectionReleasedForTests(undefined));

  it('off: Recite, Recite’s memory and Insights’ Recitation, Gaps and Last revised stay Revisely Dev’s', () => {
    setMistakeDetectionReleasedForTests(false);
    for (const user of [...APP_STORE, TESTER]) {
      expect(reciteLiveForAccount(user)).toBe(false);
      expect(gapsInsightsEnabled(user)).toBe(false);
    }
  });

  it.each(APP_STORE)('on: every account has them, for %o', (user) => {
    setMistakeDetectionReleasedForTests(true);
    expect(reciteLiveForAccount(user)).toBe(true);
    expect(gapsInsightsEnabled(user)).toBe(true);
    expect(reciteLiveForAccount(null)).toBe(false);
  });

  it('on: Recite still needs a phone that streams the microphone', () => {
    setMistakeDetectionReleasedForTests(true);
    const mic = require('../recite/micSource') as { isMicStreamAvailable: () => boolean };
    const spy = jest.spyOn(mic, 'isMicStreamAvailable').mockReturnValue(false);
    expect(reciteLiveForAccount({})).toBe(false);
    spy.mockRestore();
  });

  it.each(APP_STORE)('on: every card of its What’s new is open, for %o (none drops out at the release)', (user) => {
    setMistakeDetectionReleasedForTests(true);
    const { CURRENT_RELEASE: current, NEXT_RELEASE } = require('../help/whatsNew') as typeof import('../help/whatsNew');
    expect(current.id).toBe('1.0.5');
    expect(current.live).toBe(true);
    // The next release (the tour, 1.0.6) stays dark until its release PR.
    expect(NEXT_RELEASE?.live ?? false).toBe(false);
    expect(needsOf(current).filter((n) => !needOpen(n, user, 'everyone'))).toEqual([]);
  });

  it('the release PR ships it on: store users get it with this release’s Promote', () => {
    expect(MISTAKE_DETECTION_RELEASED).toBe(true);
  });

  it.each(APP_STORE)('[ACT-29] Activity’s sections (show, hide, drag) are every account’s, for %o', (user) => {
    const { activitySectionsEnabled } = require('../activitySections') as typeof import('../activitySections');
    expect(activitySectionsEnabled(user)).toBe(true);
    expect(activitySectionsEnabled(null)).toBe(false);
  });
});


describe('reminders while away (REMIND-2): everyone’s through one switch of its own', () => {
  // The days after tomorrow get one reminder each (lib/reminders/plan LATER_DAYS). It can reach App Store users on
  // its own, before or with any release: REMINDERS_WHILE_AWAY_RELEASED = true is the whole change (plus Revo's guide).
  const variant = require('../variant') as typeof import('../variant');
  const { remindersWhileAwayEnabled, REMINDERS_WHILE_AWAY_RELEASED, setRemindersWhileAwayReleasedForTests } =
    require('../release/remindersWhileAway') as typeof import('../release/remindersWhileAway');
  afterEach(() => {
    setRemindersWhileAwayReleasedForTests(undefined);
    jest.restoreAllMocks();
  });

  it('[REMIND-2] off: Revisely Dev has them, the store app doesn’t', () => {
    setRemindersWhileAwayReleasedForTests(false);
    jest.spyOn(variant, 'isDevVariant').mockReturnValue(false);
    expect(remindersWhileAwayEnabled()).toBe(false);
    jest.spyOn(variant, 'isDevVariant').mockReturnValue(true);
    expect(remindersWhileAwayEnabled()).toBe(true);
  });

  it('[REMIND-2] on: the store app has them too', () => {
    setRemindersWhileAwayReleasedForTests(true);
    jest.spyOn(variant, 'isDevVariant').mockReturnValue(false);
    expect(remindersWhileAwayEnabled()).toBe(true);
  });

  it('ships off until Majd opens it: Revisely Dev’s for now (Nov 21 2026)', () => {
    expect(REMINDERS_WHILE_AWAY_RELEASED).toBe(false);
  });
});

describe('Settings → About → Licences (SET-5): everyone’s with on-device Recite, through one switch', () => {
  // The recitation model's licence in full. The store app needs it once the model runs on phones (a copy of the
  // model is then a distribution); until then the model runs on our server and nothing is distributed.
  const variant = require('../variant') as typeof import('../variant');
  const { showsModelLicense, MODEL_LICENSE_RELEASED, setModelLicenseReleasedForTests } =
    require('../release/modelLicense') as typeof import('../release/modelLicense');
  afterEach(() => {
    setModelLicenseReleasedForTests(undefined);
    jest.restoreAllMocks();
  });

  it('[SET-5] off: Revisely Dev shows it, the store app doesn’t', () => {
    setModelLicenseReleasedForTests(false);
    jest.spyOn(variant, 'isDevVariant').mockReturnValue(false);
    expect(showsModelLicense()).toBe(false);
    jest.spyOn(variant, 'isDevVariant').mockReturnValue(true);
    expect(showsModelLicense()).toBe(true);
  });

  it('[SET-5] on: the store app shows it too', () => {
    setModelLicenseReleasedForTests(true);
    jest.spyOn(variant, 'isDevVariant').mockReturnValue(false);
    expect(showsModelLicense()).toBe(true);
  });

  it('ships off until on-device Recite is released (Nov 23 2026)', () => {
    expect(MODEL_LICENSE_RELEASED).toBe(false);
  });
});
