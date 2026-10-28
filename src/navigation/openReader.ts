import { pageOfVerse, VerseKey } from '../lib/verses';

type Navigate = (name: string, params: object) => void;

/**
 * The reader at a verse's page, in the Read tab: opened if it isn't, or moved
 * to that page if it is (QuranReaderScreen follows a new pageNumber).
 */
export function openReaderAt(navigation: { navigate: unknown }, verse: VerseKey): void {
  (navigation.navigate as Navigate)('Read', { screen: 'QuranReader', params: { pageNumber: pageOfVerse(verse) } });
}
