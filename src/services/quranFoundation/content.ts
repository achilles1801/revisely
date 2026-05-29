import { QF_CONTENT_CONFIG, QF_CONTENT_API_BASE } from './config';
import { getContentAccessToken } from './contentToken';

export interface Translation {
  resource_id: number;
  resource_name?: string;
  text: string;
}

export interface VerseWithTranslations {
  id: number;
  verse_key: string; // e.g. "2:255"
  text_uthmani?: string;
  translations: Translation[];
}

/**
 * Saheeh International on the QF Content API. Worth noting: this is QF's
 * internal resource id, not the quran.com app's translation id (which is
 * 131 — a common point of confusion). Mistaking the two yields a verses
 * response without any translations attached.
 */
export const DEFAULT_TRANSLATION_ID = 20;

type AuthHeaders = Record<string, string>;

async function authHeaders(): Promise<AuthHeaders> {
  const token = await getContentAccessToken();
  return {
    'x-auth-token': token,
    'x-client-id': QF_CONTENT_CONFIG.clientId,
  };
}

interface VerseRaw {
  id: number;
  verse_key: string;
  text_uthmani?: string;
  code_v2?: string;
  page_number?: number;
}

async function fetchVerses(pageNumber: number): Promise<VerseRaw[]> {
  const url = new URL(`${QF_CONTENT_API_BASE}/verses/by_page/${pageNumber}`);
  url.searchParams.set('fields', 'text_uthmani');
  url.searchParams.set('per_page', '50');

  const res = await fetch(url.toString(), { headers: await authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`QF verses fetch failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { verses?: VerseRaw[] };
  return data.verses ?? [];
}

async function fetchTranslationsForPage(
  pageNumber: number,
  translationId: number,
): Promise<{ resource_id: number; text: string }[]> {
  const url = new URL(
    `${QF_CONTENT_API_BASE}/quran/translations/${translationId}`,
  );
  url.searchParams.set('page_number', String(pageNumber));

  const res = await fetch(url.toString(), { headers: await authHeaders() });
  if (!res.ok) {
    // Translations not available for this page on this id — return empty so
    // the Arabic still renders rather than failing the whole call.
    return [];
  }
  const data = (await res.json()) as {
    translations?: { resource_id: number; text: string }[];
  };
  return data.translations ?? [];
}

/**
 * Fetch all verses on the given Madani-mushaf page, paired with an English
 * translation. The QF API treats verses and translations as two separate
 * endpoints (the inline `translations=` param on `verses/by_page` is silently
 * ignored), so this issues two parallel requests and zips them by order —
 * the translations endpoint returns one row per ayah on the page, in verse
 * order, so positional pairing is correct.
 */
export async function getVersesByPage(
  pageNumber: number,
  translationId: number = DEFAULT_TRANSLATION_ID,
): Promise<VerseWithTranslations[]> {
  const [verses, translations] = await Promise.all([
    fetchVerses(pageNumber),
    fetchTranslationsForPage(pageNumber, translationId),
  ]);

  return verses.map((v, i) => ({
    id: v.id,
    verse_key: v.verse_key,
    text_uthmani: v.text_uthmani,
    translations: translations[i] ? [translations[i]] : [],
  }));
}

