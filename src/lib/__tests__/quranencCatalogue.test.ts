jest.mock('expo-file-system', () => ({}));
jest.mock('../../../modules/recitation-audio', () => ({ __esModule: true, default: null }));

import { QURANENC_CATALOGUE, catalogueEntry, quranEncPageUrl, quranEncStore } from '../quranenc';
import { LANGUAGES, languageName } from '../translationLanguages';
import {
  ALL_TRANSLATIONS,
  creditLine,
  offeredTranslations,
  QURANENC_TRANSLATIONS,
  quranEncTranslationId,
  resolveTranslation,
  TRANSLATIONS,
  translatorName,
} from '../translation';
import { foldForSearch, matchesQuery, pickerSections } from '../translationPicker';

describe('the QuranEnc catalogue (src/data/quranencCatalogue.json)', () => {
  it('lists each translation once, with a key, version and direction the app can use', () => {
    expect(QURANENC_CATALOGUE.length).toBeGreaterThanOrEqual(70);
    const keys = QURANENC_CATALOGUE.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of QURANENC_CATALOGUE) {
      expect(e.key).toMatch(/^[a-z0-9_]{1,36}$/);
      expect(e.version).toMatch(/^[\w.-]{1,32}$/);
      expect(['ltr', 'rtl']).toContain(e.dir);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.bytes).toBeGreaterThan(100_000);
    }
  });

  it('every language has its English and its own name', () => {
    for (const e of QURANENC_CATALOGUE) expect(LANGUAGES[e.lang]).toBeDefined();
    expect(languageName('ur')).toEqual({ name: 'Urdu', native: 'اردو' });
    expect(languageName('xx')).toEqual({ name: 'xx', native: 'xx' });
  });

  it('the right-to-left ones are the Arabic-script languages and N’Ko', () => {
    const rtl = QURANENC_CATALOGUE.filter((e) => e.dir === 'rtl').map((e) => e.lang);
    expect([...new Set(rtl)].sort()).toEqual(['fa', 'ku', 'nqo', 'ps', 'ug', 'ur']);
  });

  it('a translation id longer than the rules allow (40) can’t happen', () => {
    for (const t of ALL_TRANSLATIONS) expect(t.id.length).toBeLessThanOrEqual(40);
  });

  it('a store per translation it lists; none for a key it doesn’t', () => {
    expect(quranEncStore('urdu_junagarhi')?.key).toBe('urdu_junagarhi');
    expect(quranEncStore('urdu_junagarhi')).toBe(quranEncStore('urdu_junagarhi'));
    expect(quranEncStore('russian_aboadel')).toBeUndefined();
    expect(catalogueEntry('english_saheeh')?.version).toBe('1.1.2');
  });
});

describe('a QuranEnc translation in the app', () => {
  const urdu = resolveTranslation('qe.urdu_junagarhi');

  it('[TRANS-2] is credited in QuranEnc’s own words, with QuranEnc.com and the version', () => {
    expect(urdu.id).toBe(quranEncTranslationId('urdu_junagarhi'));
    expect(urdu.name).toBe('Muhammad Junagarhi');
    expect(urdu.language).toBe('Urdu');
    expect(urdu.direction).toBe('rtl');
    expect(urdu.credit.text).toBe(catalogueEntry('urdu_junagarhi')!.description);
    expect(urdu.credit.linkLabel).toBe('QuranEnc.com');
    expect(urdu.credit.url).toBe(quranEncPageUrl('urdu_junagarhi'));
    expect(creditLine(urdu, '1.1.3')).toBe(`${catalogueEntry('urdu_junagarhi')!.description} · v1.1.3`);
  });

  it('is named by its translator or publisher, from QuranEnc’s title', () => {
    expect(translatorName('Urdu Translation - Muhammad Junagarhi')).toBe('Muhammad Junagarhi');
    expect(translatorName('French translation - Noor International Center')).toBe('Noor International Center');
    expect(translatorName('Tamil Translation - Omar Sharif - Abridged Version')).toBe('Omar Sharif - Abridged Version');
    expect(translatorName('Spanish Translation (Latin American) - issued by Noor International')).toBe(
      'Noor International (Latin American)',
    );
    expect(translatorName('Bulgarian Translation')).toBe('Bulgarian Translation');
  });

  it('Saheeh International stays its own entry, not a second one from the catalogue', () => {
    expect(QURANENC_TRANSLATIONS.some((t) => t.key === 'english_saheeh')).toBe(false);
    expect(resolveTranslation('en.sahih').key).toBe('english_saheeh');
  });

  it('an id the app doesn’t know falls back to Saheeh International', () => {
    expect(resolveTranslation('qe.russian_aboadel').id).toBe('en.sahih');
  });
});

describe('what the picker offers', () => {
  it('[TRANS-5] testers every translation; everyone else Saheeh International and The Clear Quran®', () => {
    expect(offeredTranslations(false).map((t) => t.id)).toEqual(TRANSLATIONS.map((t) => t.id));
    expect(offeredTranslations(true)).toHaveLength(TRANSLATIONS.length + QURANENC_TRANSLATIONS.length);
  });

  it('the one in use first, then each language by its English name', () => {
    const sections = pickerSections(offeredTranslations(true), '', 'qe.urdu_junagarhi');
    expect(sections[0]).toMatchObject({ key: 'chosen', title: 'In use' });
    expect(sections[0].data.map((t) => t.id)).toEqual(['qe.urdu_junagarhi']);
    const titles = sections.slice(1).map((s) => s.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    // In use isn't listed again under its language.
    expect(sections.find((s) => s.key === 'ur')).toBeUndefined();
    expect(sections.find((s) => s.key === 'fr')?.native).toBe('Français');
    expect(sections.find((s) => s.key === 'en')?.native).toBeUndefined();
  });

  it('a search, accents and case aside, by language in English or its own name, or translator', () => {
    expect(foldForSearch('Français Türkçe')).toBe('francais turkce');
    const french = resolveTranslation('qe.french_rashid');
    expect(matchesQuery(french, 'FRANCAIS')).toBe(true);
    expect(matchesQuery(french, 'french maach')).toBe(true);
    expect(matchesQuery(french, 'french junagarhi')).toBe(false);
    expect(matchesQuery(resolveTranslation('qe.urdu_junagarhi'), 'اردو')).toBe(true);
    const found = pickerSections(offeredTranslations(true), 'türkçe', 'en.sahih');
    expect(found.map((s) => s.key)).toEqual(['tr']);
    expect(pickerSections(offeredTranslations(true), 'nothing like this', 'en.sahih')).toEqual([]);
  });
});
