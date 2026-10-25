/**
 * @jest-environment node
 *
 * lib/recordingCloud itself against the Storage emulator and storage.rules: the
 * requests it really sends, and what the rules make of them. Skipped unless the
 * emulator is running:
 *   firebase emulators:exec --only storage --project demo-revisely 'npx jest recordingCloud.emulator'
 */
import fs from 'fs';
import os from 'os';
import nodePath from 'path';

const EMULATOR = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const describeEmulator = EMULATOR ? describe : describe.skip;

// expo-file-system's uploadAsync and downloadAsync, with Node: the file body
// sent as is, the response written to the file.
jest.mock('expo-file-system/legacy', () => ({
  FileSystemSessionType: { BACKGROUND: 0 },
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  uploadAsync: async (url: string, fileUri: string, opts: { httpMethod: string; headers: Record<string, string> }) => {
    const res = await fetch(url, {
      method: opts.httpMethod,
      headers: opts.headers,
      body: require('fs').readFileSync(fileUri.replace('file://', '')),
    });
    return { status: res.status, body: await res.text(), headers: {} };
  },
  downloadAsync: async (url: string, fileUri: string, opts: { headers: Record<string, string> }) => {
    const res = await fetch(url, { headers: opts.headers });
    require('fs').writeFileSync(fileUri.replace('file://', ''), Buffer.from(await res.arrayBuffer()));
    return { status: res.status };
  },
}));
// An unsigned ID token: the emulator accepts these.
let mockUid = 'alice';
const mockToken = (uid: string) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: 'https://securetoken.google.com/demo-revisely',
    aud: 'demo-revisely',
    iat: now,
    exp: now + 3600,
    auth_time: now,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: 'custom', identities: {} },
  })}.`;
};
jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: { getIdToken: async () => mockToken(mockUid) } }),
}));
jest.mock('../appCheck', () => ({ getAppCheckToken: async () => null }));

import {
  STORAGE_HOST,
  deleteSegment,
  downloadSegment,
  listSegments,
  remoteSize,
  uploadSegment,
} from '../recordingCloud';

describeEmulator('recording backup against the Storage emulator', () => {
  const realFetch = global.fetch;
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'rec-'));
  const audio = Buffer.alloc(300 * 1024, 7); // more than one 256 KB chunk
  const file = nodePath.join(dir, 'a-0.m4a');
  fs.writeFileSync(file, audio);

  beforeAll(() => {
    // The real host, pointed at the emulator.
    global.fetch = ((url: string, init?: RequestInit) =>
      realFetch(String(url).replace(STORAGE_HOST, `http://${EMULATOR}/v0/b`), init)) as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(() => {
    mockUid = 'alice';
  });

  it('uploads, reads the size back, lists, downloads the same bytes, deletes', async () => {
    expect(await uploadSegment('alice', '1700-ab-0.m4a', `file://${file}`, audio.length)).toBe(audio.length);
    await uploadSegment('alice', '1700-ab-1.m4a', `file://${file}`, audio.length);
    expect(await remoteSize('alice', '1700-ab-0.m4a')).toBe(audio.length);
    expect(await remoteSize('alice', 'nothing-0.m4a')).toBeNull();
    expect((await listSegments('alice')).sort()).toEqual(['1700-ab-0.m4a', '1700-ab-1.m4a']);

    const out = nodePath.join(dir, 'down.part');
    await downloadSegment('alice', '1700-ab-0.m4a', `file://${out}`);
    expect(fs.readFileSync(out).equals(audio)).toBe(true);

    await deleteSegment('alice', '1700-ab-0.m4a');
    await deleteSegment('alice', '1700-ab-0.m4a'); // already gone: fine
    expect(await remoteSize('alice', '1700-ab-0.m4a')).toBeNull();
    expect(await listSegments('alice')).toEqual(['1700-ab-1.m4a']);
  });

  it('another account can do none of it', async () => {
    await uploadSegment('alice', 'mine-0.m4a', `file://${file}`, audio.length);
    mockUid = 'mallory';
    await expect(uploadSegment('alice', 'x-0.m4a', `file://${file}`, audio.length)).rejects.toMatchObject({ status: 403 });
    await expect(remoteSize('alice', 'mine-0.m4a')).rejects.toMatchObject({ status: 403 });
    await expect(listSegments('alice')).rejects.toMatchObject({ status: 403 });
    await expect(deleteSegment('alice', 'mine-0.m4a')).rejects.toMatchObject({ status: 403 });
    await expect(downloadSegment('alice', 'mine-0.m4a', `file://${nodePath.join(dir, 'x.part')}`)).rejects.toMatchObject({
      status: 403,
    });
  });
});
