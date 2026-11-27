// The account's picture (ACCOUNT-8; Majd, Nov 26 2026: "im guessing they can upload any pfp?"): a photo chosen from the
// library or taken with the camera (Revisely Dev's image picker, modules-dev/expo-image-picker, once its native build is
// on the phone), the photo Google sign-in gives, or none (the first letter). It is the account's own: the file sits in
// Storage under users/<uid>/profile/ (storage.rules: the account alone reads and writes it; deleting the account removes
// it), and its link is the sign-in profile's photo (Firebase Auth), which only the account reads.
import { useSyncExternalStore } from 'react';
import { requireOptionalNativeModule } from 'expo';
import { getAuth, updateProfile, type User as FirebaseUser } from 'firebase/auth';
import { createUploadTask, FileSystemSessionType, FileSystemUploadType } from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import { authHeaders, bucketName, CloudError, objectUrl, uploadUrl } from './recordingCloud';
import { isDevVariant } from './variant';
import { logger } from './logger';
import { usePhotoOnPhone } from './photoOnPhone';

// ------------------------------------------------------------------ the picker (Revisely Dev's native module)

interface PickedAsset {
  uri: string;
  fileSize?: number;
  mimeType?: string;
}
interface PickerResult {
  canceled: boolean;
  assets: PickedAsset[] | null;
}
interface PickerModule {
  launchImageLibraryAsync(options: object): Promise<PickerResult>;
  launchCameraAsync(options: object): Promise<PickerResult>;
  requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
}

let picker: PickerModule | null | undefined;

/** The image picker, when this binary has it (Revisely Dev with the native batch); null otherwise. */
function imagePicker(): PickerModule | null {
  if (picker === undefined) picker = isDevVariant() ? requireOptionalNativeModule<PickerModule>('ExponentImagePicker') : null;
  return picker;
}

/** Whether a photo can be chosen or taken on this phone. */
export const canPickPhoto = (): boolean => imagePicker() != null;

// A square photo, compressed: a picture shown at 88pt at most.
const PICK_OPTIONS = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, exif: false, base64: false };

/** A photo from the library or the camera, or null when cancelled (or the camera refused). */
export async function pickPhoto(from: 'library' | 'camera'): Promise<PickedAsset | null> {
  const p = imagePicker();
  if (!p) return null;
  if (from === 'camera') {
    const { granted } = await p.requestCameraPermissionsAsync();
    if (!granted) return null;
  }
  const result = from === 'camera' ? await p.launchCameraAsync(PICK_OPTIONS) : await p.launchImageLibraryAsync(PICK_OPTIONS);
  return result.canceled ? null : (result.assets?.[0] ?? null);
}

// ------------------------------------------------------------------ the picture now (live)

let override: { uid: string; url: string | null } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * The account's picture to draw: its sign-in profile's photo, or the one just set on this phone (the profile has it too),
 * kept on the phone (lib/photoOnPhone) so Home's first frame has it before Auth has checked the saved sign-in (HOME-8).
 * `uid` is the account the app shows (its copy's, which can open before Auth has a user). Undefined only for the moment
 * the phone's copy is being read as the app starts.
 */
export function useAccountPhoto(user: FirebaseUser | null | undefined, uid: string | null | undefined): string | null | undefined {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => override,
  );
  const account = uid ?? user?.uid ?? null;
  // What the account says now; undefined until Auth has this account.
  const live =
    override && override.uid === account ? override.url : user && user.uid === account ? user.photoURL || null : undefined;
  return usePhotoOnPhone(account, live);
}

/** The picture's link as the account has it now (not the phone's copy): the one just set here, or the profile's. */
export function accountPhotoLink(user: FirebaseUser | null | undefined): string | null {
  if (!user) return null;
  if (override && override.uid === user.uid) return override.url;
  return user.photoURL || null;
}

/** The photo Google sign-in gives this account, or null (Apple and email sign-ins give none). */
export function googlePhotoOf(user: FirebaseUser | null | undefined): string | null {
  return user?.providerData?.find((p) => p.providerId === 'google.com')?.photoURL ?? null;
}

async function setProfilePhoto(url: string | null): Promise<void> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not signed in.');
  // An empty photo clears it: Auth refuses null (the emulator says so; the service treats "" as none).
  await updateProfile(user, { photoURL: url ?? '' });
  override = { uid: user.uid, url };
  emit();
}

const OWN = /\/o\/users%2F[^%]+%2Fprofile%2F([^?]+)/;

/** The file name of a picture this app uploaded, from its link; null for Google's or none. */
export function ownPictureName(url: string | null | undefined): string | null {
  const m = url ? OWN.exec(url) : null;
  return m ? decodeURIComponent(m[1]) : null;
}

async function deleteOwn(uid: string, url: string | null | undefined): Promise<void> {
  const name = ownPictureName(url);
  if (!name) return;
  try {
    await fetch(objectUrl(bucketName(), `users/${uid}/profile/${name}`), { method: 'DELETE', headers: await authHeaders() });
  } catch (err) {
    logger.warn('Account picture: the old picture could not be deleted', err);
  }
}

/** Uploads the photo to the account's own folder and makes it the picture; the one before (if it was ours) goes. */
export async function setPhoto(asset: PickedAsset): Promise<void> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not signed in.');
  const before = user.photoURL;
  const type = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  const name = `picture-${Date.now()}.${type === 'image/png' ? 'png' : 'jpg'}`;
  const path = `users/${user.uid}/profile/${name}`;
  const size = asset.fileSize ?? new File(asset.uri).size ?? 0;
  const bucket = bucketName();
  const start = await fetch(uploadUrl(bucket, path), {
    method: 'POST',
    headers: {
      ...(await authHeaders()),
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': type,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ name: path, contentType: type }),
  });
  const session = start.headers.get('X-Goog-Upload-URL') ?? start.headers.get('x-goog-upload-url');
  if (!start.ok || !session) throw new CloudError(`Picture upload refused (${start.status})`, start.status || 500);
  const task = createUploadTask(session, asset.uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    sessionType: FileSystemSessionType.FOREGROUND,
    headers: { ...(await authHeaders()), 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0' }, // i18n-ignore (the protocol's words)
  });
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new CloudError(`Picture upload failed (${result?.status ?? 0})`, result?.status ?? 500);
  }
  const meta = JSON.parse(result.body) as { downloadTokens?: string };
  const token = meta.downloadTokens?.split(',')[0];
  if (!token) throw new CloudError('Picture upload gave no link', 500);
  await setProfilePhoto(`${objectUrl(bucket, path)}?alt=media&token=${token}`);
  await deleteOwn(user.uid, before);
}

/** Google's photo as the picture again. */
export async function restoreGooglePhoto(): Promise<void> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not signed in.');
  const before = user.photoURL;
  await setProfilePhoto(googlePhotoOf(user));
  await deleteOwn(user.uid, before);
}

/** No picture: the first letter. */
export async function removePhoto(): Promise<void> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not signed in.');
  const before = user.photoURL;
  await setProfilePhoto(null);
  await deleteOwn(user.uid, before);
}

/** Tests only. */
export function resetAccountPictureForTests(): void {
  override = null;
  picker = undefined;
  listeners.clear();
}
