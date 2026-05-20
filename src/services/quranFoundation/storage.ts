import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@revisely_qf_user_token';

export interface QFUserSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // ms epoch
  scope: string;
}

export async function saveQFSession(session: QFUserSession): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(session));
}

export async function loadQFSession(): Promise<QFUserSession | null> {
  const raw = await AsyncStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as QFUserSession;
  } catch {
    return null;
  }
}

export async function clearQFSession(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}
