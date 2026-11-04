// The E2E build's network (src/lib/e2e/network.ts): what a request is sent to.

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@react-native-community/netinfo', () => ({ configure: jest.fn(), refresh: jest.fn(async () => undefined) }));
jest.mock('expo-file-system', () => {
  class File {
    exists = false;
    create() {}
    write() {}
  }
  return { File, Paths: { document: { uri: 'documents' } } };
});

import { rewrite, setOffline } from '../network';

const DB = 'database=projects%2Fdemo-revisely%2Fdatabases%2F(default)';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  setOffline(false);
});

it('sends Firestore’s back channels to 127.0.0.1, and everything else for the emulators as it was', () => {
  const back = `http://localhost:8080/google.firestore.v1.Firestore/Listen/channel?${DB}&VER=8&RID=rpc&SID=abc&AID=0&CI=0&TYPE=xmlhttp`;
  expect(rewrite(back)).toBe(back.replace('http://localhost:8080', 'http://127.0.0.1:8080'));
  const write = `http://localhost:8080/google.firestore.v1.Firestore/Write/channel?${DB}&RID=rpc&SID=x&AID=3`;
  expect(rewrite(write)).toBe(write.replace('localhost', '127.0.0.1'));
  // The handshake and the forward channel (RID a number) stay on localhost.
  const handshake = `http://localhost:8080/google.firestore.v1.Firestore/Listen/channel?${DB}&VER=8&RID=33071&CVER=22`;
  expect(rewrite(handshake)).toBe(handshake);
  expect(rewrite('http://localhost:9099/')).toBe('http://localhost:9099/');
});

it('offline, every request to the emulators goes nowhere, back channels too', () => {
  setOffline(true);
  expect(rewrite(`http://localhost:8080/google.firestore.v1.Firestore/Listen/channel?${DB}&RID=rpc&SID=a`)).toMatch(/127\.0\.0\.1:9\/revisely-e2e-blocked$/);
  expect(rewrite('http://localhost:9099/')).toMatch(/:9\/revisely-e2e-blocked$/);
});

it('a real service is never reached', () => {
  expect(rewrite('https://firebasestorage.googleapis.com/v0/b/x/o/mushaf%2F001.png')).toMatch(/:9\/revisely-e2e-blocked$/);
});
