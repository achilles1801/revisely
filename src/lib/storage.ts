import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UserPage, RevisionLog } from '../types';

const KEYS = {
  USER: '@revision_buddy_user',
  PAGES: '@revision_buddy_pages',
  LOGS: '@revision_buddy_logs',
  ONBOARDING_COMPLETE: '@revision_buddy_onboarding',
};

// User
export async function getUser(): Promise<User | null> {
  const data = await AsyncStorage.getItem(KEYS.USER);
  return data ? JSON.parse(data) : null;
}

export async function saveUser(user: User): Promise<void> {
  await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
}

// Pages
export async function getPages(): Promise<UserPage[]> {
  const data = await AsyncStorage.getItem(KEYS.PAGES);
  return data ? JSON.parse(data) : initializePages();
}

export async function savePages(pages: UserPage[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.PAGES, JSON.stringify(pages));
}

// Logs
export async function getLogs(): Promise<RevisionLog[]> {
  const data = await AsyncStorage.getItem(KEYS.LOGS);
  return data ? JSON.parse(data) : [];
}

export async function addLog(log: RevisionLog): Promise<void> {
  const logs = await getLogs();
  logs.unshift(log); // Add to beginning
  await AsyncStorage.setItem(KEYS.LOGS, JSON.stringify(logs.slice(0, 100))); // Keep last 100
}

export async function deleteLog(logId: string): Promise<void> {
  const logs = await getLogs();
  const filteredLogs = logs.filter(log => log.id !== logId);
  await AsyncStorage.setItem(KEYS.LOGS, JSON.stringify(filteredLogs));
}

export async function saveLogs(logs: RevisionLog[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.LOGS, JSON.stringify(logs.slice(0, 100)));
}

// Onboarding
export async function isOnboardingComplete(): Promise<boolean> {
  const data = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETE);
  return data === 'true';
}

export async function setOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETE, 'true');
}

// Initialize 604 pages with default values
function initializePages(): UserPage[] {
  return Array.from({ length: 604 }, (_, i) => ({
    pageNumber: i + 1,
    status: 'not_memorized',
    dateMemorized: null,
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  }));
}

