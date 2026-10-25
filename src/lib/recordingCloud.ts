// The network side of recording backup: Firebase Storage over its REST API.
//
// Files live at recordings/<uid>/<id>-<n>.m4a in the project's bucket; the
// Storage rules let only the account itself read, write or delete them (and only
// audio, at most 200 MB a file). An upload is the resumable protocol the
// Firebase SDK uses: a small request declares the file (its name, type and
// size, which the rules check), then the file goes in one request on an iOS
// background session (expo-file-system's uploadAsync), so it carries on while
// the app is in the background. If it is cut off, the next run finds the file
// missing or short and uploads it again. Requests carry the user's Firebase ID
// token and, when there is one, an App Check token.

import Constants from 'expo-constants';
import { getAuth } from 'firebase/auth';
import { downloadAsync, FileSystemSessionType, FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { getAppCheckToken } from './appCheck';

export const STORAGE_HOST = 'https://firebasestorage.googleapis.com/v0/b';

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

export const AUDIO_TYPE = 'audio/mp4';

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

/** The backed-up file's size, or null if it isn't there. */
export async function remoteSize(uid: string, fileName: string): Promise<number | null> {
  const res = await fetch(objectUrl(bucketName(), objectPath(uid, fileName)), { headers: await authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new CloudError(`Backup check failed (${res.status})`, res.status);
  const meta = (await res.json()) as { size?: string | number };
  return meta.size != null ? Number(meta.size) : null;
}

/** Upload a segment's file (`sizeBytes` long); resolves to the size stored. */
export async function uploadSegment(uid: string, fileName: string, fileUri: string, sizeBytes: number): Promise<number> {
  const path = objectPath(uid, fileName);
  const headers = await authHeaders();
  const start = await fetch(uploadUrl(bucketName(), path), {
    method: 'POST',
    headers: {
      ...headers,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(sizeBytes),
      'X-Goog-Upload-Header-Content-Type': AUDIO_TYPE,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ name: path, contentType: AUDIO_TYPE }),
  });
  const sessionUrl = start.headers.get('X-Goog-Upload-URL');
  if (!start.ok || !sessionUrl) throw new CloudError(`Backup upload refused (${start.status})`, start.status);
  const result = await uploadAsync(sessionUrl, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    sessionType: FileSystemSessionType.BACKGROUND,
    headers: { ...headers, 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0' },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new CloudError(`Backup upload failed (${result.status})`, result.status);
  }
  try {
    const meta = JSON.parse(result.body) as { size?: string | number };
    return Number(meta.size ?? 0);
  } catch {
    return 0;
  }
}

/** Download a backed-up segment to `toUri` (a file on this phone). */
export async function downloadSegment(uid: string, fileName: string, toUri: string): Promise<void> {
  const result = await downloadAsync(`${objectUrl(bucketName(), objectPath(uid, fileName))}?alt=media`, toUri, {
    headers: await authHeaders(),
  });
  if (result.status < 200 || result.status >= 300) {
    throw new CloudError(`Download failed (${result.status})`, result.status);
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
