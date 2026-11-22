// Which language the app shows. English is the source and the fallback. Arabic (src/i18n/ar) ships with the native
// release that declares it (1.0.6: app.config.js's CFBundleLocalizations and locales, plugins/withAndroidLocales), so
// the store app offers both, as Revisely Dev does (src/i18n/README.md, "Arabic").

/** The languages the app has strings for. */
export const LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];
export const FALLBACK: Language = 'en';

/**
 * The languages the store app offers: the ones its binary declares (app.config.js, plugins/withAndroidLocales, which
 * plugins/__tests__/withAndroidLocales.test.js keeps the same as this).
 */
export const SHIPPED: readonly Language[] = ['en', 'ar'];

/** Each language's name in itself, as the picker shows it. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ar: 'العربية' };

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * Tests and E2E builds always run in English, whatever the machine's or simulator's language:
 * scenario queries and Maestro flows match the English text.
 */
export function pinnedToEnglish(env: Record<string, string | undefined> = process.env): boolean {
  return env.JEST_WORKER_ID != null || env.NODE_ENV === 'test' || env.EXPO_PUBLIC_E2E === '1';
}

/**
 * The first of the phone's preferred languages (BCP 47 tags, most preferred first) that the app
 * has, else English. "ar-SA" matches "ar".
 */
export function resolveLanguage(
  preferred: readonly string[],
  supported: readonly string[] = SHIPPED,
  pinned: boolean = pinnedToEnglish(),
): Language {
  if (pinned) return FALLBACK;
  for (const tag of preferred) {
    const lower = tag.toLowerCase().replace(/_/g, '-');
    const exact = supported.find((l) => l.toLowerCase() === lower);
    if (isLanguage(exact)) return exact;
    const base = supported.find((l) => l.toLowerCase() === lower.split('-')[0]);
    if (isLanguage(base)) return base;
  }
  return FALLBACK;
}

/** The phone's preferred languages, as far as JavaScript can tell without a native module. */
export function deviceLanguages(): string[] {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale ? [locale] : [];
  } catch {
    return [];
  }
}
