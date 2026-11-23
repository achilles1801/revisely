import i18next from 'i18next';
import PluralRules from 'intl-pluralrules/plural-rules';
import { currentLanguage, t } from '..';
import { en } from '../en';
import { pinnedToEnglish, resolveLanguage } from '../language';

describe('t()', () => {
  it('gives the English text, with its values', () => {
    expect(currentLanguage()).toBe('en');
    expect(t('updates.ready.title')).toBe('A new update is ready');
    expect(t('updates.store.body', { version: '1.0.4', store: 'the App Store' })).toBe(
      'Revisely 1.0.4 is on the App Store.',
    );
  });

  it('leaves values as given (React escapes text itself)', () => {
    expect(t('updates.required.installed', { version: '<1.0 & up>' })).toBe('Installed: <1.0 & up>');
  });
});

describe('the language', () => {
  it('is English in tests and E2E builds, whatever the phone prefers', () => {
    expect(pinnedToEnglish({ JEST_WORKER_ID: '1' })).toBe(true);
    expect(pinnedToEnglish({ EXPO_PUBLIC_E2E: '1' })).toBe(true);
    expect(pinnedToEnglish({})).toBe(false);
    expect(resolveLanguage(['ar-SA'], ['en', 'ar'], true)).toBe('en');
  });

  it("is the first of the phone's languages the app has, else English", () => {
    expect(resolveLanguage(['ar-SA', 'en-US'], ['en', 'ar'], false)).toBe('ar');
    expect(resolveLanguage(['fr-FR', 'ar_EG'], ['en', 'ar'], false)).toBe('ar');
    expect(resolveLanguage(['fr-FR', 'de'], ['en', 'ar'], false)).toBe('en');
    expect(resolveLanguage([], ['en', 'ar'], false)).toBe('en');
    // Only English ships to the store app today.
    expect(resolveLanguage(['ar-SA'], undefined, false)).toBe('en');
  });
});

describe('plurals', () => {
  // Hermes has no Intl.PluralRules; src/i18n loads intl-pluralrules, which installs only where it's missing.
  it("the polyfill knows Arabic's six forms", () => {
    const ar = new PluralRules('ar');
    expect([0, 1, 2, 3, 11, 100].map((n) => ar.select(n))).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
    expect(new PluralRules('en').select(1)).toBe('one');
  });

  it('i18next picks the form for the count, in English and Arabic', () => {
    const i18n = i18next.createInstance();
    void i18n.init({
      lng: 'en',
      initAsync: false,
      resources: {
        en: { translation: { pages_one: '{{count}} page', pages_other: '{{count}} pages' } },
        ar: {
          translation: {
            pages_zero: 'لا صفحات',
            pages_one: 'صفحة واحدة',
            pages_two: 'صفحتان',
            pages_few: '{{count}} صفحات',
            pages_many: '{{count}} صفحة',
            pages_other: '{{count}} صفحة',
          },
        },
      },
    });
    // This instance's keys aren't the app's, so its t() is called untyped.
    const english = i18n.getFixedT('en') as unknown as (key: string, options: { count: number }) => string;
    const arabic = i18n.getFixedT('ar') as unknown as (key: string, options: { count: number }) => string;
    expect([1, 2].map((count) => english('pages', { count }))).toEqual(['1 page', '2 pages']);
    expect([0, 1, 2, 3].map((count) => arabic('pages', { count }))).toEqual(['لا صفحات', 'صفحة واحدة', 'صفحتان', '3 صفحات']);
  });
});

describe('the English strings', () => {
  const leaves = (o: object, prefix = ''): [string, unknown][] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]],
    );

  it('are all text, under camelCase keys (an id from elsewhere, like adhan\'s method names, as it is)', () => {
    for (const [key, value] of leaves(en)) {
      expect([key, typeof value === 'string' && value.trim().length > 0]).toEqual([key, true]);
      expect([key, /^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*(_(zero|one|two|few|many|other))?$/.test(key)]).toEqual([
        key,
        true,
      ]);
    }
  });

  it('hold no › or ‹: the code adds chevron() or backChevron(), which turn round right to left', () => {
    for (const [key, value] of leaves(en)) expect([key, /[›‹]/.test(String(value))]).toEqual([key, false]);
  });

  it('have balanced {{values}}', () => {
    for (const [key, value] of leaves(en)) {
      const text = String(value);
      expect([key, (text.match(/\{\{/g) ?? []).length]).toEqual([key, (text.match(/\}\}/g) ?? []).length]);
    }
  });
});
