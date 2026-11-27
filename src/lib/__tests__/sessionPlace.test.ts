// Where a session was (BEHAVIOUR.md SESS-9): one page per day shown, for one revision day, per account, kept on the phone.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { primeSessionPlace, resetSessionPlacesForTests, saveSessionPlace, sessionPlaceFor } from '../sessionPlace';

beforeEach(async () => {
  resetSessionPlacesForTests();
  await AsyncStorage.clear();
});

describe('[SESS-9] the session’s place', () => {
  it('keeps one page per day shown for the revision day, and drops another revision day’s', async () => {
    await primeSessionPlace('u1');
    saveSessionPlace('u1', { sessionDay: '2026-11-26', day: '2026-11-26', page: 324 });
    saveSessionPlace('u1', { sessionDay: '2026-11-26', day: '2026-11-28', page: 331 });
    saveSessionPlace('u1', { sessionDay: '2026-11-26', day: '2026-11-26', page: 325 });
    expect(sessionPlaceFor('u1', '2026-11-26', '2026-11-26')).toBe(325);
    expect(sessionPlaceFor('u1', '2026-11-26', '2026-11-28')).toBe(331);
    saveSessionPlace('u1', { sessionDay: '2026-11-27', day: '2026-11-27', page: 330 });
    expect(sessionPlaceFor('u1', '2026-11-26', '2026-11-26')).toBeNull();
    expect(sessionPlaceFor('u1', '2026-11-27', '2026-11-27')).toBe(330);
  });

  it('survives a cold start (read back from the phone), per account', async () => {
    saveSessionPlace('u1', { sessionDay: '2026-11-26', day: '2026-11-28', page: 331 });
    await new Promise((r) => setTimeout(r, 0));
    resetSessionPlacesForTests();
    expect(sessionPlaceFor('u1', '2026-11-26', '2026-11-28')).toBeNull();
    await primeSessionPlace('u1');
    expect(sessionPlaceFor('u1', '2026-11-26', '2026-11-28')).toBe(331);
    await primeSessionPlace('u2');
    expect(sessionPlaceFor('u2', '2026-11-26', '2026-11-28')).toBeNull();
  });

  it('a damaged or odd value on the phone is no place', async () => {
    await AsyncStorage.setItem('@revisely_session_place:v1:u3', JSON.stringify([{ sessionDay: '2026-11-26', day: '2026-11-26', page: 700 }, 'x']));
    await primeSessionPlace('u3');
    expect(sessionPlaceFor('u3', '2026-11-26', '2026-11-26')).toBeNull();
    await AsyncStorage.setItem('@revisely_session_place:v1:u4', '{oops');
    await primeSessionPlace('u4');
    expect(sessionPlaceFor('u4', '2026-11-26', '2026-11-26')).toBeNull();
  });
});
