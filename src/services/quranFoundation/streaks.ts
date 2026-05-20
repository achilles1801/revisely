import { QF_USER_CONFIG, QF_USER_API_BASE } from './config';
import { getValidUserAccessToken } from './oauth';

export interface CurrentStreak {
  days: number;
  lastActiveDate: string | null;
}

/**
 * Fetch the user's current active streak from Quran Foundation. Returns null
 * when the user has not connected, or when the API responds with an error
 * we can recover from (treat as "no data yet" rather than crash the UI).
 */
export async function getCurrentStreak(): Promise<CurrentStreak | null> {
  const token = await getValidUserAccessToken();
  if (!token) return null;

  const res = await fetch(`${QF_USER_API_BASE}/streaks/current_streak_days`, {
    headers: {
      'x-auth-token': token,
      'x-client-id': QF_USER_CONFIG.clientId,
    },
  });

  if (!res.ok) {
    // 401 likely means the token was revoked server-side — caller can
    // decide whether to prompt re-auth; for now just return null.
    return null;
  }

  // Endpoint shape varies by version. Be defensive: read several likely keys.
  const data = (await res.json()) as Record<string, unknown>;
  const days =
    (typeof data.current_streak_days === 'number' && data.current_streak_days) ||
    (typeof data.days === 'number' && data.days) ||
    (typeof data.streak === 'number' && data.streak) ||
    0;
  const lastActiveDate =
    (typeof data.last_active_date === 'string' && data.last_active_date) ||
    (typeof data.last_activity_date === 'string' && data.last_activity_date) ||
    null;

  return { days, lastActiveDate };
}
