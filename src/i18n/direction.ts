// Which way the app lays out: the way its language reads, never the phone's.
//
// Android lays a React Native app out right to left on a phone set to Arabic, Persian, Urdu or
// Hebrew by itself: the manifest has supportsRtl and React Native allows RTL unless told not to.
// So until Nov 2026 the English app came out mirrored on those phones: rows, the tab swipe, the
// verse highlights and the mushaf's page order (BEHAVIOUR.md LANG-1). iOS only does it for an app
// that declares an RTL language, which Revisely doesn't yet.
//
// React Native reads the direction when the app starts, so a change applies from the next launch; a launch that
// started the wrong way restarts once, in the splash (restartForDirection, src/i18n/choice.ts).
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
 * LANG-1: whether a launch laid out the other way from its language restarts once, in the splash, so the first screen
 * reads the right way. That launch is the first on a phone whose language reads the other way (Android mirrors any
 * app on a phone set to Arabic; an iPhone in Arabic starts an Arabic app left to right), or the first after the phone's
 * language changed under "phone's language". Once per direction (`restartedFor`, the direction the last restart was
 * for): a restart that didn't take isn't tried again, so the app never loops. Never in tests or E2E builds (`pinned`).
 */
export function restartForDirection(
  wrongWay: boolean,
  wanted: 'rtl' | 'ltr',
  restartedFor: string | null,
  pinned: boolean,
): boolean {
  return wrongWay && !pinned && restartedFor !== wanted;
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

/**
 * A box placed `x` points from the screen's left edge whatever the direction: a menu or card positioned from a touch
 * or a verse's place on the page (window coordinates). React Native swaps left and right in RTL, so there it is `right`.
 */
export function fromLeftEdge(x: number, rtl: boolean = I18nManager.isRTL): { left: number } | { right: number } {
  return rtl ? { right: x } : { left: x };
}

/**
 * Ionicons' chevrons, pointing the way the layout reads: an icon is a glyph, so React Native doesn't mirror it in RTL
 * as it does a row. A "next" or "open" chevron points left right to left; a back one points right.
 */
export function forwardIcon(): 'chevron-forward' | 'chevron-back' {
  return I18nManager.isRTL ? 'chevron-back' : 'chevron-forward';
}

/** The back chevron's icon, pointing the way back: right in a right-to-left layout. */
export function backIcon(): 'chevron-forward' | 'chevron-back' {
  return I18nManager.isRTL ? 'chevron-forward' : 'chevron-back';
}
