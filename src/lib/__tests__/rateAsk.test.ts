import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { maybeAskForRating, openRatingPage, ratingUrls, stopRatingAsks } from '../rateAsk';
import { isDevVariant } from '../variant';

jest.mock('../variant', () => ({ isDevVariant: jest.fn(() => true) }));

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 21, 12);
const OLD_ACCOUNT = new Date(NOW - 60 * DAY).toISOString();

afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  await AsyncStorage.clear();
  (isDevVariant as jest.Mock).mockReturnValue(true);
});

describe('maybeAskForRating (SESS-8)', () => {
  it('asks once, then not again for 120 days, then again', async () => {
    expect(await maybeAskForRating({ streak: 7, accountCreatedAt: OLD_ACCOUNT, now: NOW })).toBe(true);
    expect(await maybeAskForRating({ streak: 8, accountCreatedAt: OLD_ACCOUNT, now: NOW + DAY })).toBe(false);
    expect(await maybeAskForRating({ streak: 30, accountCreatedAt: OLD_ACCOUNT, now: NOW + 119 * DAY })).toBe(false);
    expect(await maybeAskForRating({ streak: 30, accountCreatedAt: OLD_ACCOUNT, now: NOW + 120 * DAY })).toBe(true);
  });

  it('asks at most 3 times ever', async () => {
    for (let i = 0; i < 3; i++) {
      expect(await maybeAskForRating({ streak: 9, accountCreatedAt: OLD_ACCOUNT, now: NOW + i * 120 * DAY })).toBe(true);
    }
    expect(await maybeAskForRating({ streak: 9, accountCreatedAt: OLD_ACCOUNT, now: NOW + 3 * 120 * DAY })).toBe(false);
    expect(await maybeAskForRating({ streak: 9, accountCreatedAt: OLD_ACCOUNT, now: NOW + 3000 * DAY })).toBe(false);
  });

  it('never asks again once the line was tapped, dismissed, or Settings rated', async () => {
    await stopRatingAsks();
    expect(await maybeAskForRating({ streak: 9, accountCreatedAt: OLD_ACCOUNT, now: NOW })).toBe(false);
    await AsyncStorage.clear();
    jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
    await openRatingPage();
    await new Promise((r) => setImmediate(r));
    expect(await maybeAskForRating({ streak: 9, accountCreatedAt: OLD_ACCOUNT, now: NOW })).toBe(false);
  });

  it('counts an ask kept before the cap as the first', async () => {
    await AsyncStorage.setItem('@revisely_rate_ask:v1', new Date(NOW - 200 * DAY).toISOString());
    expect(await maybeAskForRating({ streak: 9, accountCreatedAt: OLD_ACCOUNT, now: NOW })).toBe(true);
    expect(await maybeAskForRating({ streak: 9, accountCreatedAt: OLD_ACCOUNT, now: NOW + 120 * DAY })).toBe(true);
    expect(await maybeAskForRating({ streak: 9, accountCreatedAt: OLD_ACCOUNT, now: NOW + 240 * DAY })).toBe(false);
  });

  it('keeps nothing when it does not ask', async () => {
    expect(await maybeAskForRating({ streak: 6, accountCreatedAt: OLD_ACCOUNT, now: NOW })).toBe(false);
    expect(await maybeAskForRating({ streak: 7, accountCreatedAt: OLD_ACCOUNT, now: NOW })).toBe(true);
  });

  it('never asks a new account, and never in the store app yet', async () => {
    expect(await maybeAskForRating({ streak: 7, accountCreatedAt: new Date(NOW - 3 * DAY).toISOString(), now: NOW })).toBe(false);
    (isDevVariant as jest.Mock).mockReturnValue(false);
    expect(await maybeAskForRating({ streak: 7, accountCreatedAt: OLD_ACCOUNT, now: NOW })).toBe(false);
  });

  it('asks nothing when storage fails', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    expect(await maybeAskForRating({ streak: 7, accountCreatedAt: OLD_ACCOUNT, now: NOW })).toBe(false);
  });
});

describe('the review page', () => {
  it('is the App Store\'s Write a Review on iOS, the Play listing on Android', () => {
    expect(ratingUrls('ios')).toEqual([
      'itms-apps://apps.apple.com/app/id6767990248?action=write-review',
      'https://apps.apple.com/app/id6767990248?action=write-review',
    ]);
    expect(ratingUrls('android')).toEqual([
      'market://details?id=app.revisely',
      'https://play.google.com/store/apps/details?id=app.revisely',
    ]);
  });

  it('falls back to the web page', async () => {
    // React Native's preset makes openURL a mock already: start it afresh.
    const open = jest.spyOn(Linking, 'openURL');
    open.mockReset();
    open.mockRejectedValueOnce(new Error('no app')).mockResolvedValueOnce(true);
    await openRatingPage();
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1][0]).toMatch(/^https:\/\//);
  });
});
