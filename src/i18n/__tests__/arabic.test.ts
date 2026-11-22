// The Arabic strings (src/i18n/ar) against the English: same keys, every plural in six forms, the same {{values}},
// Latin text in isolates, no ›. Then t(), dates and numbers in Arabic: Arabic-Indic digits, English untouched.
//
// What's left to translate: I18N_PROGRESS=1 npx jest src/i18n/__tests__/arabic
import { ar } from '../ar';
import type { PluralForm } from '../ar/types';
import { localDigits, localNumber } from '../digits';
import { en } from '../en';
import { formatDate, formatNumber, formatTime, dayMonth, i18n, t } from '..';
import {
  languagePickerOffered,
  offeredLanguages,
  resolveChoice,
  chooseLanguage,
  languageChoice,
  resetLanguageChoiceForTests,
} from '../choice';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FORMS: PluralForm[] = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL = /^(.*)_(zero|one|two|few|many|other)$/;

function leaves(o: object, prefix = ''): [string, unknown][] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]],
  );
}

const english = new Map(leaves(en));
const arabic = leaves(ar);

/** The English a key translates: a plural form translates English's `_other`. */
function englishFor(key: string): string | undefined {
  const plural = PLURAL.exec(key);
  if (plural) return (english.get(`${plural[1]}_other`) ?? english.get(`${plural[1]}_one`)) as string | undefined;
  return english.get(key) as string | undefined;
}

const values = (s: string) => new Set([...s.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]));

describe('the Arabic strings', () => {
  it('are all text, and every key is one English has', () => {
    const unknown = arabic.filter(([key, value]) => typeof value !== 'string' || englishFor(key) === undefined);
    expect(unknown.map(([key]) => key)).toEqual([]);
  });

  it('have all six plural forms wherever they have one', () => {
    const bases = new Set(arabic.map(([key]) => PLURAL.exec(key)?.[1]).filter(Boolean) as string[]);
    const have = new Set(arabic.map(([key]) => key));
    const missing = [...bases].flatMap((base) => FORMS.filter((f) => !have.has(`${base}_${f}`)).map((f) => `${base}_${f}`));
    expect(missing).toEqual([]);
  });

  it("use only the English's {{values}} (a form may leave out {{count}}: «صفحتان»)", () => {
    const extra = arabic.flatMap(([key, value]) => {
      const allowed = values(englishFor(key) ?? '');
      return [...values(value as string)].filter((v) => !allowed.has(v)).map((v) => `${key}: {{${v}}}`);
    });
    expect(extra).toEqual([]);
  });

  it('keep Latin text in an isolate (⁨…⁩), never a › or ‹ (the code adds them), never tatweel', () => {
    const wrong = arabic.flatMap(([key, value]) => {
      const text = (value as string).replace(/\{\{[^}]*\}\}/g, '').replace(/⁨[^⁩]*⁩/g, '');
      const problems = [];
      if (/[A-Za-z]/.test(text)) problems.push('Latin outside an isolate');
      if (/[›‹]/.test(value as string)) problems.push('a chevron');
      if (/ـ/.test(value as string)) problems.push('tatweel');
      return problems.map((p) => `${key}: ${p}`);
    });
    expect(wrong).toEqual([]);
  });

  (process.env.I18N_PROGRESS ? it : it.skip)('progress', () => {
    const done = new Set(arabic.map(([key]) => key.replace(PLURAL, '$1')));
    const byFile = new Map<string, [number, number]>();
    for (const key of english.keys()) {
      const base = key.replace(/_(one|other)$/, '');
      const file = key.split('.')[0];
      const [d, n] = byFile.get(file) ?? [0, 0];
      byFile.set(file, [d + (done.has(base) ? 1 : 0), n + 1]);
    }
    const rows = [...byFile].sort((a, b) => b[1][1] - b[1][0] - (a[1][1] - a[1][0]));
    const total = rows.reduce((s, [, [d, n]]) => [s[0] + d, s[1] + n], [0, 0]);
    // eslint-disable-next-line no-console
    console.log(
      [
        `Arabic: ${total[0]} of ${total[1]} English strings`,
        ...rows.map(([f, [d, n]]) => `${String(n - d).padStart(5)} left  ${f} (${d}/${n})`),
      ].join('\n'),
    );
  });
});

describe('Arabic on screen', () => {
  const arT = i18n.getFixedT('ar');

  it('t() picks the six forms and writes numbers in Arabic-Indic digits', () => {
    expect([0, 1, 2, 3, 11, 100, 604].map((count) => arT('common.pages', { count }))).toEqual([
      'لا توجد صفحات',
      'صفحة واحدة',
      'صفحتان',
      '٣ صفحات',
      '١١ صفحة',
      '١٠٠ صفحة',
      // 604 ends in 04: Arabic counts it like 4 («٦٠٤ صفحات»).
      '٦٠٤ صفحات',
    ]);
    expect(arT('common.nOfTotal', { n: 6, total: 20 })).toBe('٦ من ٢٠');
  });

  it('a string not translated yet shows in English', () => {
    // A new English string arrives before its Arabic (every key had Arabic when this was written).
    const ns = (i18n.options.defaultNS as string | undefined) ?? 'translation';
    i18n.addResource('en', ns, 'common.fallbackProbe', 'Only in English');
    expect(arT('common.fallbackProbe' as never)).toBe('Only in English');
  });

  it('English is exactly as before: Western digits, no grouping added', () => {
    expect(t('common.pages', { count: 1234 })).toBe('1234 pages');
    expect(t('common.nOfTotal', { n: 6, total: 20 })).toBe('6 of 20');
  });

  it('digits: counts without a thousands separator (a print is «١٤٤١»), decimals with ٫, percent ٪', () => {
    expect(localNumber(1441, 'ar')).toBe('١٤٤١');
    expect(localNumber(20.5, 'ar')).toBe('٢٠٫٥');
    expect(localNumber(0.205, 'ar', { style: 'percent', maximumFractionDigits: 1 })).toBe('٢٠٫٥٪');
    expect(localDigits('12 Nov 2026', 'ar-SA')).toBe('١٢ Nov ٢٠٢٦');
    expect(localDigits('12', 'en')).toBe('12');
  });

  describe('dates and numbers while the app is in Arabic', () => {
    beforeAll(async () => {
      await i18n.changeLanguage('ar');
    });
    afterAll(async () => {
      await i18n.changeLanguage('en');
    });

    it('come in Arabic, with Arabic-Indic digits', () => {
      const day = new Date(2026, 10, 21, 17, 5);
      expect(formatNumber(604)).toBe('٦٠٤');
      expect(dayMonth(day)).not.toMatch(/[0-9]/);
      expect(dayMonth(day)).toContain('٢١');
      expect(formatDate(day, { month: 'long' })).toBe('نوفمبر');
      expect(formatTime(day)).not.toMatch(/[0-9]/);
    });
  });
});

describe('the language choice (LANG-3)', () => {
  beforeEach(async () => {
    resetLanguageChoiceForTests();
    await AsyncStorage.clear();
  });

  it('the store app and Revisely Dev both offer Arabic; tests and E2E builds never show the picker', () => {
    expect(offeredLanguages(true)).toEqual(['en', 'ar']);
    expect(offeredLanguages(false)).toEqual(['en', 'ar']);
    expect(languagePickerOffered(true, false)).toBe(true);
    expect(languagePickerOffered(false, false)).toBe(true);
    expect(languagePickerOffered(true, true)).toBe(false);
    expect(languagePickerOffered(false, true)).toBe(false);
  });

  it("a language chosen is that language; the phone's otherwise; English when it isn't offered", () => {
    expect(resolveChoice('ar', ['en-US'], ['en', 'ar'], false)).toBe('ar');
    expect(resolveChoice('system', ['ar-SA', 'en-US'], ['en', 'ar'], false)).toBe('ar');
    expect(resolveChoice('system', ['fr-FR'], ['en', 'ar'], false)).toBe('en');
    expect(resolveChoice('en', ['ar-SA'], ['en', 'ar'], false)).toBe('en');
    // A build that doesn't offer Arabic (the store app before 1.0.6): English, chosen or not.
    expect(resolveChoice('ar', ['ar-SA'], ['en'], false)).toBe('en');
    expect(resolveChoice('ar', ['ar-SA'], ['en', 'ar'], true)).toBe('en');
  });

  it('is kept on the phone', async () => {
    await chooseLanguage('ar');
    expect(languageChoice()).toBe('ar');
    expect(await AsyncStorage.getItem('@revisely_language:v1')).toBe('ar');
  });
});
