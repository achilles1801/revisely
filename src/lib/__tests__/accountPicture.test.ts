// The account's picture (ACCOUNT-8): the upload to the account's own folder, the sign-in profile's photo, and the old
// picture going when it was one of ours.
const mockUser = { uid: 'u1', photoURL: null as string | null, providerData: [] as { providerId: string; photoURL: string | null }[] };
const mockUpdateProfile = jest.fn(async (u: typeof mockUser, p: { photoURL: string | null }) => {
  u.photoURL = p.photoURL;
});
jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: mockUser }),
  updateProfile: (u: typeof mockUser, p: { photoURL: string | null }) => mockUpdateProfile(u, p),
}));
const mockUpload = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  createUploadTask: (...args: unknown[]) => ({ uploadAsync: () => mockUpload(...args) }),
  FileSystemSessionType: { FOREGROUND: 0 },
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));
jest.mock('expo-file-system', () => ({ File: class { size = 1234; } }));
jest.mock('../recordingCloud', () => ({
  authHeaders: async () => ({ Authorization: 'Firebase t' }),
  bucketName: () => 'b',
  CloudError: class extends Error {},
  objectUrl: (bucket: string, path: string) => `https://storage/v0/b/${bucket}/o/${encodeURIComponent(path)}`,
  uploadUrl: (bucket: string, path: string) => `https://storage/v0/b/${bucket}/o?name=${encodeURIComponent(path)}`,
}));

import { googlePhotoOf, ownPictureName, removePhoto, resetAccountPictureForTests, restoreGooglePhoto, setPhoto } from '../accountPicture';

const fetchMock = jest.fn();
beforeEach(() => {
  resetAccountPictureForTests();
  mockUser.photoURL = null;
  mockUser.providerData = [];
  mockUpdateProfile.mockClear();
  mockUpload.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

it('[ACCOUNT-8] uploads the photo to the account’s own folder and makes it the sign-in photo', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: (h: string) => (h === 'X-Goog-Upload-URL' ? 'https://session' : null) } });
  mockUpload.mockResolvedValueOnce({ status: 200, body: JSON.stringify({ downloadTokens: 'tok' }) });
  await setPhoto({ uri: 'file:///p.jpg', fileSize: 2000, mimeType: 'image/jpeg' });

  const [startUrl, start] = fetchMock.mock.calls[0];
  expect(startUrl).toMatch(/o\?name=users%2Fu1%2Fprofile%2Fpicture-\d+\.jpg$/);
  expect(start.headers['X-Goog-Upload-Header-Content-Type']).toBe('image/jpeg');
  expect(start.headers['X-Goog-Upload-Header-Content-Length']).toBe('2000');
  expect(mockUpload.mock.calls[0][0]).toBe('https://session');
  expect(mockUser.photoURL).toMatch(/\/o\/users%2Fu1%2Fprofile%2Fpicture-\d+\.jpg\?alt=media&token=tok$/);
});

it('[ACCOUNT-8] a new picture deletes the one before when it was ours, never Google’s', async () => {
  mockUser.photoURL = 'https://storage/v0/b/b/o/users%2Fu1%2Fprofile%2Fpicture-1.jpg?alt=media&token=old';
  mockUser.providerData = [{ providerId: 'google.com', photoURL: 'https://google/me.jpg' }];
  fetchMock.mockResolvedValue({ ok: true, status: 204, headers: { get: () => null } });
  await restoreGooglePhoto();
  expect(mockUser.photoURL).toBe('https://google/me.jpg');
  expect(fetchMock).toHaveBeenCalledWith('https://storage/v0/b/b/o/users%2Fu1%2Fprofile%2Fpicture-1.jpg', expect.objectContaining({ method: 'DELETE' }));

  fetchMock.mockClear();
  await removePhoto();
  expect(mockUser.photoURL).toBe('');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('a failed upload leaves the picture as it was', async () => {
  mockUser.photoURL = 'https://google/me.jpg';
  fetchMock.mockResolvedValueOnce({ ok: false, status: 403, headers: { get: () => null } });
  await expect(setPhoto({ uri: 'file:///p.jpg', fileSize: 10 })).rejects.toThrow();
  expect(mockUser.photoURL).toBe('https://google/me.jpg');
  expect(mockUpdateProfile).not.toHaveBeenCalled();
});

it('knows our pictures and Google’s', () => {
  expect(ownPictureName('https://x/o/users%2Fu1%2Fprofile%2Fpicture-9.png?alt=media&token=a')).toBe('picture-9.png');
  expect(ownPictureName('https://lh3.googleusercontent.com/a/b')).toBeNull();
  expect(googlePhotoOf({ providerData: [{ providerId: 'apple.com', photoURL: null }] } as never)).toBeNull();
});
