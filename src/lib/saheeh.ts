// Saheeh International (English), the licensed copy from QuranEnc.com (#80): one of the QuranEnc
// translations (lib/quranenc, where its terms and how they are kept are written down), and the one
// downloaded whole with the offline mushaf (lib/mushafOffline). Copies served by alquran.cloud (the
// app's source before Nov 2026) had no licence; their cached files are deleted.

import {
  catalogueEntry,
  footnoteLines,
  footnoteSegments,
  knownInfoOf,
  QURANENC_SURAS,
  quranEncPageUrl,
  quranEncStore,
  QuranEncInfo,
  QuranEncVerse,
  __resetQuranEncForTests,
} from './quranenc';

export { compareVersions, parseSuraResponse } from './quranenc';

export const SAHEEH_KEY = 'english_saheeh';
/** Its page on QuranEnc.com: linked from the credit. */
export const SAHEEH_PAGE_URL = quranEncPageUrl(SAHEEH_KEY);
export const SAHEEH_SURAS = QURANENC_SURAS;
/** On the phone, all 114 suras (measured Nov 2 2026, v1.1.2). */
export const SAHEEH_BYTES = 1_093_165;

export type SaheehInfo = QuranEncInfo;
export type SaheehVerse = QuranEncVerse;

/** What QuranEnc's list said on Nov 2 2026 (the catalogue): used until the list has been read on this phone. */
export const SAHEEH_KNOWN: SaheehInfo = knownInfoOf(catalogueEntry(SAHEEH_KEY)!);

const saheeh = () => quranEncStore(SAHEEH_KEY)!;

/** Suras on the phone (any version). */
export const saheehSurasOnPhone = (): number => saheeh().surasOnPhone();
/** Called when a sura is stored or the translation is removed. */
export const onSaheehChange = (listener: () => void): (() => void) => saheeh().onChange(listener);
/** The newest version, from QuranEnc's list (at most once a day), or the last one known. */
export const latestSaheehInfo = (): Promise<SaheehInfo> => saheeh().latestInfo();
/** One verse: from memory, the phone, or QuranEnc (and then kept). */
export const getSaheehVerse = (sura: number, ayah: number): Promise<SaheehVerse> => saheeh().getVerse(sura, ayah);
/** One verse, if this launch already has its sura in memory. */
export const peekSaheehVerse = (sura: number, ayah: number): SaheehVerse | null => saheeh().peekVerse(sura, ayah);
/** Starts loading a sura. Never fails. */
export const prefetchSaheeh = (sura: number): void => saheeh().prefetch(sura);
/** This sura is on the phone (or in memory): it shows offline. */
export const hasSaheehSura = (sura: number): boolean => saheeh().hasSura(sura);
/**
 * Downloads every sura not on the phone at the newest version (lib/mushafOffline). Carries on past
 * a failed sura; stops after 3 in a row. Throws if any failed (the rest are kept).
 */
export const downloadSaheeh = (stillWanted: () => boolean = () => true): Promise<void> =>
  saheeh().download(stillWanted);
/** Deletes it from the phone (Settings → Offline mushaf → Remove). Suras read later are kept again. */
export const removeSaheeh = (): void => saheeh().remove();

/** Footnotes as shown under the verse: one per "[n] …" line, its number raised, its text as given. */
export const saheehFootnotes = footnoteLines;
/** The translation as shown: a "[n]" marker that has its footnote becomes the number, raised. */
export const saheehSegments = footnoteSegments;

/** Test hook. */
export function __resetSaheehForTests(): void {
  __resetQuranEncForTests();
}
