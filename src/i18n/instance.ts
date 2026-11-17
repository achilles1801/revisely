// The i18next instance behind t(). UI text comes from t(), keyed by the folder it shows in;
// English (src/i18n/en) is the source and the fallback. How to add strings: src/i18n/README.md.
//
// The language is decided once, at launch: changing it means a restart, which a right-to-left
// language needs anyway (React Native lays out RTL from the next launch). So t() is a plain
// function, usable in components and in lib/ alike; call it where the text is used, never in a
// module-level constant, which would keep the language of the first import.
//
// Hermes has no Intl.PluralRules, which i18next's plurals use; the polyfill installs itself only
// where it's missing (Node, in Jest, has it).
import 'intl-pluralrules';
import i18next from 'i18next';
import { en } from './en';
import { deviceLanguages, FALLBACK, LANGUAGES, resolveLanguage } from './language';
import './types';

export const i18n = i18next.createInstance();

void i18n.init({
  lng: resolveLanguage(deviceLanguages()),
  fallbackLng: FALLBACK,
  supportedLngs: [...LANGUAGES],
  resources: { en: { translation: en } },
  // Everything is bundled: init finishes before this module returns.
  initAsync: false,
  // React escapes text itself.
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** The text for a key, in the app's language. */
export const t = i18n.getFixedT(null, 'translation');

/** The language the app is showing ('en'). */
export function currentLanguage(): string {
  return i18n.language;
}
