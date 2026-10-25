// In-memory files for chunking.
const mockFiles = new Map<string, Uint8Array>();
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.set(this.uri, new Uint8Array());
    }
    write(bytes: Uint8Array) {
      mockFiles.set(this.uri, bytes);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    open() {
      const data = mockFiles.get(this.uri) ?? new Uint8Array();
      return {
        offset: 0 as number | null,
        readBytes(n: number) {
          const start = this.offset ?? 0;
          this.offset = start + n;
          return data.slice(start, start + n);
        },
        close() {},
      };
    }
  }
  return { File, Paths: { cache: 'cache' } };
});

// Upload tasks: each records its call; the test decides the answer.
type Call = { url: string; uri: string; headers: Record<string, string>; bytes: Uint8Array };
const mockUploadCalls: Call[] = [];
let mockUploadAnswer: (call: Call) => Promise<any> = async () => ({ status: 200, body: '{}', headers: {} });
const mockDownloads: { url: string; to: string; opts: any }[] = [];
let mockDownloadAnswer: (d: { progress: () => void }) => Promise<any> = async () => ({ status: 200 });
jest.mock('expo-file-system/legacy', () => ({
  FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  createUploadTask: (url: string, uri: string, opts: any) => {
    let cancelled = false;
    let resolveCancel: (v: undefined) => void = () => {};
    return {
      cancelAsync: async () => {
        cancelled = true;
        resolveCancel(undefined);
      },
      uploadAsync: () => {
        const call = { url, uri, headers: opts.headers, bytes: mockFiles.get(uri) ?? new Uint8Array() };
        mockUploadCalls.push(call);
        return Promise.race([
          mockUploadAnswer(call).then((r) => (cancelled ? undefined : r)),
          new Promise((r) => (resolveCancel = r)),
        ]);
      },
    };
  },
  createDownloadResumable: (url: string, to: string, opts: any, progress: () => void) => {
    let resolveCancel: (v: undefined) => void = () => {};
    mockDownloads.push({ url, to, opts });
    return {
      cancelAsync: async () => resolveCancel(undefined),
      downloadAsync: () => Promise.race([mockDownloadAnswer({ progress }), new Promise((r) => (resolveCancel = r))]),
    };
  },
}));
let mockUser: { getIdToken: () => Promise<string> } | null = { getIdToken: async () => 'id-token' };
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: mockUser }) }));
let mockAppCheck: string | null = 'app-check-token';
jest.mock('../appCheck', () => ({ getAppCheckToken: async () => mockAppCheck }));

import {
  CloudError,
  cancelUploads,
  deleteSegment,
  downloadSegment,
  listSegments,
  objectPath,
  objectUrl,
  remoteInfo,
  uploadSegment,
  uploadUrl,
} from '../recordingCloud';

const BUCKET = 'test.appspot.com';
const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  headers: new Map(Object.entries(headers)),
});
let fetchMock: jest.Mock;
const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  mockUser = { getIdToken: async () => 'id-token' };
  mockAppCheck = 'app-check-token';
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
  mockUploadCalls.length = 0;
  mockDownloads.length = 0;
  mockFiles.clear();
  mockUploadAnswer = async () => ({ status: 200, body: '{}', headers: {} });
  mockDownloadAnswer = async () => ({ status: 200 });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('recording backup over Firebase Storage', () => {
  it('keeps every file under the account, and refuses names that are paths', () => {
    expect(objectPath('u1', '1700-ab-0.m4a')).toBe('recordings/u1/1700-ab-0.m4a');
    for (const bad of ['../x.m4a', '..', '.hidden', 'a..b', 'a/b.m4a', 'a b.m4a', '']) {
      expect(() => objectPath('u1', bad)).toThrow();
    }
    expect(objectUrl(BUCKET, 'recordings/u1/a-0.m4a')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/recordings%2Fu1%2Fa-0.m4a',
    );
    expect(uploadUrl(BUCKET, 'recordings/u1/a-0.m4a')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o?name=recordings%2Fu1%2Fa-0.m4a',
    );
  });

  it('sends the ID token and App Check token; without App Check, just the ID token', async () => {
    fetchMock.mockResolvedValue(res(404));
    await remoteInfo('u1', 'a-0.m4a');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: 'Firebase id-token',
      'X-Firebase-AppCheck': 'app-check-token',
    });
    mockAppCheck = null;
    await remoteInfo('u1', 'a-0.m4a');
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: 'Firebase id-token' });
  });

  it('signed out: nothing is sent', async () => {
    mockUser = null;
    await expect(remoteInfo('u1', 'a-0.m4a')).rejects.toThrow('Not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads a backed-up file’s size and creation time; missing is null; other failures throw', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { size: '12345', timeCreated: '2026-10-25T10:00:00.000Z' }));
    expect(await remoteInfo('u1', 'a-0.m4a')).toEqual({ size: 12345, createdAt: Date.parse('2026-10-25T10:00:00.000Z') });
    fetchMock.mockResolvedValueOnce(res(404));
    expect(await remoteInfo('u1', 'a-0.m4a')).toBeNull();
    fetchMock.mockResolvedValueOnce(res(403));
    await expect(remoteInfo('u1', 'a-0.m4a')).rejects.toBeInstanceOf(CloudError);
  });

  describe('uploading', () => {
    const SESSION = 'https://upload/session-1';
    const started = () => res(200, {}, { 'X-Goog-Upload-URL': SESSION });

    it('declares the file (name, audio type, size), then sends it in chunks, saving where it got to', async () => {
      mockFiles.set('file:///a-0.m4a', bytes(10));
      fetchMock.mockResolvedValueOnce(started());
      mockUploadAnswer = async (c) =>
        c.headers['X-Goog-Upload-Command'] === 'upload, finalize'
          ? { status: 200, body: JSON.stringify({ size: '10' }), headers: {} }
          : { status: 200, body: '', headers: { 'X-Goog-Upload-Status': 'active' } };
      const sessions: unknown[] = [];
      const size = await uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10, {
        chunkBytes: 4,
        onSession: (s) => {
          sessions.push(s);
        },
      });
      expect(size).toBe(10);

      const [startUrl, start] = fetchMock.mock.calls[0];
      expect(startUrl).toBe(uploadUrl(BUCKET, 'recordings/u1/a-0.m4a'));
      expect(start.method).toBe('POST');
      expect(start.headers).toMatchObject({
        Authorization: 'Firebase id-token',
        'X-Firebase-AppCheck': 'app-check-token',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': '10',
        'X-Goog-Upload-Header-Content-Type': 'audio/mp4',
      });
      expect(JSON.parse(start.body)).toEqual({ name: 'recordings/u1/a-0.m4a', contentType: 'audio/mp4' });

      expect(
        mockUploadCalls.map((c) => [c.url, c.headers['X-Goog-Upload-Command'], c.headers['X-Goog-Upload-Offset']]),
      ).toEqual([
        [SESSION, 'upload', '0'],
        [SESSION, 'upload', '4'],
        [SESSION, 'upload, finalize', '8'],
      ]);
      expect(mockUploadCalls.map((c) => Array.from(c.bytes))).toEqual([
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [8, 9],
      ]);
      expect(mockUploadCalls[0].headers.Authorization).toBe('Firebase id-token');
      expect(sessions).toEqual([
        { url: SESSION, offset: 0, sizeBytes: 10 },
        { url: SESSION, offset: 4, sizeBytes: 10 },
        { url: SESSION, offset: 8, sizeBytes: 10 },
        null,
      ]);
      // The chunk files are gone.
      expect([...mockFiles.keys()]).toEqual(['file:///a-0.m4a']);
    });

    it('carries on an upload from where the backup says it got to', async () => {
      mockFiles.set('file:///a-0.m4a', bytes(10));
      fetchMock.mockResolvedValueOnce(
        res(200, {}, { 'X-Goog-Upload-Status': 'active', 'X-Goog-Upload-Size-Received': '8' }),
      );
      mockUploadAnswer = async () => ({ status: 200, body: JSON.stringify({ size: '10' }), headers: {} });
      await uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10, {
        chunkBytes: 4,
        session: { url: SESSION, offset: 4, sizeBytes: 10 },
      });
      expect(fetchMock.mock.calls[0][1].headers['X-Goog-Upload-Command']).toBe('query');
      expect(mockUploadCalls.map((c) => [c.headers['X-Goog-Upload-Offset'], Array.from(c.bytes)])).toEqual([
        ['8', [8, 9]],
      ]);
    });

    it('an upload that had already finished just reports the size', async () => {
      fetchMock
        .mockResolvedValueOnce(res(200, {}, { 'X-Goog-Upload-Status': 'final' }))
        .mockResolvedValueOnce(res(200, { size: '10', timeCreated: '2026-10-25T10:00:00Z' }));
      // (the finished session is dropped, then the file is found in the backup)
      expect(
        await uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10, {
          session: { url: SESSION, offset: 8, sizeBytes: 10 },
        }),
      ).toBe(10);
      expect(mockUploadCalls).toEqual([]);
    });

    it('an expired session, or one for a file of another size, is dropped and the upload starts over', async () => {
      mockFiles.set('file:///a-0.m4a', bytes(10));
      // query: gone; the file isn't in the backup; start.
      fetchMock.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(404)).mockResolvedValueOnce(started());
      const sessions: unknown[] = [];
      await uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10, {
        session: { url: 'https://old', offset: 4, sizeBytes: 10 },
        onSession: (s) => void sessions.push(s),
      });
      expect(sessions[0]).toBeNull();
      expect(fetchMock.mock.calls[2][1].headers['X-Goog-Upload-Command']).toBe('start');
      expect(mockUploadCalls[0].headers['X-Goog-Upload-Offset']).toBe('0');

      fetchMock.mockClear().mockResolvedValueOnce(res(404)).mockResolvedValueOnce(started());
      await uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10, {
        session: { url: 'https://old', offset: 4, sizeBytes: 99 },
      });
      expect(fetchMock.mock.calls[1][1].headers['X-Goog-Upload-Command']).toBe('start');
    });

    it('a dead session whose file did arrive (its last answer was lost) is just reported done', async () => {
      fetchMock.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(200, { size: '10', timeCreated: 'x' }));
      expect(
        await uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10, { session: { url: 'https://old', offset: 8, sizeBytes: 10 } }),
      ).toBe(10);
      expect(mockUploadCalls).toEqual([]);
    });

    it('a dead session with a different file under the name is refused, never overwritten', async () => {
      fetchMock.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(200, { size: '3' }));
      await expect(
        uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10, { session: { url: 'https://old', offset: 8, sizeBytes: 10 } }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('a cancel that comes while the tokens are fetched still stops it before anything is sent', async () => {
      mockFiles.set('file:///a-0.m4a', bytes(10));
      fetchMock.mockResolvedValueOnce(started());
      let release: () => void = () => {};
      let calls = 0;
      mockUser = {
        getIdToken: () => {
          calls++;
          // The second token fetch (for the first chunk) waits.
          return calls === 2 ? new Promise<string>((r) => (release = () => r('id-token'))) : Promise.resolve('id-token');
        },
      };
      const upload = uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10);
      await tick();
      cancelUploads(); // nothing in flight to cancel yet
      release();
      await expect(upload).rejects.toMatchObject({ name: 'TransferStopped' });
      expect(mockUploadCalls).toEqual([]);
    });

    it('stops between chunks when told to, keeping the session', async () => {
      mockFiles.set('file:///a-0.m4a', bytes(10));
      fetchMock.mockResolvedValueOnce(started());
      mockUploadAnswer = async () => ({ status: 200, body: '', headers: {} });
      const sessions: unknown[] = [];
      await expect(
        uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10, {
          chunkBytes: 4,
          stopped: () => mockUploadCalls.length >= 1, // after the first chunk
          onSession: (s) => {
            sessions.push(s);
          },
        }),
      ).rejects.toMatchObject({ name: 'TransferStopped' });
      expect(mockUploadCalls).toHaveLength(1);
      expect(sessions[sessions.length - 1]).toEqual({ url: SESSION, offset: 4, sizeBytes: 10 });
    });

    it('a chunk in flight can be cancelled', async () => {
      mockFiles.set('file:///a-0.m4a', bytes(10));
      fetchMock.mockResolvedValueOnce(started());
      mockUploadAnswer = () => new Promise(() => {}); // never answers
      const upload = uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10);
      await tick();
      expect(mockUploadCalls).toHaveLength(1);
      cancelUploads();
      await expect(upload).rejects.toMatchObject({ name: 'TransferStopped' });
    });

    it('a refused upload throws with its status, at either step; a refused chunk drops the session', async () => {
      fetchMock.mockResolvedValueOnce(res(403));
      await expect(uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10)).rejects.toMatchObject({ status: 403 });
      expect(mockUploadCalls).toEqual([]);

      mockFiles.set('file:///a-0.m4a', bytes(10));
      fetchMock.mockResolvedValueOnce(started());
      mockUploadAnswer = async () => ({ status: 400, body: '', headers: {} });
      const sessions: unknown[] = [];
      await expect(
        uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10, { onSession: (s) => void sessions.push(s) }),
      ).rejects.toMatchObject({ status: 400 });
      expect(sessions[sessions.length - 1]).toBeNull();

      // A server error keeps it, to carry on later.
      fetchMock.mockResolvedValueOnce(started());
      mockUploadAnswer = async () => ({ status: 503, body: '', headers: {} });
      sessions.length = 0;
      await expect(
        uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 10, { onSession: (s) => void sessions.push(s) }),
      ).rejects.toMatchObject({ status: 503 });
      expect(sessions[sessions.length - 1]).toEqual({ url: SESSION, offset: 0, sizeBytes: 10 });
    });
  });

  describe('downloading', () => {
    it('downloads the file itself (alt=media) in the foreground; a failed download throws', async () => {
      await downloadSegment('u1', 'a-0.m4a', 'file:///part');
      expect(mockDownloads[0].url).toBe(`${objectUrl(BUCKET, 'recordings/u1/a-0.m4a')}?alt=media`);
      expect(mockDownloads[0].opts).toMatchObject({ sessionType: 1, headers: { Authorization: 'Firebase id-token' } });
      mockDownloadAnswer = async () => ({ status: 404 });
      await expect(downloadSegment('u1', 'a-0.m4a', 'file:///part')).rejects.toMatchObject({ status: 404 });
    });

    it('gives up when nothing arrives for a while (offline), instead of waiting forever', async () => {
      jest.useFakeTimers();
      mockDownloadAnswer = () => new Promise(() => {});
      const download = downloadSegment('u1', 'a-0.m4a', 'file:///part', 1000);
      const settled = expect(download).rejects.toMatchObject({ message: 'Download timed out' });
      await tick();
      jest.advanceTimersByTime(1000);
      await settled;
    });

    it('data arriving keeps it going', async () => {
      jest.useFakeTimers();
      mockDownloadAnswer = ({ progress }) =>
        new Promise((resolve) => {
          setTimeout(progress, 800);
          setTimeout(progress, 1600);
          setTimeout(() => resolve({ status: 200 }), 2400);
        });
      const download = downloadSegment('u1', 'a-0.m4a', 'file:///part', 1000);
      await tick();
      jest.advanceTimersByTime(800);
      jest.advanceTimersByTime(800);
      jest.advanceTimersByTime(800);
      await expect(download).resolves.toBeUndefined();
    });
  });

  it('deleting: gone already counts as deleted; other failures throw', async () => {
    fetchMock.mockResolvedValueOnce(res(204));
    await deleteSegment('u1', 'a-0.m4a');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    fetchMock.mockResolvedValueOnce(res(404));
    await expect(deleteSegment('u1', 'a-0.m4a')).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(res(500));
    await expect(deleteSegment('u1', 'a-0.m4a')).rejects.toMatchObject({ status: 500 });
  });

  it('lists every file in the backup, page by page', async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, { items: [{ name: 'recordings/u1/a-0.m4a' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(res(200, { items: [{ name: 'recordings/u1/b-0.m4a' }, { name: 'elsewhere/x' }] }));
    expect(await listSegments('u1')).toEqual(['a-0.m4a', 'b-0.m4a']);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o?prefix=recordings%2Fu1%2F&delimiter=%2F',
    );
    expect(fetchMock.mock.calls[1][0]).toContain('&pageToken=p2');
    fetchMock.mockResolvedValueOnce(res(403));
    await expect(listSegments('u1')).rejects.toBeInstanceOf(CloudError);
  });
});
