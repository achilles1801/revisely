// Verse text for the verse sheet: the Arabic (Uthmani) and a chosen translation.
//
// Sources: the public alquran.cloud API, which numbers pages the same way as the
// Madani mushaf images. Each edition is fetched once per page and then read from
// the caches directory; a verse carried over from the previous page is listed
// under that page by the API, so it is fetched on its own.
//
// Translations are listed in TRANSLATIONS. The Clear Quran® (Dr. Mustafa
// Khattab) is licensed: its text comes from The Clear Quran API through our
// worker (lib/clearQuran), is never stored on the device, and its publisher
// requires the credit line (`credit`) wherever it is shown. One that is not
// `available` is shown in the picker as unavailable.

import { Directory, File, Paths } from 'expo-file-system';
import { logger } from './logger';
import { getClearQuranVerse, peekClearQuranVerse, prefetchClearQuran, prefetchClearQuranAround } from './clearQuran';
import { nextVerse, pageOfVerse, previousVerse, VerseKey } from './verses';

export interface TranslationInfo {
  id: string;
  name: string;
  author: string;
  language: string;
  /** alquran.cloud edition identifier. */
  edition: string | null;
  available: boolean;
  /** Required attribution, shown with the text and in the picker. */
  credit?: { text: string; linkLabel: string; url: string };
}

export const CLEAR_QURAN_ID = 'en.khattab';

export const TRANSLATIONS: TranslationInfo[] = [
  {
    id: 'en.sahih',
    name: 'Saheeh International',
    author: 'Saheeh International',
    language: 'English',
    edition: 'en.sahih',
    available: true,
  },
  {
    id: CLEAR_QURAN_ID,
    name: 'The Clear Quran®',
    author: 'Dr. Mustafa Khattab',
    language: 'English',
    edition: null,
    available: true,
    credit: {
      text: 'The Clear Quran® by Dr. Mustafa Khattab',
      linkLabel: 'theclearquran.org',
      url: 'https://theclearquran.org',
    },
  },
];

export const DEFAULT_TRANSLATION_ID = 'en.sahih';
const ARABIC_EDITION = 'quran-uthmani';

/** Can be chosen. */
export function isTranslationAvailable(t: TranslationInfo): boolean {
  return t.available;
}

/** Shown in the picker: "The Clear Quran® — Dr. Mustafa Khattab". */
export function pickerTitle(t: TranslationInfo): string {
  return t.credit ? `${t.name} — ${t.author}` : t.name;
}

/** The translation to use for a saved choice, falling back to the default. */
export function resolveTranslation(id: string | null | undefined): TranslationInfo {
  const chosen = TRANSLATIONS.find((t) => t.id === id && isTranslationAvailable(t));
  return chosen ?? (TRANSLATIONS.find((t) => t.id === DEFAULT_TRANSLATION_ID) as TranslationInfo);
}

export interface TranslatedAyah {
  surahNumber: number;
  surahName: string;
  ayahNumber: number;
  text: string;
}

const memory = new Map<string, TranslatedAyah[]>();

function cacheFile(edition: string, pageNumber: number): File | null {
  try {
    const dir = new Directory(Paths.cache, 'translation', edition);
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

/** Every verse that starts on `pageNumber`, in one edition. */
export async function getPageEdition(
  pageNumber: number,
  edition: string = 'en.sahih',
): Promise<TranslatedAyah[]> {
  const key = `${edition}/${pageNumber}`;
  const known = memory.get(key);
  if (known) return known;

  const file = cacheFile(edition, pageNumber);
  if (file?.exists) {
    try {
      const cached = JSON.parse(await file.text()) as TranslatedAyah[];
      memory.set(key, cached);
      return cached;
    } catch {
      // Unreadable cache: fetch again below.
    }
  }

  const res = await fetch(`https://api.alquran.cloud/v1/page/${pageNumber}/${edition}`);
  if (!res.ok) throw new Error(`Translation request failed (${res.status})`);
  const ayahs = parsePageResponse(await res.json());
  memory.set(key, ayahs);
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

/** Kept for the existing callers. */
export function getPageTranslation(pageNumber: number): Promise<TranslatedAyah[]> {
  return getPageEdition(pageNumber, 'en.sahih');
}

const singleAyahs = new Map<string, TranslatedAyah>();

/** One verse shown on `page`, in one edition. */
export async function getAyahEdition(
  page: number,
  sura: number,
  ayah: number,
  edition: string,
): Promise<TranslatedAyah> {
  const key = `${sura}:${ayah}`;
  const single = singleAyahs.get(`${edition}/${key}`);
  if (single) return single;
  try {
    const onPage = (await getPageEdition(page, edition)).find(
      (a) => a.surahNumber === sura && a.ayahNumber === ayah,
    );
    if (onPage) return onPage;
  } catch {
    // Fall through to the single-verse request.
  }
  const res = await fetch(`https://api.alquran.cloud/v1/ayah/${key}/${edition}`);
  if (!res.ok) throw new Error(`Translation request failed (${res.status})`);
  const json = (await res.json()) as { data?: ApiAyah };
  if (!json.data?.surah) throw new Error('Unexpected translation response');
  const result = parsePageResponse({ data: { ayahs: [json.data] } })[0];
  singleAyahs.set(`${edition}/${key}`, result);
  return result;
}

/** Kept for the existing callers: one verse in Saheeh International. */
export function getAyahTranslation(page: number, sura: number, ayah: number) {
  return getAyahEdition(page, sura, ayah, 'en.sahih');
}

export interface VerseText {
  sura: number;
  ayah: number;
  surahName: string;
  arabic: string;
  translation: string;
  translationName: string;
}

function compose(
  t: TranslationInfo,
  sura: number,
  ayah: number,
  arabic: TranslatedAyah,
  translation: string,
  surahName: string,
): VerseText {
  return {
    sura,
    ayah,
    surahName,
    arabic: stripBismillah(arabic.text, sura, ayah),
    translation,
    translationName: t.name,
  };
}

/** The Arabic and the chosen translation of one verse. */
export async function getVerseText(
  page: number,
  sura: number,
  ayah: number,
  translationId?: string | null,
): Promise<VerseText> {
  const t = resolveTranslation(translationId);
  if (t.id === CLEAR_QURAN_ID) {
    // Its own source; if it fails, the sheet says so (never another translation).
    const [arabic, text] = await Promise.all([
      getAyahEdition(page, sura, ayah, ARABIC_EDITION),
      getClearQuranVerse(sura, ayah),
    ]);
    return compose(t, sura, ayah, arabic, text, arabic.surahName);
  }
  const [arabic, translated] = await Promise.all([
    getAyahEdition(page, sura, ayah, ARABIC_EDITION),
    getAyahEdition(page, sura, ayah, t.edition as string),
  ]);
  return compose(t, sura, ayah, arabic, translated.text, translated.surahName);
}

/** One verse of an edition, if this launch already has it in memory. */
function peekAyahEdition(page: number, sura: number, ayah: number, edition: string): TranslatedAyah | null {
  return (
    singleAyahs.get(`${edition}/${sura}:${ayah}`) ??
    memory.get(`${edition}/${page}`)?.find((a) => a.surahNumber === sura && a.ayahNumber === ayah) ??
    null
  );
}

/** What getVerseText would give, if everything it needs is already in memory; else null. */
export function peekVerseText(
  page: number,
  sura: number,
  ayah: number,
  translationId?: string | null,
): VerseText | null {
  const t = resolveTranslation(translationId);
  const arabic = peekAyahEdition(page, sura, ayah, ARABIC_EDITION);
  if (!arabic) return null;
  if (t.id === CLEAR_QURAN_ID) {
    const text = peekClearQuranVerse(sura, ayah);
    return text === undefined ? null : compose(t, sura, ayah, arabic, text, arabic.surahName);
  }
  const translated = peekAyahEdition(page, sura, ayah, t.edition as string);
  return translated ? compose(t, sura, ayah, arabic, translated.text, translated.surahName) : null;
}

/** Starts loading a verse's Arabic and translation (a press and hold on it). Never fails. */
export function prefetchVerseText(page: number, sura: number, ayah: number, translationId?: string | null): void {
  const t = resolveTranslation(translationId);
  getAyahEdition(page, sura, ayah, ARABIC_EDITION).catch(() => undefined);
  if (t.id === CLEAR_QURAN_ID) prefetchClearQuran(sura, ayah);
  else getAyahEdition(page, sura, ayah, t.edition as string).catch(() => undefined);
}

/**
 * The verses before and after `v`, loaded while it is shown, so previous / next
 * shows at once. The Clear Quran looks two verses ahead (its next block takes
 * seconds); the rest comes by page, so one verse is enough.
 */
export function prefetchVerseNeighbours(v: VerseKey, translationId?: string | null): void {
  for (const n of [nextVerse(v), previousVerse(v)]) {
    if (n) prefetchVerseText(pageOfVerse(n), n.sura, n.ayah, translationId);
  }
  if (resolveTranslation(translationId).id === CLEAR_QURAN_ID) prefetchClearQuranAround(v, 2);
}

// alquran.cloud prefixes the first verse of every surah (except Al-Fatihah,
// where it is verse 1, and At-Tawbah, which has none) with the basmala.
export function stripBismillah(text: string, sura: number, ayah: number): string {
  if (ayah !== 1 || sura === 1 || sura === 9) return text;
  const words = text.trim().split(/\s+/);
  // The basmala is four words; its first is "bismi" (بِسْمِ).
  if (words.length > 4 && words[0].startsWith('بِسْمِ')) return words.slice(4).join(' ');
  return text;
}
