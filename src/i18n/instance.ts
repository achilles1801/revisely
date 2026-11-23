// The i18next instance behind t(). UI text comes from t(), keyed by the folder it shows in;
// English (src/i18n/en) is the source and the fallback. How to add strings: src/i18n/README.md.
//
// The language is decided once, at launch (choice.ts applies the one chosen in Revisely Dev before
// the first screen): changing it means a restart, which a right-to-left language needs anyway
// (React Native lays out RTL from the next launch). So t() is a plain function, usable in
// components and in lib/ alike; call it where the text is used, never in a module-level constant,
// which would keep the language of the first import.
//
// A number given to t() is written in the language's digits ("{{count}} صفحة" → "١٢ صفحة"):
// English's are left exactly as they were.
//
// Hermes has no Intl.PluralRules, which i18next's plurals use; the polyfill installs itself only
// where it's missing (Node, in Jest, has it).
import 'intl-pluralrules';
import i18next, { type FormatterModule } from 'i18next';
import { ar } from './ar';
import { localNumber } from './digits';
import { en } from './en';
import { deviceLanguages, FALLBACK, LANGUAGES, resolveLanguage } from './language';
import './types';

export const i18n = i18next.createInstance();

/** Numbers in a value, in the language's digits; everything else as given. */
const digitsFormatter: FormatterModule = {
  type: 'formatter',
  init: () => undefined,
  add: () => undefined,
  addCached: () => undefined,
  // i18next types the result as a string; anything not a number goes back exactly as given, as before.
  format: (value: unknown, _format?: string, lng?: string): string =>
    (typeof value === 'number' && lng && lng !== 'en' ? localNumber(value, lng) : value) as string,
};

void i18n.use(digitsFormatter).init({
  lng: resolveLanguage(deviceLanguages()),
  fallbackLng: FALLBACK,
  supportedLngs: [...LANGUAGES],
  resources: { en: { translation: en }, ar: { translation: ar } },
  // Everything is bundled: init finishes before this module returns.
  initAsync: false,
  // React escapes text itself. Every value goes through the formatter (numbers get the language's digits).
  interpolation: { escapeValue: false, alwaysFormat: true },
  returnNull: false,
});

/** The text for a key, in the app's language. */
export const t = i18n.getFixedT(null, 'translation');

/** The language the app is showing ('en', 'ar'). */
export function currentLanguage(): string {
  return i18n.language;
}
