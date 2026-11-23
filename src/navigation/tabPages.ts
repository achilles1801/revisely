// The tabs, from the account. Accounts on the new Activity (lib/activityBlocks' activityBlocksEnabled:
// every account since the November 2026 release, testers before) have Insights in Activity
// (Calendar | Insights), so their tab bar is Home, Activity and Read, with or without Smart Tracking: the
// Insights tab isn't a route at all (ACT-12; Majd, Nov 6 2026). The Insights tab is what an account
// without them had, and would have again if the blocks were gated.

// Activity is a tab of its own between Home and Read (TAB-2; Majd, Nov 23 2026), for every account.

/**
 * How many tabs, from the first, are in the pager: Home, Activity and Read, and Insights only while it is a tab and
 * Smart Tracking is on. Off, Read is the last page (navigation/PagerTabs lays out nothing past it).
 */
export function swipeableTabCount(smartTrackingEnabled: boolean, insightsInActivity = false): number {
  return smartTrackingEnabled && !insightsInActivity ? 4 : 3;
}

/**
 * The Insights tab, from the account: shown while Smart Tracking is on, or
 * until its preview has been seen (with a glow; a tap opens the preview then,
 * and so does a swipe past Read, since it isn't a page of the pager yet).
 * Never, for an account whose Insights are in Activity.
 */
export function insightsTab(
  smartTrackingEnabled: boolean,
  hasSeenPreview: boolean,
  insightsInActivity = false,
): {
  shown: boolean;
  opensPreview: boolean;
} {
  if (insightsInActivity) return { shown: false, opensPreview: false };
  return {
    shown: smartTrackingEnabled || !hasSeenPreview,
    opensPreview: !smartTrackingEnabled && !hasSeenPreview,
  };
}

export type MainTabRoute = 'Home' | 'ActivityTab' | 'Read' | 'Insights';

/** The tab routes, in order: Home, Activity, Read, and Insights only for an account whose Insights aren't in Activity. */
export function mainTabRoutes(insightsInActivity: boolean): MainTabRoute[] {
  // i18n-ignore-start (route names)
  return ['Home', 'ActivityTab', 'Read', ...(insightsInActivity ? [] : (['Insights'] as const))];
  // i18n-ignore-end
}

