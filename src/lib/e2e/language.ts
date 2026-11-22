// E2E builds only (install.ts): the app in another language, for the flow that looks at Revisely in Arabic
// (.maestro/flows/21-arabic.yaml). E2E builds are English otherwise (src/i18n/language.ts, pinnedToEnglish), since
// every other flow matches English text.
//
// A flow asks for it once; the app keeps it on this phone until the install is cleared:
//   iOS:      launchApp `arguments: { e2eLanguage: ar }` (read at launch, as e2eClock)
//   Android:  revisely://e2e/language?lang=ar
// The words change at once (from the next screen drawn). The layout turns right to left only from the next launch
// (React Native reads the direction when the app starts), so the flow starts the app again after
// (.maestro/subflows/language.yaml). The status line says the language and the direction once they're not English
// and left to right (E2ERoot, languageStatus below).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, Platform, Settings } from 'react-native';
import { syncLayoutDirection } from '../../i18n/direction';
import { i18n } from '../../i18n/instance';
import { isLanguage, type Language } from '../../i18n/language';

/** Where the language a flow asked for is kept. */
export const LANGUAGE_KEY = '@revisely_e2e_language';

async function apply(language: Language, keep: boolean): Promise<void> {
  if (keep) {
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // This launch still shows it; the next one is English.
    }
  }
  if (i18n.language !== language) await i18n.changeLanguage(language);
  syncLayoutDirection(language);
  // eslint-disable-next-line no-console
  console.log(`[e2e] language ${language}; this launch ${I18nManager.isRTL ? 'right to left' : 'left to right'}`);
}

/** revisely://e2e/language?lang=ar (or en): true when the link was this one. */
export function handleLanguageLink(url: string): boolean {
  const m = /^revisely:\/\/e2e\/language\?(?:.*&)?lang=([^&]+)/i.exec(url);
  if (!m) return false;
  const language = decodeURIComponent(m[1]);
  if (isLanguage(language)) void apply(language, true);
  return true;
}

/**
 * Before the first screen (install.ts waits for it): the language named at launch (iOS), else the one a flow asked
 * for earlier. Nothing asked for: English, as every E2E build.
 */
export async function applyE2ELanguage(): Promise<void> {
  let named: unknown;
  if (Platform.OS === 'ios') {
    try {
      named = Settings.get('e2eLanguage');
    } catch {
      // no launch argument
    }
  }
  if (isLanguage(named)) {
    await apply(named, true);
    return;
  }
  let kept: string | null = null;
  try {
    kept = await AsyncStorage.getItem(LANGUAGE_KEY);
  } catch {
    // English
  }
  if (isLanguage(kept) && kept !== 'en') await apply(kept, false);
}

/** The status line's end: " ar rtl" in Arabic once laid out right to left; nothing in English left to right. */
export function languageStatus(language: string = i18n.language, rtl: boolean = I18nManager.isRTL): string {
  return `${language === 'en' ? '' : ` ${language}`}${rtl ? ' rtl' : ''}`;
}
