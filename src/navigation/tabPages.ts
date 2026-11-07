/**
 * How many tabs, from the first, are in the pager: Home and Read, and Insights
 * only while Smart Tracking is on. Off, Read is the last page (navigation/PagerTabs
 * lays out nothing past it).
 */
export function swipeableTabCount(smartTrackingEnabled: boolean): number {
  return smartTrackingEnabled ? 3 : 2;
}

/**
 * The Insights tab, from the account: shown while Smart Tracking is on, or
 * until its preview has been seen (with a glow; a tap opens the preview then,
 * and so does a swipe past Read, since it isn't a page of the pager yet).
 */
export function insightsTab(smartTrackingEnabled: boolean, hasSeenPreview: boolean): {
  shown: boolean;
  opensPreview: boolean;
} {
  return {
    shown: smartTrackingEnabled || !hasSeenPreview,
    opensPreview: !smartTrackingEnabled && !hasSeenPreview,
  };
}
