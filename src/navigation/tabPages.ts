/**
 * How many tabs, from the first, are in the pager: Home and Read, and Insights
 * only while Smart Tracking is on. Off, Read is the last page (navigation/PagerTabs
 * lays out nothing past it).
 */
export function swipeableTabCount(smartTrackingEnabled: boolean): number {
  return smartTrackingEnabled ? 3 : 2;
}
