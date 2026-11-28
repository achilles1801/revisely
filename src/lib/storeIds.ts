// The store app's own listings: its App Store id and its Google Play package. Revisely Dev links to these too, since
// it has no public store page of its own (its builds go to TestFlight and Play's internal testing only).

import storeIds from './storeIds.json';

/** App Store Connect's Apple ID for Revisely. */
export const APP_STORE_ID = '6767990248';

/**
 * Revisely's package on Google Play: its own, apart from the iOS bundle id, since the Play app moved to Revisely LLC's
 * organization account (handbook/android.md). The one value app.config.js builds the store app with.
 */
export const PLAY_PACKAGE: string = storeIds.playPackage;
