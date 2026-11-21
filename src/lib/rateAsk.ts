// Asking for a rating (SESS-8; Revisely Dev until Majd releases it). Majd approved it on Nov 21 2026
// (~/Documents/revisely-ideas/approved/2026-11-14-growth-ask-for-ratings.md).
//
// After a good moment, the session's end card shows one quiet line, "Enjoying Revisely? Rate it ›": a swipe that
// finishes a day's revision with a streak of at least 7 days. It opens the store's own review page. Shown at most
// once every 120 days on a phone, never for an account under a week old, and the same way for everyone: no stars asked
// for, no reward, nothing that sends unhappy users somewhere else (both stores forbid those). Settings → Support →
// Rate Revisely opens the same page at any time.
//
// The stores' in-app prompt (SKStoreReviewController, Play In-App Review) needs a native module (expo-store-review),
// which no current binary has: it waits for the next native release. Until then the line opens the App Store's
// "Write a Review" page, or the Play listing on Android (Play has no review link outside its native API).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import { APP_STORE_ID, PLAY_PACKAGE } from './storeIds';
import { isDevVariant } from './variant';
import { logger } from './logger';

/** The streak (days in a row) that makes finishing a day a good moment to ask. */
export const MIN_STREAK = 7;
/** Never in an account's first week. */
export const MIN_ACCOUNT_DAYS = 7;
/** At most once in this many days on a phone (about four months). */
export const ASK_EVERY_DAYS = 120;

const DAY_MS = 24 * 60 * 60_000;
const KEY = '@revisely_rate_ask:v1';

/** Revisely Dev only, until the release that opens it to everyone. */
export function rateAskEnabled(): boolean {
  return isDevVariant();
}

/**
 * Whether finishing a day now is the moment to ask. `accountDays` is null when the account's age isn't known (the
 * streak alone then keeps the first week out). `daysSinceAsked` is null when this phone has never asked.
 */
export function shouldAskForRating(input: { streak: number; accountDays: number | null; daysSinceAsked: number | null }): boolean {
  if (input.streak < MIN_STREAK) return false;
  if (input.accountDays != null && input.accountDays < MIN_ACCOUNT_DAYS) return false;
  return input.daysSinceAsked == null || input.daysSinceAsked >= ASK_EVERY_DAYS;
}

/** Whole days from an ISO time to `now`, or null when it can't be read. */
export function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? Math.floor((now - at) / DAY_MS) : null;
}

/**
 * Asks if it's the moment: reads when this phone last asked, and when it asks, keeps now as the last time (a line shown
 * counts as asked, tapped or not). Never throws: storage that fails means no ask.
 */
export async function maybeAskForRating(input: { streak: number; accountCreatedAt?: string | null; now: number }): Promise<boolean> {
  if (!rateAskEnabled()) return false;
  try {
    const last = await AsyncStorage.getItem(KEY);
    const ask = shouldAskForRating({
      streak: input.streak,
      accountDays: daysSince(input.accountCreatedAt, input.now),
      daysSinceAsked: daysSince(last, input.now),
    });
    if (ask) await AsyncStorage.setItem(KEY, new Date(input.now).toISOString());
    return ask;
  } catch (err) {
    logger.warn('Rate ask: storage failed', err);
    return false;
  }
}

/** The store's review page: the App Store's "Write a Review", or Revisely's Play listing. App link first, then the web. */
export function ratingUrls(os: string = Platform.OS): [string, string] {
  return os === 'ios'
    ? [
        `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
        `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
      ]
    : [`market://details?id=${PLAY_PACKAGE}`, `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`];
}

/** Opens the review page. */
export async function openRatingPage(): Promise<void> {
  const [app, web] = ratingUrls();
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(web).catch((err) => logger.warn('Could not open the store for a rating', err));
  }
}
