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
// Fixed, so the mocks below (which run before this file's code) can use it.
const mockTmp = nodePath.join(os.tmpdir(), 'revisely-recording-emulator-test');

// expo-file-system with Node: files on disk.
jest.mock('expo-file-system', () => {
  const nfs = require('fs');
  const np = require('path');
  const pathOf = (u: string) => u.replace(/^file:\/\//, '');
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      const joined = parts.map((p) => (typeof p === 'string' ? pathOf(p) : pathOf((p as { uri: string }).uri)));
      this.uri = `file://${np.join(...joined)}`;
    }
    get exists() {
      return nfs.existsSync(pathOf(this.uri));
    }
    create() {
      nfs.writeFileSync(pathOf(this.uri), Buffer.alloc(0));
    }
    write(bytes: Uint8Array) {
      nfs.writeFileSync(pathOf(this.uri), Buffer.from(bytes));
    }
    delete() {
      nfs.rmSync(pathOf(this.uri), { force: true });
    }
    open() {
      const fd = nfs.openSync(pathOf(this.uri), 'r');
      return {
        offset: 0 as number | null,
        readBytes(n: number) {
          const buf = Buffer.alloc(n);
          const read = nfs.readSync(fd, buf, 0, n, this.offset ?? 0);
          this.offset = (this.offset ?? 0) + read;
          return new Uint8Array(buf.subarray(0, read));
        },
        close() {
          nfs.closeSync(fd);
        },
      };
    }
  }
  const dir = np.join(require('os').tmpdir(), 'revisely-recording-emulator-test');
  nfs.mkdirSync(dir, { recursive: true });
  return { File, Paths: { cache: `file://${dir}` } };
});
// expo-file-system's upload and download tasks, with fetch.
jest.mock('expo-file-system/legacy', () => {
  const nfs = require('fs');
  const pathOf = (u: string) => u.replace(/^file:\/\//, '');
  return {
    FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
    FileSystemUploadType: { BINARY_CONTENT: 0 },
    createUploadTask: (url: string, fileUri: string, opts: { httpMethod: string; headers: Record<string, string> }) => ({
      cancelAsync: async () => undefined,
      uploadAsync: async () => {
        const res = await fetch(url, { method: opts.httpMethod, headers: opts.headers, body: nfs.readFileSync(pathOf(fileUri)) });
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => (headers[k] = v));
        return { status: res.status, body: await res.text(), headers };
      },
    }),
    createDownloadResumable: (url: string, to: string, opts: { headers: Record<string, string> }) => ({
      cancelAsync: async () => undefined,
      downloadAsync: async () => {
        const res = await fetch(url, { headers: opts.headers });
        nfs.writeFileSync(pathOf(to), Buffer.from(await res.arrayBuffer()));
        return { status: res.status };
      },
    }),
  };
});
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
  remoteInfo,
  uploadSegment,
} from '../recordingCloud';
import type { UploadSession } from '../recordings';

describeEmulator('recording backup against the Storage emulator', () => {
  const realFetch = global.fetch;
  const audio = Buffer.alloc(600 * 1024);
  for (let i = 0; i < audio.length; i++) audio[i] = i % 253;
  fs.mkdirSync(mockTmp, { recursive: true });
  const file = nodePath.join(mockTmp, 'a-0.m4a');
  fs.writeFileSync(file, audio);
  const CHUNK = 256 * 1024; // three chunks

  beforeAll(() => {
    // The real host, pointed at the emulator.
    global.fetch = ((url: string, init?: RequestInit) =>
      realFetch(String(url).replace(STORAGE_HOST, `http://${EMULATOR}/v0/b`), init)) as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
    fs.rmSync(mockTmp, { recursive: true, force: true });
  });
  beforeEach(() => {
    mockUid = 'alice';
  });

  it('uploads in chunks, reads it back, lists, downloads the same bytes, deletes', async () => {
    expect(await uploadSegment('alice', '1700-ab-0.m4a', `file://${file}`, audio.length, { chunkBytes: CHUNK })).toBe(
      audio.length,
    );
    await uploadSegment('alice', '1700-ab-1.m4a', `file://${file}`, audio.length);
    expect(await remoteInfo('alice', '1700-ab-0.m4a')).toMatchObject({ size: audio.length });
    expect((await remoteInfo('alice', '1700-ab-0.m4a'))!.createdAt).toBeGreaterThan(Date.now() - 60_000);
    expect(await remoteInfo('alice', 'nothing-0.m4a')).toBeNull();
    expect((await listSegments('alice')).sort()).toEqual(['1700-ab-0.m4a', '1700-ab-1.m4a']);

    const out = nodePath.join(mockTmp, 'down.part');
    await downloadSegment('alice', '1700-ab-0.m4a', `file://${out}`);
    expect(fs.readFileSync(out).equals(audio)).toBe(true);

    await deleteSegment('alice', '1700-ab-0.m4a');
    await deleteSegment('alice', '1700-ab-0.m4a'); // already gone: fine
    expect(await remoteInfo('alice', '1700-ab-0.m4a')).toBeNull();
    expect(await listSegments('alice')).toEqual(['1700-ab-1.m4a']);
  });

  it('an upload stopped after a chunk carries on from its session, and the file arrives whole', async () => {
    let session: UploadSession | null = null;
    let n = 0;
    await expect(
      uploadSegment('alice', 'resume-0.m4a', `file://${file}`, audio.length, {
        chunkBytes: CHUNK,
        stopped: () => ++n > 1,
        onSession: (s) => {
          session = s;
        },
      }),
    ).rejects.toMatchObject({ name: 'TransferStopped' });
    expect(session).toMatchObject({ offset: CHUNK });
    expect(await remoteInfo('alice', 'resume-0.m4a')).toBeNull(); // nothing until it is finished

    await uploadSegment('alice', 'resume-0.m4a', `file://${file}`, audio.length, { chunkBytes: CHUNK, session });
    const out = nodePath.join(mockTmp, 'resume.part');
    await downloadSegment('alice', 'resume-0.m4a', `file://${out}`);
    expect(fs.readFileSync(out).equals(audio)).toBe(true);
  });

  it('a file is never overwritten', async () => {
    await uploadSegment('alice', 'once-0.m4a', `file://${file}`, audio.length);
    const other = nodePath.join(mockTmp, 'other.m4a');
    fs.writeFileSync(other, Buffer.alloc(1000, 1));
    await expect(uploadSegment('alice', 'once-0.m4a', `file://${other}`, 1000)).rejects.toMatchObject({ status: 403 });
    expect(await remoteInfo('alice', 'once-0.m4a')).toMatchObject({ size: audio.length });
  });

  it('another account can do none of it', async () => {
    await uploadSegment('alice', 'mine-0.m4a', `file://${file}`, audio.length);
    mockUid = 'mallory';
    await expect(uploadSegment('alice', 'x-0.m4a', `file://${file}`, audio.length)).rejects.toMatchObject({ status: 403 });
    await expect(remoteInfo('alice', 'mine-0.m4a')).rejects.toMatchObject({ status: 403 });
    await expect(listSegments('alice')).rejects.toMatchObject({ status: 403 });
    await expect(deleteSegment('alice', 'mine-0.m4a')).rejects.toMatchObject({ status: 403 });
    await expect(
      downloadSegment('alice', 'mine-0.m4a', `file://${nodePath.join(mockTmp, 'x.part')}`),
    ).rejects.toMatchObject({ status: 403 });
  });
});
