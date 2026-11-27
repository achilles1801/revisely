// Friday's Al-Kahf card as last known on this phone (HOME-8), per account and Friday.
import React from 'react';
import { act, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KAHF_KNOWN_KEY, rememberKahf, resetKahfKnownForTests, useKahfKnown } from '../kahfKnown';

let seen: (boolean | null)[] = [];
function Probe({ uid, friday }: { uid: string; friday: string | null }) {
  seen.push(useKahfKnown(uid, friday));
  return null;
}

beforeEach(() => {
  seen = [];
  resetKahfKnownForTests();
});

it('[HOME-8] the answer kept for this account and Friday is there on the first render; another Friday or account knows nothing', () => {
  resetKahfKnownForTests({ uid: 'u1', friday: '2026-11-20', done: true });
  render(<Probe uid="u1" friday="2026-11-20" />);
  expect(seen[0]).toBe(true);
  seen = [];
  render(<Probe uid="u1" friday="2026-11-27" />);
  expect(seen[0]).toBeNull();
  seen = [];
  render(<Probe uid="u2" friday="2026-11-20" />);
  expect(seen[0]).toBeNull();
});

it('[HOME-8] the server’s answer is kept for the next start', async () => {
  render(<Probe uid="u1" friday="2026-11-20" />);
  await act(async () => rememberKahf('u1', '2026-11-20', false));
  expect(seen[seen.length - 1]).toBe(false);
  expect(JSON.parse((await AsyncStorage.getItem(KAHF_KNOWN_KEY))!)).toEqual({ uid: 'u1', friday: '2026-11-20', done: false });
});
