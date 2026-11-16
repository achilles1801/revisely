// Which way the app lays out: the way its language reads, never the phone's.
//
// Android lays a React Native app out right to left on a phone set to Arabic, Persian, Urdu or
// Hebrew by itself: the manifest has supportsRtl and React Native allows RTL unless told not to.
// So until Nov 2026 the English app came out mirrored on those phones: rows, the tab swipe, the
// verse highlights and the mushaf's page order (BEHAVIOUR.md LANG-1). iOS only does it for an app
// that declares an RTL language, which Revisely doesn't yet.
//
// React Native reads the direction when the app starts, so a change applies from the next launch.
import { I18nManager } from 'react-native';

/** Languages that read right to left. */
const RTL = new Set(['ar', 'fa', 'he', 'ur']);

export function isRTLLanguage(language: string): boolean {
  return RTL.has(language.toLowerCase().split(/[-_]/)[0]);
}

type DirectionManager = Pick<typeof I18nManager, 'allowRTL' | 'forceRTL' | 'isRTL'>;

/**
 * Sets the layout direction to the language's, from the next launch. Returns true when this
 * launch is laid out the other way (a phone set to Arabic, before its next start).
 */
export function syncLayoutDirection(language: string, manager: DirectionManager = I18nManager): boolean {
  const rtl = isRTLLanguage(language);
  manager.allowRTL(rtl);
  manager.forceRTL(rtl);
  return manager.isRTL !== rtl;
}

/**
 * The › that ends a line leading somewhere ("Starts at Al-Mujadila ›"), pointing the way the
 * language reads: ‹ right to left. Text in src/i18n/en never holds one; the code adds it.
 */
export function chevron(): string {
  return I18nManager.isRTL ? '‹' : '›';
}

/** The ‹ that leads back (a previous month, a page back): › right to left. */
export function backChevron(): string {
  return I18nManager.isRTL ? '›' : '‹';
}
