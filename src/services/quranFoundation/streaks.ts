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

  // `type=QURAN` is required — QF distinguishes reading-streak types and
  // returns 422 without it.
  const res = await fetch(
    `${QF_USER_API_BASE}/streaks/current-streak-days?type=QURAN`,
    {
      headers: {
        'x-auth-token': token,
        'x-client-id': QF_USER_CONFIG.clientId,
      },
    },
  );

  if (!res.ok) return null;

  // Response shape per QF docs: { success: true, data: { days: number } }
  const body = (await res.json()) as {
    data?: { days?: number; last_active_date?: string };
  };
  return {
    days: body.data?.days ?? 0,
    lastActiveDate: body.data?.last_active_date ?? null,
  };
}
