import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadRevoMomentSeen, markRevoMomentSeen, resetRevoMomentSeenForTests, revoMomentSeen } from '../momentSeen';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRevoMomentSeenForTests();
});

describe('Revo’s moment, seen on this phone (REVO-39)', () => {
  it('is unknown until read, unseen for a new account, and seen once marked: kept per account, across runs', async () => {
    expect(revoMomentSeen('u1')).toBeUndefined();
    expect(await loadRevoMomentSeen('u1')).toBe(false);
    markRevoMomentSeen('u1');
    expect(revoMomentSeen('u1')).toBe(true);
    expect(await loadRevoMomentSeen('u2')).toBe(false);
    // A new run reads it from the phone.
    resetRevoMomentSeenForTests();
    expect(await loadRevoMomentSeen('u1')).toBe(true);
    expect(await loadRevoMomentSeen('u2')).toBe(false);
  });

  it('a mark made while it is being read wins', async () => {
    const reading = loadRevoMomentSeen('u1');
    markRevoMomentSeen('u1');
    expect(await reading).toBe(true);
  });

  it('a phone whose storage can’t be read counts it as seen, so it never plays on every open', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('broken'));
    expect(await loadRevoMomentSeen('u1')).toBe(true);
  });
});
