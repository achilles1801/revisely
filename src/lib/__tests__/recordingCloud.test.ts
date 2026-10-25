const mockUpload = jest.fn();
const mockDownload = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  uploadAsync: (...a: unknown[]) => mockUpload(...a),
  downloadAsync: (...a: unknown[]) => mockDownload(...a),
  FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));
let mockUser: { getIdToken: () => Promise<string> } | null = { getIdToken: async () => 'id-token' };
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: mockUser }) }));
let mockAppCheck: string | null = 'app-check-token';
jest.mock('../appCheck', () => ({ getAppCheckToken: async () => mockAppCheck }));

import {
  CloudError,
  deleteSegment,
  downloadSegment,
  listSegments,
  objectPath,
  objectUrl,
  remoteSize,
  uploadSegment,
  uploadUrl,
} from '../recordingCloud';

const BUCKET = 'test.appspot.com';
const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let fetchMock: jest.Mock;

beforeEach(() => {
  mockUser = { getIdToken: async () => 'id-token' };
  mockAppCheck = 'app-check-token';
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
  mockUpload.mockReset();
  mockDownload.mockReset();
});

describe('recording backup over Firebase Storage', () => {
  it('keeps every file under the account, and refuses names that are paths', () => {
    expect(objectPath('u1', '1700-ab-0.m4a')).toBe('recordings/u1/1700-ab-0.m4a');
    for (const bad of ['../x.m4a', '..', '.hidden', 'a..b', 'a/b.m4a', 'a b.m4a', '']) expect(() => objectPath('u1', bad)).toThrow();
    expect(objectUrl(BUCKET, 'recordings/u1/a-0.m4a')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/recordings%2Fu1%2Fa-0.m4a',
    );
    expect(uploadUrl(BUCKET, 'recordings/u1/a-0.m4a')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o?name=recordings%2Fu1%2Fa-0.m4a',
    );
  });

  it('sends the ID token and App Check token; without App Check, just the ID token', async () => {
    fetchMock.mockResolvedValue(res(404));
    await remoteSize('u1', 'a-0.m4a');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: 'Firebase id-token',
      'X-Firebase-AppCheck': 'app-check-token',
    });
    mockAppCheck = null;
    await remoteSize('u1', 'a-0.m4a');
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: 'Firebase id-token' });
  });

  it('signed out: nothing is sent', async () => {
    mockUser = null;
    await expect(remoteSize('u1', 'a-0.m4a')).rejects.toThrow('Not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads a backed-up file’s size; missing is null; other failures throw', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { size: '12345' }));
    expect(await remoteSize('u1', 'a-0.m4a')).toBe(12345);
    fetchMock.mockResolvedValueOnce(res(404));
    expect(await remoteSize('u1', 'a-0.m4a')).toBeNull();
    fetchMock.mockResolvedValueOnce(res(403));
    await expect(remoteSize('u1', 'a-0.m4a')).rejects.toBeInstanceOf(CloudError);
  });

  it('declares the file (name, audio type, size), then uploads it in a background session', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['X-Goog-Upload-URL', 'https://upload/session-1']]),
    });
    mockUpload.mockResolvedValue({ status: 200, body: JSON.stringify({ size: '900' }) });
    expect(await uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 900)).toBe(900);

    const [startUrl, start] = fetchMock.mock.calls[0];
    expect(startUrl).toBe(uploadUrl(BUCKET, 'recordings/u1/a-0.m4a'));
    expect(start.method).toBe('POST');
    expect(start.headers).toMatchObject({
      Authorization: 'Firebase id-token',
      'X-Firebase-AppCheck': 'app-check-token',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': '900',
      'X-Goog-Upload-Header-Content-Type': 'audio/mp4',
    });
    expect(JSON.parse(start.body)).toEqual({ name: 'recordings/u1/a-0.m4a', contentType: 'audio/mp4' });

    const [url, uri, opts] = mockUpload.mock.calls[0];
    expect(url).toBe('https://upload/session-1');
    expect(uri).toBe('file:///a-0.m4a');
    expect(opts).toMatchObject({
      httpMethod: 'POST',
      sessionType: 0,
      uploadType: 0,
      headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0', Authorization: 'Firebase id-token' },
    });
  });

  it('a refused upload throws with its status, at either step', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, headers: new Map() });
    await expect(uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 900)).rejects.toMatchObject({ status: 403 });
    expect(mockUpload).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: new Map([['X-Goog-Upload-URL', 'https://u/s']]) });
    mockUpload.mockResolvedValue({ status: 503, body: '' });
    await expect(uploadSegment('u1', 'a-0.m4a', 'file:///a-0.m4a', 900)).rejects.toMatchObject({ status: 503 });
  });

  it('downloads the file itself (alt=media); a failed download throws', async () => {
    mockDownload.mockResolvedValue({ status: 200 });
    await downloadSegment('u1', 'a-0.m4a', 'file:///part');
    expect(mockDownload.mock.calls[0][0]).toBe(`${objectUrl(BUCKET, 'recordings/u1/a-0.m4a')}?alt=media`);
    mockDownload.mockResolvedValue({ status: 404 });
    await expect(downloadSegment('u1', 'a-0.m4a', 'file:///part')).rejects.toMatchObject({ status: 404 });
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
