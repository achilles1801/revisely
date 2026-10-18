// English translation (Saheeh International) of a mushaf page, from the public
// alquran.cloud API, which numbers pages the same way as the Madani mushaf
// images. Each page is fetched once, then read from the caches directory.

import { Directory, File, Paths } from 'expo-file-system';
import { logger } from './logger';

const EDITION = 'en.sahih';
export const TRANSLATION_NAME = 'Saheeh International';

export interface TranslatedAyah {
  surahNumber: number;
  surahName: string;
  ayahNumber: number;
  text: string;
}

const memory = new Map<number, TranslatedAyah[]>();

function cacheFile(pageNumber: number): File | null {
  try {
    const dir = new Directory(Paths.cache, 'translation', EDITION);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    return new File(dir, `${pageNumber}.json`);
  } catch (err) {
    logger.warn('Translation cache unavailable', err);
    return null;
  }
}

interface ApiAyah {
  numberInSurah: number;
  text: string;
  surah: { number: number; englishName: string };
}

/** Exported for tests: the API response to our shape. */
export function parsePageResponse(json: unknown): TranslatedAyah[] {
  const ayahs = (json as { data?: { ayahs?: ApiAyah[] } })?.data?.ayahs;
  if (!Array.isArray(ayahs) || ayahs.length === 0) {
    throw new Error('Unexpected translation response');
  }
  return ayahs.map((a) => ({
    surahNumber: a.surah.number,
    surahName: a.surah.englishName,
    ayahNumber: a.numberInSurah,
    text: a.text,
  }));
}

export async function getPageTranslation(pageNumber: number): Promise<TranslatedAyah[]> {
  const known = memory.get(pageNumber);
  if (known) return known;

  const file = cacheFile(pageNumber);
  if (file?.exists) {
    try {
      const cached = JSON.parse(await file.text()) as TranslatedAyah[];
      memory.set(pageNumber, cached);
      return cached;
    } catch {
      // Unreadable cache: fetch again below.
    }
  }

  const res = await fetch(`https://api.alquran.cloud/v1/page/${pageNumber}/${EDITION}`);
  if (!res.ok) throw new Error(`Translation request failed (${res.status})`);
  const ayahs = parsePageResponse(await res.json());
  memory.set(pageNumber, ayahs);
  try {
    if (file) {
      if (!file.exists) file.create();
      file.write(JSON.stringify(ayahs));
    }
  } catch (err) {
    logger.warn('Could not cache translation', err);
  }
  return ayahs;
}
