// The last few searches, kept on this phone per account (shown before anything is typed).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../logger';

const MAX = 8;
const keyFor = (uid: string) => `@revisely_quran_search:v1:${uid}`;

export async function getRecentSearches(uid: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(uid));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch (err) {
    logger.warn('Could not read recent searches', err);
    return [];
  }
}

/** The search first, without an earlier copy of it. */
export async function addRecentSearch(uid: string, text: string): Promise<string[]> {
  const query = text.trim();
  const list = await getRecentSearches(uid);
  if (!query) return list;
  const next = [query, ...list.filter((q) => q !== query)].slice(0, MAX);
  try {
    await AsyncStorage.setItem(keyFor(uid), JSON.stringify(next));
  } catch (err) {
    logger.warn('Could not save a recent search', err);
  }
  return next;
}

export async function clearRecentSearches(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(uid));
  } catch (err) {
    logger.warn('Could not clear recent searches', err);
  }
}
