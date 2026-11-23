// The tabs, from the account (navigation/tabPages): Activity is a tab between Home and Read (TAB-2), and accounts on the
// new Activity have Insights there, so their tab bar is Home, Activity and Read whatever else is set; everyone else keeps
// the Insights tab after Read.

import fc from 'fast-check';
import { insightsTab, mainTabRoutes, swipeableTabCount } from '../../../src/navigation/tabPages';
import { runs } from './fixtures';

describe('the tabs, from the account', () => {
  it('[ACT-12] [TAB-2] Insights in Activity: the tabs are Home, Activity and Read, never an Insights tab, Smart Tracking or not', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (smartTracking, seenPreview) => {
        expect(mainTabRoutes(true)).toEqual(['Home', 'ActivityTab', 'Read']);
        expect(swipeableTabCount(smartTracking, true)).toBe(3);
        expect(insightsTab(smartTracking, seenPreview, true)).toEqual({ shown: false, opensPreview: false });
      }),
      { numRuns: runs(20) },
    );
  });

  it('[ACT-12] other accounts keep the Insights tab: a page with Smart Tracking on, its preview before', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (smartTracking, seenPreview) => {
        expect(mainTabRoutes(false)).toEqual(['Home', 'ActivityTab', 'Read', 'Insights']);
        expect(swipeableTabCount(smartTracking, false)).toBe(smartTracking ? 4 : 3);
        const tab = insightsTab(smartTracking, seenPreview, false);
        expect(tab.shown).toBe(smartTracking || !seenPreview);
        expect(tab.opensPreview).toBe(!smartTracking && !seenPreview);
      }),
      { numRuns: runs(20) },
    );
  });
});
