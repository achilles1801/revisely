// The tabs, from the account. Accounts on the new Activity (lib/activityBlocks' activityBlocksEnabled:
// every account since the November 2026 release, testers before) have Insights in Activity
// (Calendar | Insights), so their tab bar is Home and Read, with or without Smart Tracking: the
// Insights tab isn't a route at all (ACT-12; Majd, Nov 6 2026). The Insights tab is what an account
// without them had, and would have again if the blocks were gated.

// Revisely Dev's Activity tab (TAB-2, lib/activityTab): with its switch on, Activity is a tab of its own between Home
// and Read, and Home's top bar loses its pulse button.

/**
 * How many tabs, from the first, are in the pager: Home and Read (with Activity between them while it is a tab), and
 * Insights only while it is a tab and Smart Tracking is on. Off, Read is the last page (navigation/PagerTabs lays out
 * nothing past it).
 */
export function swipeableTabCount(smartTrackingEnabled: boolean, insightsInActivity = false, activityTab = false): number {
  return (smartTrackingEnabled && !insightsInActivity ? 3 : 2) + (activityTab ? 1 : 0);
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

/**
 * The tab routes, in order: Activity between Home and Read while it is a tab (Revisely Dev's switch, TAB-2), and
 * Insights only for an account whose Insights aren't in Activity.
 */
export function mainTabRoutes(insightsInActivity: boolean, activityTab = false): MainTabRoute[] {
  // i18n-ignore-start (route names)
  return [
    'Home',
    ...(activityTab ? (['ActivityTab'] as const) : []),
    'Read',
    ...(insightsInActivity ? [] : (['Insights'] as const)),
  ];
  // i18n-ignore-end
}

