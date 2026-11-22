// Web links (our pages, the credits' links) open in the app's own browser (BEHAVIOUR.md LINK-1).
//
// App Review's iPhone couldn't hand a link to Safari (1.0.4, Nov 18 2026; Sentry REACT-NATIVE-13): Linking.openURL
// rejected "Unable to open URL" for Revo's "How your data is used" and Settings → Privacy Policy, nothing caught it,
// and the taps did nothing. The in-app browser (expo-web-browser, in every binary: SFSafariViewController on iOS,
// Custom Tabs on Android) needs no browser app to hand the link to. When it can't open the page, the phone's browser
// tries; when that can't either, the address shows with Copy, so a tap on a link always does something. Store links
// stay on Linking (lib/updates/storeUpdates), and an email address uses openEmail below.
import { Alert, Linking } from 'react-native';
import { t } from '../i18n';
import { copyText } from './clipboard';
import { logger } from './logger';

/** Where the page went: the in-app browser, the phone's browser, its address shown to copy, or nowhere (a second tap). */
export type WebPageOpened = 'in-app' | 'browser' | 'address' | 'already';

/**
 * A second tap on the same link this soon is the same tap: the first page is still sliding up. Without this, iOS
 * answers the second with "locked", which would send it to the phone's browser as well.
 */
const SAME_TAP_MS = 1000;
let lastTap: { url: string; at: number } | null = null;

/** Opens an https page. Never rejects: whatever fails, the user sees the page or its address. */
export async function openWebPage(url: string): Promise<WebPageOpened> {
  const now = Date.now();
  if (lastTap && lastTap.url === url && now - lastTap.at < SAME_TAP_MS) return 'already';
  lastTap = { url, at: now };
  let inApp: unknown = null;
  try {
    // Required here, so screens and tests that never open a page don't load it.
    const WebBrowser = require('expo-web-browser') as typeof import('expo-web-browser');
    // On iOS this settles when the page is closed; on Android once it has opened.
    const result = await WebBrowser.openBrowserAsync(url);
    // "locked": iOS thinks a page is already showing. The page covers the whole screen, so the tap can't have come
    // from under one: an earlier page never came up (presented while another sheet was going), and it never clears.
    if (result?.type !== 'locked') return 'in-app';
    inApp = 'locked';
  } catch (err) {
    inApp = err;
  }
  try {
    // RN's own test mock answers undefined, not a promise: await takes both.
    await Linking.openURL(url);
    return 'browser';
  } catch (err) {
    // Only the errors' codes: a message names the address, and a support link carries a one-time code.
    logger.error('A web page opened in neither the in-app browser nor the phone’s browser', new Error('No browser opened a page'), {
      inApp: codeOf(inApp),
      browser: codeOf(err),
    });
  }
  showAddress(url, 'page');
  return 'address';
}

/** Opens a mailto: link in the phone's email app; with none, the address shows with Copy. */
export async function openEmail(mailto: string, address: string): Promise<'mail' | 'address'> {
  try {
    await Linking.openURL(mailto);
    return 'mail';
  } catch {
    showAddress(address, 'email');
    return 'address';
  }
}

/** The address that couldn't open, with Copy (a native alert: it shows over any sheet, SHEET-1). */
export function showAddress(address: string, kind: 'page' | 'email'): void {
  Alert.alert(
    kind === 'page' ? t('common.pageDidNotOpen') : t('common.emailDidNotOpen'),
    kind === 'page' ? t('common.pageDidNotOpenBody', { address }) : t('common.emailDidNotOpenBody', { address }),
    [
      { text: t('common.copy'), onPress: () => copyText(address) },
      { text: t('common.ok'), style: 'cancel' },
    ],
  );
}

function codeOf(err: unknown): string {
  if (err == null) return 'none';
  if (typeof err === 'string') return err;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' || typeof code === 'number') return String(code);
  return (err as { name?: unknown }).name === undefined ? typeof err : String((err as { name?: unknown }).name);
}

/** Tests only: forget the last tap. */
export function resetOpenWebPageForTests(): void {
  lastTap = null;
}
