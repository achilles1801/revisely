// Verse text for the verse sheet: the Arabic (Uthmani) and a chosen translation.
//
// The Arabic is Tanzil Project's Uthmani text, from the public alquran.cloud API,
// which numbers pages the same way as the Madani mushaf images. It is fetched
// once per page and then read from the caches directory; a verse carried over
// from the previous page is listed under that page by the API, so it is fetched
// on its own. It is also downloaded whole with the offline mushaf
// (downloadArabicText: one request, ~2 MB) and kept in the documents directory,
// so the verse sheet's Arabic and Copy / Share work offline. Tanzil's terms
// allow verbatim copies if the source is named with a link to tanzil.net
// (ARABIC_CREDIT, under every verse in the sheet) and its notice stays in every
// copy (TANZIL_NOTICE, in the downloaded file).
//
// Translations are listed in TRANSLATIONS, each with the credit its licence
// requires (shown with the text and in the picker):
// - Saheeh International comes from QuranEnc.com (lib/saheeh), whose terms let
//   it be downloaded and kept: it is kept on the phone as read, and whole with
//   the offline mushaf. Its credit names the version shown (creditLine).
// - The Clear Quran® (Dr. Mustafa Khattab) comes from The Clear Quran API
//   through our worker (lib/clearQuran), is kept on the phone only as read (the
//   owner's decision of Oct 27 2026), never the whole of it: its terms don't
//   allow more. Offline, a verse not read before can't be shown, and the sheet
//   says so (pointing to Saheeh International when that is on the phone).
// One that is not `available` is shown in the picker as unavailable.

import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import RecitationAudio from '../../modules/recitation-audio';
import { logger } from './logger';
import { getClearQuranVerse, peekClearQuranVerse, prefetchClearQuran, prefetchClearQuranAround } from './clearQuran';
import { getSaheehVerse, peekSaheehVerse, prefetchSaheeh, SAHEEH_PAGE_URL } from './saheeh';
import { nextVerse, pageOfVerse, previousVerse, VerseKey } from './verses';

export interface TranslationInfo {
  id: string;
  name: string;
  author: string;
  language: string;
  /** Where its text comes from: lib/saheeh (QuranEnc.com) or lib/clearQuran. */
  source: 'quranenc' | 'clearquran';
  available: boolean;
  /** Required attribution, shown with the text and in the picker. */
  credit: Credit;
}

export interface Credit {
  text: string;
  linkLabel: string;
  url: string;
}

export const CLEAR_QURAN_ID = 'en.khattab';

export const TRANSLATIONS: TranslationInfo[] = [
  {
    id: 'en.sahih',
    name: 'Saheeh International',
    author: 'Noor International Center',
    language: 'English',
    source: 'quranenc',
    available: true,
    // QuranEnc's terms: the publisher, the source and the version (creditLine).
    credit: {
      text: 'Saheeh International, issued by Noor International Center',
      linkLabel: 'QuranEnc.com',
      url: SAHEEH_PAGE_URL,
    },
  },
  {
    id: CLEAR_QURAN_ID,
    name: 'The Clear Quran®',
    author: 'Dr. Mustafa Khattab',
    language: 'English',
    source: 'clearquran',
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
  return `${t.name} — ${t.author}`;
}

/** The credit under a verse: with the version of the text shown, when it has one. */
export function creditLine(t: TranslationInfo, version?: string): string {
  return version ? `${t.credit.text} · v${version}` : t.credit.text;
}

/** The Arabic's source, as Tanzil's terms ask: named, with a link to tanzil.net. */
export const ARABIC_CREDIT: Credit = {
  text: 'Arabic text: Tanzil Project',
  linkLabel: 'tanzil.net',
  url: 'https://tanzil.net',
};

/** Tanzil's notice (tanzil.net/docs/text_license), kept in every copy of its text (the downloaded file). */
export const TANZIL_NOTICE = [
  'Tanzil Quran Text',
  'Copyright (C) 2007-2021 Tanzil Project',
  'License: Creative Commons Attribution 3.0',
  '',
  'This copy of the Quran text is carefully produced, highly verified and continuously monitored by a group of specialists in Tanzil Project.',
  '',
  'TERMS OF USE:',
  '- Permission is granted to copy and distribute verbatim copies of this text, but CHANGING IT IS NOT ALLOWED.',
  '- This Quran text can be used in any website or application, provided that its source (Tanzil Project) is clearly indicated, and a link is made to tanzil.net to enable users to keep track of changes.',
  '- This copyright notice shall be included in all verbatim copies of the text, and shall be reproduced appropriately in all files derived from or containing substantial portion of this text.',
  '',
  'Please check updates at: http://tanzil.net/updates/',
].join('\n');

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
export async function getPageEdition(pageNumber: number, edition: string): Promise<TranslatedAyah[]> {
  const key = `${edition}/${pageNumber}`;
  const known = memory.get(key);
  if (known) return known;
  if (edition === ARABIC_EDITION && (await loadArabicText())) {
    const whole = memory.get(key);
    if (whole) return whole;
  }

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

// The whole Arabic text, kept with the offline mushaf (Documents/quran-text/).
const ARABIC_FILE = 'quran-uthmani.json';
const VERSE_COUNT = 6236;

function textDir(): Directory {
  return new Directory(Paths.document, 'quran-text');
}

function arabicFile(): File {
  return new File(textDir(), ARABIC_FILE);
}

/** Exported for tests: alquran.cloud's whole edition, by page, in our shape. */
export function parseQuranResponse(json: unknown): Record<number, TranslatedAyah[]> {
  const surahs = (json as {
    data?: { surahs?: { number: number; englishName: string; ayahs: (ApiAyah & { page: number })[] }[] };
  })?.data?.surahs;
  if (!Array.isArray(surahs) || surahs.length !== 114) throw new Error('Unexpected Quran response');
  const byPage: Record<number, TranslatedAyah[]> = {};
  let verses = 0;
  for (const s of surahs) {
    for (const a of s.ayahs) {
      if (!(a.page >= 1 && a.page <= 604) || typeof a.text !== 'string') throw new Error('Unexpected Quran response');
      (byPage[a.page] ??= []).push({
        surahNumber: s.number,
        surahName: s.englishName,
        ayahNumber: a.numberInSurah,
        text: a.text,
      });
      verses++;
    }
  }
  if (verses !== VERSE_COUNT || Object.keys(byPage).length !== 604) throw new Error('Unexpected Quran response');
  return byPage;
}

/** The downloaded file: Tanzil's notice with the text (files from before Nov 3 2026 hold only `pages`'s content). */
interface ArabicFile {
  notice: string;
  source: string;
  pages: Record<number, TranslatedAyah[]>;
}

let arabicLoaded: Promise<boolean> | null = null;

function fillMemory(byPage: Record<number, TranslatedAyah[]>) {
  for (const [page, ayahs] of Object.entries(byPage)) memory.set(`${ARABIC_EDITION}/${page}`, ayahs);
}

/** Reads the whole Arabic text into memory, once, if it is on the phone. */
function loadArabicText(): Promise<boolean> {
  if (!arabicLoaded) {
    arabicLoaded = (async () => {
      try {
        const file = arabicFile();
        if (!file.exists) return false;
        const parsed = JSON.parse(await file.text()) as ArabicFile | Record<number, TranslatedAyah[]>;
        if ('pages' in parsed && 'notice' in parsed) {
          fillMemory((parsed as ArabicFile).pages);
        } else {
          const pages = parsed as Record<number, TranslatedAyah[]>;
          fillMemory(pages);
          // Downloaded before the notice was kept with it (Nov 2 2026): written again with it.
          try {
            writeArabicFile(pages);
          } catch (err) {
            logger.warn('Could not add the notice to the Arabic text', err);
          }
        }
        return true;
      } catch (err) {
        logger.warn('Could not read the Arabic text', err);
        return false;
      }
    })().then((ok) => {
      if (!ok) arabicLoaded = null;
      return ok;
    });
  }
  return arabicLoaded;
}

/** Writes the whole Arabic text with Tanzil's notice, beside the file and moved in (a file there is always whole). */
function writeArabicFile(pages: Record<number, TranslatedAyah[]>): void {
  const dir = textDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const partial = new File(dir, `${ARABIC_FILE}.part`);
  if (partial.exists) partial.delete();
  partial.create();
  const contents: ArabicFile = { notice: TANZIL_NOTICE, source: 'https://tanzil.net', pages };
  partial.write(JSON.stringify(contents));
  const target = arabicFile();
  if (target.exists) target.delete();
  partial.move(target);
}

/**
 * This page's Arabic is on the phone or in memory (the whole text, or the page
 * read before), so the verse sheet can show its verses offline.
 */
export function hasArabicForPage(page: number): boolean {
  if (memory.has(`${ARABIC_EDITION}/${page}`) || hasArabicText()) return true;
  try {
    return new File(new Directory(Paths.cache, 'translation', ARABIC_EDITION), `${page}.json`).exists;
  } catch {
    return false;
  }
}

/** The whole Arabic text is on the phone. */
export function hasArabicText(): boolean {
  try {
    return arabicFile().exists;
  } catch {
    return false;
  }
}

/**
 * Downloads the whole Arabic text to the phone (lib/mushafOffline). Throws on
 * failure. `stillWanted` is asked before anything is written (Remove may have
 * been tapped meanwhile).
 */
export async function downloadArabicText(stillWanted: () => boolean = () => true): Promise<void> {
  if (hasArabicText()) return;
  const res = await fetch(`https://api.alquran.cloud/v1/quran/${ARABIC_EDITION}`);
  if (!res.ok) throw new Error(`Arabic text request failed (${res.status})`);
  const byPage = parseQuranResponse(await res.json());
  if (!stillWanted()) return;
  const dir = textDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  if (Platform.OS === 'ios') {
    try {
      RecitationAudio?.excludeFromBackup(decodeURIComponent(dir.uri.replace(/^file:\/\//, '')).replace(/\/$/, ''));
    } catch (err) {
      logger.warn('Could not keep the Arabic text out of backups', err);
    }
  }
  writeArabicFile(byPage);
  fillMemory(byPage);
  arabicLoaded = Promise.resolve(true);
}

/** Deletes the whole Arabic text (Settings → Offline mushaf → Remove). */
export function removeArabicText(): void {
  try {
    const dir = textDir();
    if (dir.exists) dir.delete();
  } catch (err) {
    logger.warn('Could not remove the Arabic text', err);
  }
  arabicLoaded = null;
}

/** Test hook. */
export function __resetTranslationForTests(): void {
  memory.clear();
  singleAyahs.clear();
  arabicLoaded = null;
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

export interface VerseText {
  sura: number;
  ayah: number;
  surahName: string;
  arabic: string;
  translation: string;
  translationName: string;
  /** Saheeh International: its footnotes ("[n] …" lines, as given) and the version shown. */
  footnotes?: string;
  version?: string;
}

function compose(
  t: TranslationInfo,
  sura: number,
  ayah: number,
  arabic: TranslatedAyah,
  translation: string,
  extra?: { footnotes: string; version: string },
): VerseText {
  return {
    sura,
    ayah,
    surahName: arabic.surahName,
    arabic: stripBismillah(arabic.text, sura, ayah),
    translation,
    translationName: t.name,
    ...(extra ? { footnotes: extra.footnotes, version: extra.version } : {}),
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
    return compose(t, sura, ayah, arabic, text);
  }
  const [arabic, saheeh] = await Promise.all([
    getAyahEdition(page, sura, ayah, ARABIC_EDITION),
    getSaheehVerse(sura, ayah),
  ]);
  return compose(t, sura, ayah, arabic, saheeh.text, saheeh);
}

/** A verse's Arabic (Uthmani), exactly as the verse sheet shows it. */
export async function getArabicVerse(page: number, sura: number, ayah: number): Promise<string> {
  const arabic = await getAyahEdition(page, sura, ayah, ARABIC_EDITION);
  return stripBismillah(arabic.text, sura, ayah);
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
    return text === undefined ? null : compose(t, sura, ayah, arabic, text);
  }
  const saheeh = peekSaheehVerse(sura, ayah);
  return saheeh ? compose(t, sura, ayah, arabic, saheeh.text, saheeh) : null;
}

/** Starts loading a verse's Arabic and translation (a press and hold on it). Never fails. */
export function prefetchVerseText(page: number, sura: number, ayah: number, translationId?: string | null): void {
  const t = resolveTranslation(translationId);
  getAyahEdition(page, sura, ayah, ARABIC_EDITION).catch(() => undefined);
  if (t.id === CLEAR_QURAN_ID) prefetchClearQuran(sura, ayah);
  else prefetchSaheeh(sura);
}

/**
 * The verses before and after `v`, loaded while it is shown, so previous / next
 * shows at once. The Clear Quran looks two verses ahead (its next block takes
 * seconds); Saheeh International comes by sura, so one verse is enough.
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
