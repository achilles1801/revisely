// Which language the app shows. English until another language ships whole: a language is
// added to LANGUAGES only once every screen has it (src/i18n/README.md).

/** The languages the app has strings for. English is the source and the fallback. */
export const LANGUAGES = ['en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const FALLBACK: Language = 'en';

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
  supported: readonly string[] = LANGUAGES,
  pinned: boolean = pinnedToEnglish(),
): string {
  if (pinned) return FALLBACK;
  for (const tag of preferred) {
    const lower = tag.toLowerCase().replace(/_/g, '-');
    const exact = supported.find((l) => l.toLowerCase() === lower);
    if (exact) return exact;
    const base = supported.find((l) => l.toLowerCase() === lower.split('-')[0]);
    if (base) return base;
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
