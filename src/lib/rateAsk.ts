// Asking for a rating (SESS-8; Revisely Dev until Majd releases it). Majd approved it on Nov 21 2026
// (~/Documents/revisely-ideas/approved/2026-11-14-growth-ask-for-ratings.md), and asked that it never be annoying and
// never keep popping up ("make sure its not annoying and always pops up").
//
// After a good moment, the session's end card shows one quiet line, "Enjoying Revisely? Rate it ›": a swipe that
// finishes a day's revision with a streak of at least 7 days. It opens the store's own review page. It asks at most 3
// times ever on a phone, 120 days apart, never in an account's first week, and stops for good once the line is tapped
// or dismissed (✕), or Settings → Support → Rate Revisely is used. The same for everyone: no stars asked for, no
// reward, nothing that sends unhappy users somewhere else (both stores forbid those).
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
/** At most this many times ever on a phone. */
export const MAX_ASKS = 3;

const DAY_MS = 24 * 60 * 60_000;
const KEY = '@revisely_rate_ask:v2';
/** Before the cap: only the last time asked, as an ISO string. */
const KEY_V1 = '@revisely_rate_ask:v1';

/** What this phone remembers: when it last asked, how many times, and whether asking has stopped for good. */
export interface RateAskState {
  last: string | null;
  times: number;
  stopped: boolean;
}

/** Revisely Dev only, until the release that opens it to everyone. */
export function rateAskEnabled(): boolean {
  return isDevVariant();
}

/**
 * Whether finishing a day now is the moment to ask. `accountDays` is null when the account's age isn't known (the
 * streak alone then keeps the first week out). `daysSinceAsked` is null when this phone has never asked.
 */
export function shouldAskForRating(input: {
  streak: number;
  accountDays: number | null;
  daysSinceAsked: number | null;
  timesAsked: number;
  stopped: boolean;
}): boolean {
  if (input.stopped || input.timesAsked >= MAX_ASKS) return false;
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

async function readState(): Promise<RateAskState> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw) {
    const v = JSON.parse(raw) as Partial<RateAskState>;
    return { last: typeof v.last === 'string' ? v.last : null, times: Number(v.times) || 0, stopped: v.stopped === true };
  }
  const v1 = await AsyncStorage.getItem(KEY_V1);
  return v1 ? { last: v1, times: 1, stopped: false } : { last: null, times: 0, stopped: false };
}

/**
 * Asks if it's the moment: reads what this phone remembers, and when it asks, counts the ask and keeps now as the last
 * time (a line shown counts as asked, tapped or not). Never throws: storage that fails means no ask.
 */
export async function maybeAskForRating(input: { streak: number; accountCreatedAt?: string | null; now: number }): Promise<boolean> {
  if (!rateAskEnabled()) return false;
  try {
    const state = await readState();
    const ask = shouldAskForRating({
      streak: input.streak,
      accountDays: daysSince(input.accountCreatedAt, input.now),
      daysSinceAsked: daysSince(state.last, input.now),
      timesAsked: state.times,
      stopped: state.stopped,
    });
    if (ask) await AsyncStorage.setItem(KEY, JSON.stringify({ ...state, last: new Date(input.now).toISOString(), times: state.times + 1 }));
    return ask;
  } catch (err) {
    logger.warn('Rate ask: storage failed', err);
    return false;
  }
}

/** Never ask again on this phone: the line was tapped or dismissed, or Settings' Rate Revisely was used. */
export async function stopRatingAsks(): Promise<void> {
  try {
    const state = await readState();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...state, stopped: true }));
  } catch (err) {
    logger.warn('Rate ask: storage failed', err);
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

/** Opens the review page, and asks no more on this phone. */
export async function openRatingPage(): Promise<void> {
  void stopRatingAsks();
  const [app, web] = ratingUrls();
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(web).catch((err) => logger.warn('Could not open the store for a rating', err));
  }
}
