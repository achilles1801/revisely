// The account's picture, kept on the phone (HOME-8; Majd, Nov 26 2026: "my picture from my ring kind of lags a little
// bit before it actually loads ... make it instant"). A cold start used to show it only once Firebase Auth had checked
// the saved sign-in (it can take seconds, AUTH_GRACE_MS opens Home before) and the photo had been fetched again
// (Storage's links send no cache headers). Now:
// - the link and a copy of the photo are kept per account (AsyncStorage, read as the app starts, as homePrefs does; the
//   file in Documents/account-photo/), so Home's first frame draws it from the phone;
// - once Auth has the account, its photo is the one shown; a different one is downloaded first and replaces the old
//   only when it is on the phone (no blank, no flash), and a photo removed elsewhere is forgotten here too.
import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { downloadAsync } from 'expo-file-system/legacy';
import { logger } from './logger';

export const PHOTO_KEY = '@revisely_account_photo:v1';
const FOLDER = 'account-photo';

interface Kept {
  /** The photo's link (the sign-in profile's). */
  url: string;
  /** Its copy in Documents/account-photo/, by name (the folder's path changes with app updates), once downloaded. */
  name: string | null;
}

let kept: Record<string, Kept> = {};
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function parse(raw: string | null): Record<string, Kept> {
  try {
    const v = raw ? (JSON.parse(raw) as Record<string, Partial<Kept>>) : {};
    const out: Record<string, Kept> = {};
    for (const [uid, k] of Object.entries(v ?? {})) {
      if (k && typeof k.url === 'string' && k.url) out[uid] = { url: k.url, name: typeof k.name === 'string' ? k.name : null };
    }
    return out;
  } catch {
    return {};
  }
}

// Read as the app starts (before the account's copy has opened Home): the first frame has it.
const reading = AsyncStorage.getItem(PHOTO_KEY)
  .then((raw) => {
    kept = { ...parse(raw), ...kept };
  })
  .catch(() => undefined)
  .finally(() => {
    loaded = true;
    emit();
  });

function save(): void {
  AsyncStorage.setItem(PHOTO_KEY, JSON.stringify(kept)).catch(() => undefined);
}

function folder(): Directory {
  return new Directory(Paths.document, FOLDER);
}

/** The copy's file:// link, if it is on the phone. */
function localUri(k: Kept | undefined): string | null {
  if (!k?.name) return null;
  try {
    const f = new File(folder(), k.name);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}

function nameFor(uid: string, url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return `${uid.replace(/[^A-Za-z0-9_-]/g, '')}-${h.toString(36)}.img`;
}

function remove(name: string | null): void {
  if (!name) return;
  try {
    const f = new File(folder(), name);
    if (f.exists) f.delete();
  } catch {
    // Gone already, or never written.
  }
}

const downloading = new Set<string>();

/** Keeps `url` as the account's photo: its link at once, its copy once downloaded (the old copy goes then). */
async function keep(uid: string, url: string): Promise<void> {
  const had = kept[uid];
  if (!had || had.url !== url) {
    // The link now: the next cold start draws it even if the download hasn't finished.
    kept = { ...kept, [uid]: { url, name: had?.url === url ? had.name : null } };
    save();
  }
  if (localUri(kept[uid]) || downloading.has(url)) return;
  downloading.add(url);
  try {
    const dir = folder();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const name = nameFor(uid, url);
    const result = await downloadAsync(url, new File(dir, name).uri);
    if (result.status < 200 || result.status >= 300) throw new Error(`Picture download failed (${result.status})`);
    if (kept[uid]?.url !== url) return remove(name); // replaced meanwhile
    const old = had?.name && had.name !== name ? had.name : null;
    kept = { ...kept, [uid]: { url, name } };
    save();
    emit();
    remove(old);
  } catch (err) {
    logger.warn('Account picture: no copy on the phone', err);
  } finally {
    downloading.delete(url);
  }
}

function forget(uid: string): void {
  const had = kept[uid];
  if (!had) return;
  const { [uid]: _gone, ...rest } = kept;
  kept = rest;
  save();
  emit();
  remove(had.name);
}

/**
 * The picture to draw for `uid`: undefined until the phone's copy has been read (a moment as the app starts), then the
 * kept copy (or link) at once. `live` is what the account says now (the sign-in profile's photo, or null for none):
 * undefined while Auth hasn't answered. A new photo shows once it is on the phone; until then the old one stays.
 */
export function usePhotoOnPhone(uid: string | null | undefined, live: string | null | undefined): string | null | undefined {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => (loaded ? kept : undefined),
  );
  const k = uid ? kept[uid] : undefined;
  useEffect(() => {
    if (!uid || !loaded || live === undefined) return;
    if (live == null) forget(uid);
    else void keep(uid, live);
  }, [uid, live, k?.url, k?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!uid) return null;
  if (!loaded) return undefined;
  if (live === null) return null;
  const local = localUri(k);
  if (live === undefined) return local ?? k?.url ?? null;
  if (k?.url === live) return local ?? live;
  // A new photo: the old one's copy until the new one is on the phone; the first ever, straight from its link.
  return local ?? live;
}

/** Tests only: the phone's copy as read at start. */
export function photoOnPhoneReady(): Promise<void> {
  return reading;
}

/** Tests only. */
export function resetPhotoOnPhoneForTests(next: Record<string, Kept> = {}): void {
  kept = next;
  loaded = true;
  downloading.clear();
  listeners.clear();
}
