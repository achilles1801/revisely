// The language the person chose (Settings → Appearance → Language), kept on this phone: English, Arabic, or the
// phone's. Offered wherever the build has more than one language (SHIPPED in the store app, every one in Revisely
// Dev); tests and E2E builds never offer it.
//
// The language is applied before the first screen (App.tsx waits for loadLanguageChoice, inside the splash), and a
// change restarts the app: React Native lays out right to left only from a launch, and a restart also redraws every
// screen in the new language. A launch that started the wrong way round restarts once, in the splash (LANG-1).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { DevSettings } from 'react-native';
import { isDevVariant } from '../lib/variant';
import { isRTLLanguage, restartForDirection, syncLayoutDirection } from './direction';
import { i18n } from './instance';
import { deviceLanguages, isLanguage, LANGUAGES, pinnedToEnglish, resolveLanguage, SHIPPED, type Language } from './language';

/** 'system' follows the phone; a language is that language whatever the phone says. */
export type LanguageChoice = 'system' | Language;

const KEY = '@revisely_language:v1';

let choice: LanguageChoice = 'system';

/** The languages this build offers: every one in Revisely Dev, the shipped ones in the store app. */
export function offeredLanguages(dev: boolean = isDevVariant()): readonly Language[] {
  return dev ? LANGUAGES : SHIPPED;
}

/** Whether Settings shows the Language row: only where there is more than one language to pick. */
export function languagePickerOffered(dev: boolean = isDevVariant(), pinned: boolean = pinnedToEnglish()): boolean {
  return !pinned && offeredLanguages(dev).length > 1;
}

/** The language a choice comes to on this phone. Tests and E2E builds are always English. */
export function resolveChoice(
  chosen: LanguageChoice,
  device: readonly string[] = deviceLanguages(),
  offered: readonly Language[] = offeredLanguages(),
  pinned: boolean = pinnedToEnglish(),
): Language {
  if (pinned) return 'en';
  if (chosen !== 'system' && offered.includes(chosen)) return chosen;
  return resolveLanguage(device, offered, pinned);
}

export function languageChoice(): LanguageChoice {
  return choice;
}

function parseChoice(raw: string | null): LanguageChoice {
  return raw === 'system' || isLanguage(raw) ? raw : 'system';
}

/** The direction the last launch-time restart was for (restartForDirection). Cleared once a launch is the right way. */
const DIRECTION_RESTART_KEY = '@revisely_direction_restart:v1';

/**
 * Sets the direction for the language shown and, when this launch is laid out the other way, restarts once (LANG-1).
 * True when it is restarting: the caller keeps the splash up.
 */
async function settleDirection(language: Language): Promise<boolean> {
  const wrongWay = syncLayoutDirection(language);
  const pinned = pinnedToEnglish();
  if (pinned) return false;
  const wanted = isRTLLanguage(language) ? 'rtl' : 'ltr';
  let restartedFor: string | null = null;
  try {
    restartedFor = await AsyncStorage.getItem(DIRECTION_RESTART_KEY);
  } catch {
    // Unread: no restart, since one that didn't take couldn't be told apart from a first.
    return false;
  }
  if (!restartForDirection(wrongWay, wanted, restartedFor, pinned)) {
    if (!wrongWay && restartedFor != null) {
      try {
        await AsyncStorage.removeItem(DIRECTION_RESTART_KEY);
      } catch {
        // Left: the next launch the wrong way carries on as it is.
      }
    }
    return false;
  }
  try {
    await AsyncStorage.setItem(DIRECTION_RESTART_KEY, wanted);
    await restartForLanguage();
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the choice (where there is one to make) and applies the language and its direction, before the first screen.
 * A launch laid out the wrong way restarts once (LANG-1): `restarting` is then true and the splash stays.
 */
export async function loadLanguageChoice(): Promise<{ language: Language; restarting: boolean }> {
  if (languagePickerOffered()) {
    try {
      choice = parseChoice(await AsyncStorage.getItem(KEY));
    } catch {
      choice = 'system';
    }
    const chosen = resolveChoice(choice);
    if (i18n.language !== chosen) await i18n.changeLanguage(chosen);
  }
  const language = i18n.language as Language;
  return { language, restarting: await settleDirection(language) };
}

/**
 * Keeps a new choice and sets the direction for the next launch. Returns the language it comes to; the caller
 * restarts the app (restartForLanguage) when that differs from the one showing.
 */
export async function chooseLanguage(next: LanguageChoice): Promise<Language> {
  choice = next;
  try {
    await AsyncStorage.setItem(KEY, next);
  } catch {
    // Not kept: this launch still restarts into it, and the next one follows the phone.
  }
  const language = resolveChoice(next);
  syncLayoutDirection(language);
  return language;
}

/** Restarts into the language chosen: a reload of this update (a development build reloads Metro's bundle). */
export async function restartForLanguage(): Promise<void> {
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  await Updates.reloadAsync();
}

export function resetLanguageChoiceForTests(): void {
  choice = 'system';
}
