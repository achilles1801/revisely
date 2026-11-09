// The account as the server last gave it, kept on the phone so the app opens
// with it at once, online or not. Firestore's JavaScript SDK keeps nothing on
// disk in React Native (IndexedDB doesn't exist there), so without this every
// cold start waited for the server, and offline it waited forever.
//
// Only what the server sent is stored here (never a snapshot built from the
// empty local cache): changes not yet on the server live in the outbox.
// Signing out deletes it; the outbox is kept for the next sign-in.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirestorePage, FirestoreSession, FirestoreUser } from '../../types/firestore';
import { decode, encode } from './codec';
import { logger } from '../logger';

export type AccountPart = 'user' | 'pages' | 'sessions';

const key = (uid: string, part: AccountPart) => `@revisely_account:v1:${uid}:${part}`;
const PARTS: AccountPart[] = ['user', 'pages', 'sessions'];

export interface CachedAccount {
  user: FirestoreUser;
  pages: FirestorePage[];
  sessions: FirestoreSession[];
}

/**
 * The account's copy, or null without a usable one: the user document and its
 * pages are both needed (sessions may be missing: none yet).
 */
export async function readAccount(uid: string): Promise<CachedAccount | null> {
  try {
    const rows = await AsyncStorage.multiGet(PARTS.map((p) => key(uid, p)));
    const [user, pages, sessions] = rows.map(([, value]) => value);
    const u = decode<FirestoreUser>(user);
    const p = decode<FirestorePage[]>(pages);
    if (!u || !Array.isArray(p) || p.length === 0) return null;
    const s = decode<FirestoreSession[]>(sessions);
    return { user: u, pages: p, sessions: Array.isArray(s) ? s : [] };
  } catch (err) {
    logger.warn('Could not read the account copy', err);
    return null;
  }
}

export async function writeAccountPart(uid: string, part: AccountPart, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key(uid, part), encode(value));
  } catch (err) {
    logger.warn('Could not save the account copy', err);
  }
}

/** Deletes the account's copy (or only some parts of it). */
export async function clearAccount(uid: string, parts: AccountPart[] = PARTS): Promise<void> {
  try {
    await AsyncStorage.multiRemove(parts.map((p) => key(uid, p)));
  } catch (err) {
    logger.warn('Could not delete the account copy', err);
  }
}
