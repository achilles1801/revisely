// The network side of recording backup: Firebase Storage over its REST API.
//
// Files live at recordings/<uid>/<id>-<n>.m4a in the project's bucket. The
// Storage rules let only the account itself read, create or delete them (only
// audio, at most 200 MB a file, never overwritten).
//
// An upload uses the resumable protocol the Firebase SDK uses: a small request
// declares the file (name, type, size, which the rules check) and returns a
// session URL; the file then goes in 4 MB chunks. Where it got to is saved
// (lib/recordings), so an upload cut off by the app closing, the network going
// or Wi-Fi being left carries on from that chunk next time. Between chunks the
// caller can stop it, and the chunk in flight can be cancelled
// (`cancelUploads`): nothing is uploaded on mobile data when that isn't
// allowed, or after the user deleted a recording or their account. Transfers
// run in the foreground session, so they fail when the network does instead of
// retrying out of reach.
//
// Requests carry the user's Firebase ID token and, when there is one, an App
// Check token.

import Constants from 'expo-constants';
import { getAuth } from 'firebase/auth';
import { File, Paths } from 'expo-file-system';
import {
  createDownloadResumable,
  createUploadTask,
  FileSystemSessionType,
  FileSystemUploadType,
  type FileSystemUploadResult,
} from 'expo-file-system/legacy';
import { getAppCheckToken } from './appCheck';
import type { UploadSession } from './recordings';

export const STORAGE_HOST = 'https://firebasestorage.googleapis.com/v0/b';
export const AUDIO_TYPE = 'audio/mp4';
/** A multiple of 256 KB, as the protocol requires of every chunk but the last. */
export const CHUNK_BYTES = 4 * 1024 * 1024;

export function bucketName(): string {
  const bucket = Constants.expoConfig?.extra?.firebase?.storageBucket;
  if (!bucket) throw new Error('Firebase storage bucket is not configured.');
  return bucket;
}

export function objectPath(uid: string, fileName: string): string {
  if (!/^[\w-][\w.-]*$/.test(fileName) || fileName.includes('..')) {
    throw new Error(`Unexpected recording file name: ${fileName}`);
  }
  return `recordings/${uid}/${fileName}`;
}

/** The object's metadata URL (GET metadata, DELETE); `?alt=media` downloads it. */
export function objectUrl(bucket: string, path: string): string {
  return `${STORAGE_HOST}/${bucket}/o/${encodeURIComponent(path)}`;
}

/** Where an upload starts (it answers with the URL the file goes to). */
export function uploadUrl(bucket: string, path: string): string {
  return `${STORAGE_HOST}/${bucket}/o?name=${encodeURIComponent(path)}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not signed in.');
  const headers: Record<string, string> = { Authorization: `Firebase ${await user.getIdToken()}` };
  const appCheck = await getAppCheckToken().catch(() => null);
  if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
  return headers;
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A transfer stopped on purpose (cancelled, or the caller said stop). */
export class TransferStopped extends Error {
  constructor() {
    super('Transfer stopped');
    this.name = 'TransferStopped';
  }
}

// Uploads in flight, so the backup can cancel them (downloads are for playing
// and aren't cancelled by it).
interface Tracked {
  task: { cancelAsync(): Promise<void> };
  cancelled: boolean;
}
const uploadsInFlight = new Set<Tracked>();

/** Cancel the uploads in flight (each then ends with TransferStopped). */
export function cancelUploads(): void {
  for (const t of uploadsInFlight) {
    t.cancelled = true;
    t.task.cancelAsync().catch(() => undefined);
  }
}

async function track<T>(task: Tracked['task'], run: () => Promise<T>, upload: boolean): Promise<T> {
  const t: Tracked = { task, cancelled: false };
  if (upload) uploadsInFlight.add(t);
  try {
    const result = await run();
    if (t.cancelled) throw new TransferStopped();
    return result;
  } catch (err) {
    if (t.cancelled) throw new TransferStopped();
    throw err;
  } finally {
    uploadsInFlight.delete(t);
  }
}

const header = (headers: Record<string, string> | Headers | undefined, name: string): string | null => {
  if (!headers) return null;
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name);
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? (headers as Record<string, string>)[key] : null;
};

export interface RemoteInfo {
  size: number;
  /** When the backup got it (ms). */
  createdAt: number;
}

/** The backed-up file's size and creation time, or null if it isn't there. */
export async function remoteInfo(uid: string, fileName: string): Promise<RemoteInfo | null> {
  const res = await fetch(objectUrl(bucketName(), objectPath(uid, fileName)), { headers: await authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new CloudError(`Backup check failed (${res.status})`, res.status);
  const meta = (await res.json()) as { size?: string | number; timeCreated?: string };
  const created = meta.timeCreated ? Date.parse(meta.timeCreated) : NaN;
  return { size: Number(meta.size ?? 0), createdAt: Number.isFinite(created) ? created : 0 };
}

/** Bytes [offset, offset + length) of `source`, in a file of their own (cache). */
function chunkFile(source: File, offset: number, length: number): File {
  const handle = source.open();
  try {
    handle.offset = offset;
    const bytes = handle.readBytes(length);
    const chunk = new File(Paths.cache, `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.part`);
    if (chunk.exists) chunk.delete();
    chunk.create();
    chunk.write(bytes);
    return chunk;
  } finally {
    handle.close();
  }
}

/** POST a file's bytes to `url`, cancellably. */
function sendFile(url: string, fileUri: string, headers: Record<string, string>): Promise<FileSystemUploadResult> {
  const task = createUploadTask(url, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    sessionType: FileSystemSessionType.FOREGROUND,
    headers,
  });
  return track(
    task,
    async () => {
      const result = await task.uploadAsync();
      if (!result) throw new TransferStopped();
      return result;
    },
    true,
  );
}

export interface UploadOptions {
  /** An upload of this file that was under way (carry on from it). */
  session?: UploadSession | null;
  /** Where the upload has got to, to save (null when it's done). */
  onSession?: (session: UploadSession | null) => Promise<void> | void;
  /** Checked before each chunk: stop (TransferStopped), keeping the session. */
  stopped?: () => boolean;
  chunkBytes?: number;
}

/** Ask the backup how much of a session it has; null if the session is gone. */
async function querySession(session: UploadSession): Promise<{ final: boolean; received: number } | null> {
  const res = await fetch(session.url, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'X-Goog-Upload-Command': 'query' },
  });
  if (!res.ok) return null;
  const status = header(res.headers, 'X-Goog-Upload-Status');
  const received = Number(header(res.headers, 'X-Goog-Upload-Size-Received'));
  if (status === 'final') return { final: true, received: session.sizeBytes };
  if (status !== 'active' || !Number.isFinite(received) || received < 0 || received > session.sizeBytes) return null;
  return { final: false, received };
}

/** Upload a segment's file (`sizeBytes` long); resolves to the size stored. */
export async function uploadSegment(
  uid: string,
  fileName: string,
  fileUri: string,
  sizeBytes: number,
  opts: UploadOptions = {},
): Promise<number> {
  const path = objectPath(uid, fileName);
  const chunkBytes = opts.chunkBytes ?? CHUNK_BYTES;
  let session = opts.session && opts.session.sizeBytes === sizeBytes ? opts.session : null;
  let offset = 0;
  if (session) {
    const state = await querySession(session);
    if (state?.final) {
      const info = await remoteInfo(uid, fileName);
      if (info) {
        await opts.onSession?.(null);
        return info.size;
      }
      session = null;
    } else if (state) {
      offset = state.received;
    } else {
      session = null;
    }
  }
  if (!session) {
    const start = await fetch(uploadUrl(bucketName(), path), {
      method: 'POST',
      headers: {
        ...(await authHeaders()),
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(sizeBytes),
        'X-Goog-Upload-Header-Content-Type': AUDIO_TYPE,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ name: path, contentType: AUDIO_TYPE }),
    });
    const url = header(start.headers, 'X-Goog-Upload-URL');
    if (!start.ok || !url) throw new CloudError(`Backup upload refused (${start.status})`, start.status);
    session = { url, offset: 0, sizeBytes };
    offset = 0;
    await opts.onSession?.(session);
  }
  const source = new File(fileUri);
  for (;;) {
    if (opts.stopped?.()) throw new TransferStopped();
    const length = Math.min(chunkBytes, sizeBytes - offset);
    const last = offset + length >= sizeBytes;
    const chunk = chunkFile(source, offset, length);
    let result: FileSystemUploadResult;
    try {
      result = await sendFile(session.url, chunk.uri, {
        ...(await authHeaders()),
        'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload',
        'X-Goog-Upload-Offset': String(offset),
      });
    } finally {
      if (chunk.exists) chunk.delete();
    }
    if (result.status < 200 || result.status >= 300) {
      // A refused chunk: the session is no use any more.
      if (result.status >= 400 && result.status < 500) await opts.onSession?.(null);
      throw new CloudError(`Backup upload failed (${result.status})`, result.status);
    }
    if (last) {
      await opts.onSession?.(null);
      try {
        const meta = JSON.parse(result.body) as { size?: string | number };
        return Number(meta.size ?? sizeBytes);
      } catch {
        return sizeBytes;
      }
    }
    offset += length;
    session = { ...session, offset };
    await opts.onSession?.(session);
  }
}

/**
 * Download a backed-up segment to `toUri` (a file on this phone). Fails if no
 * data arrives for `idleMs` (offline, say), instead of waiting indefinitely.
 */
export async function downloadSegment(uid: string, fileName: string, toUri: string, idleMs = 30_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const task = createDownloadResumable(
    `${objectUrl(bucketName(), objectPath(uid, fileName))}?alt=media`,
    toUri,
    { headers: await authHeaders(), sessionType: FileSystemSessionType.FOREGROUND },
    () => arm(),
  );
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      task.cancelAsync().catch(() => undefined);
    }, idleMs);
  };
  arm();
  try {
    const result = await track(
      task,
      async () => {
        const r = await task.downloadAsync();
        if (!r) throw new TransferStopped();
        return r;
      },
      false,
    );
    if (result.status < 200 || result.status >= 300) {
      throw new CloudError(`Download failed (${result.status})`, result.status);
    }
  } catch (err) {
    if (timedOut) throw new CloudError('Download timed out', 0);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The names of every file in the account's backup (for deleting all of it). */
export async function listSegments(uid: string): Promise<string[]> {
  const prefix = `recordings/${uid}/`;
  const names: string[] = [];
  let pageToken: string | undefined;
  do {
    const query = `prefix=${encodeURIComponent(prefix)}&delimiter=${encodeURIComponent('/')}${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    }`;
    const res = await fetch(`${STORAGE_HOST}/${bucketName()}/o?${query}`, { headers: await authHeaders() });
    if (!res.ok) throw new CloudError(`Backup listing failed (${res.status})`, res.status);
    const page = (await res.json()) as { items?: { name?: string }[]; nextPageToken?: string };
    for (const item of page.items ?? []) {
      if (item.name?.startsWith(prefix)) names.push(item.name.slice(prefix.length));
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return names;
}

/** Delete a backed-up segment (gone already counts as deleted). */
export async function deleteSegment(uid: string, fileName: string): Promise<void> {
  const res = await fetch(objectUrl(bucketName(), objectPath(uid, fileName)), {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok && res.status !== 404) throw new CloudError(`Backup delete failed (${res.status})`, res.status);
}
