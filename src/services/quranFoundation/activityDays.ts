import { QF_USER_CONFIG, QF_USER_API_BASE } from './config';
import { getValidUserAccessToken } from './oauth';
import { getSurahsForPage } from '../../lib/quranData';
import { logger } from '../../lib/logger';

// KFGQPC Madani 15-line — the same layout Revisely's page model is built on.
const MUSHAF_ID = '1';

// QF requires a positive seconds value for the activity day to register.
const MIN_SECONDS = 30;

export interface PostActivityDayInput {
  /** Pages the user revised in this session (Madani page numbers). */
  pages: number[];
  /** Time spent on the session, in minutes (from the local session log). */
  durationMinutes?: number | null;
}

/**
 * Build a coarse verse-range list from a set of revised pages. We don't have
 * verse-per-page metadata locally, so we mark engagement at the surah level
 * (`surah:1-surah:1`) for each unique surah touched. Improvable later by
 * calling the Content API's `/verses/by_page/{page}` for exact verse keys.
 */
function rangesFromPages(pages: number[]): string[] {
  const surahs = new Set<number>();
  for (const p of pages) {
    for (const s of getSurahsForPage(p)) {
      surahs.add(s.number);
    }
  }
  return Array.from(surahs)
    .sort((a, b) => a - b)
    .map((s) => `${s}:1-${s}:1`);
}

/**
 * POST today's revision session to QF's Activity Days API. Fire-and-forget:
 * callers should not await this in any user-facing flow — failures are
 * captured to Sentry but never block the local save.
 */
export async function postActivityDayForRevision(
  input: PostActivityDayInput,
): Promise<void> {
  if (input.pages.length === 0) return;

  const token = await getValidUserAccessToken();
  if (!token) return;

  const seconds = Math.max(
    MIN_SECONDS,
    Math.round((input.durationMinutes ?? 0) * 60),
  );

  const body = {
    type: 'QURAN',
    seconds,
    ranges: rangesFromPages(input.pages),
    mushafId: MUSHAF_ID,
  };

  try {
    const res = await fetch(`${QF_USER_API_BASE}/activity-days`, {
      method: 'POST',
      headers: {
        'x-auth-token': token,
        'x-client-id': QF_USER_CONFIG.clientId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('QF activity-day write failed', undefined, {
        status: res.status,
        body: text,
      });
    }
  } catch (err) {
    logger.error('QF activity-day request errored', err);
  }
}
