import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

const STORAGE_KEY = '@revisely_reading_history';
const MAX_ENTRIES = 50;

export interface ReadingHistoryEntry {
  pageNumber: number;
  lastReadAt: string;
}

async function readAll(): Promise<ReadingHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ReadingHistoryEntry[];
  } catch (err) {
    logger.warn('readingHistory: failed to read', err);
    return [];
  }
}

async function writeAll(entries: ReadingHistoryEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    logger.warn('readingHistory: failed to write', err);
  }
}

export async function appendReadingHistory(pageNumber: number): Promise<void> {
  const now = new Date().toISOString();
  const existing = await readAll();
  const without = existing.filter((e) => e.pageNumber !== pageNumber);
  const next: ReadingHistoryEntry[] = [
    { pageNumber, lastReadAt: now },
    ...without,
  ].slice(0, MAX_ENTRIES);
  await writeAll(next);
}

export async function getRecentReadingPages(
  limit = 3,
): Promise<ReadingHistoryEntry[]> {
  const all = await readAll();
  return all.slice(0, limit);
}

export async function clearReadingHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
