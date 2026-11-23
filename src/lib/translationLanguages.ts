import { t } from '../i18n';
import type { Strings } from '../i18n/en';
// The languages of the translations the app offers (QuranEnc's ISO codes): the English name the
// picker sorts and searches by, and the language's own name, in its own script, shown beside it.

export interface LanguageName {
  /** Its name in the app's language ("Urdu"). */
  name: string;
  /** Its own name, in its own script ("اردو"); the same as `name` where that is how it's written. */
  native: string;
}

// i18n-ignore-start (each language's own name, in its own script: never translated)
const NATIVE: Record<string, string> = {
  aa: 'Qafaraf',
  ak: 'Akan',
  am: 'አማርኛ',
  as: 'অসমীয়া',
  az: 'Azərbaycanca',
  bs: 'Bosanski',
  ceb: 'Binisaya',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fa: 'فارسی',
  ff: 'Fulfulde',
  fr: 'Français',
  gu: 'ગુજરાતી',
  ha: 'Hausa',
  hi: 'हिन्दी',
  hr: 'Hrvatski',
  id: 'Bahasa Indonesia',
  ja: '日本語',
  km: 'ខ្មែរ',
  kn: 'ಕನ್ನಡ',
  ku: 'کوردی',
  ky: 'Кыргызча',
  ln: 'Lingála',
  lt: 'Lietuvių',
  mdh: 'Maguindanaon',
  mk: 'Македонски',
  ml: 'മലയാളം',
  mos: 'Mooré',
  nl: 'Nederlands',
  nqo: 'ߒߞߏ',
  om: 'Afaan Oromoo',
  pa: 'ਪੰਜਾਬੀ',
  ps: 'پښتو',
  pt: 'Português',
  rn: 'Ikirundi',
  ro: 'Română',
  rw: 'Kinyarwanda',
  si: 'සිංහල',
  so: 'Soomaali',
  sq: 'Shqip',
  sr: 'Српски',
  sv: 'Svenska',
  sw: 'Kiswahili',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  tg: 'Тоҷикӣ',
  th: 'ไทย',
  tl: 'Tagalog',
  tr: 'Türkçe',
  ug: 'ئۇيغۇرچە',
  ur: 'اردو',
  uz: 'Ўзбекча',
  vi: 'Tiếng Việt',
  yo: 'Yorùbá',
  zh: '中文',
};
// i18n-ignore-end

/** Each language's names: its name in the app's language (src/i18n/en/languages.ts) and its own. */
export const LANGUAGES: Record<string, LanguageName> = Object.fromEntries(
  Object.entries(NATIVE).map(([code, native]) => [
    code,
    {
      get name() {
        return t(`languages.${code as keyof Strings['languages']}`);
      },
      native,
    },
  ]),
);

/** A language's names; an unknown code is shown as the code itself. */
export function languageName(code: string): LanguageName {
  return LANGUAGES[code] ?? { name: code, native: code };
}
