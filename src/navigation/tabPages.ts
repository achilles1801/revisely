// The tabs, from the account. Accounts on the new Activity (components/activity/DayBlocks'
// activityBlocksEnabled: preview testers while it is built) have Insights in Activity
// (Calendar | Insights), so their tab bar is Home and Read, with or without Smart Tracking: the
// Insights tab isn't a route at all (ACT-12; Majd, Nov 6 2026). Everyone else keeps the Insights
// tab as before.

/**
 * How many tabs, from the first, are in the pager: Home and Read, and Insights
 * only while it is a tab and Smart Tracking is on. Off, Read is the last page
 * (navigation/PagerTabs lays out nothing past it).
 */
export function swipeableTabCount(smartTrackingEnabled: boolean, insightsInActivity = false): number {
  return smartTrackingEnabled && !insightsInActivity ? 3 : 2;
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

/** The tab routes, in order: Insights only for an account whose Insights aren't in Activity. */
export function mainTabRoutes(insightsInActivity: boolean): ('Home' | 'Read' | 'Insights')[] {
  return insightsInActivity ? ['Home', 'Read'] : ['Home', 'Read', 'Insights'];
}

