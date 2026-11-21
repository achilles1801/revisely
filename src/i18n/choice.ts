// The language the person chose (Settings → Appearance → Language), kept on this phone. Revisely Dev only until
// Arabic ships: the store app offers English alone, never reads the choice, and shows exactly what it always has.
//
// The language is applied before the first screen (App.tsx waits for loadLanguageChoice, inside the splash), and a
// change restarts the app: React Native lays out right to left only from a launch, and a restart also redraws every
// screen in the new language.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { DevSettings } from 'react-native';
import { isDevVariant } from '../lib/variant';
import { syncLayoutDirection } from './direction';
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

/**
 * Reads the choice and applies it, before the first screen. The store app reads nothing. Returns the language
 * shown.
 */
export async function loadLanguageChoice(): Promise<Language> {
  if (!languagePickerOffered()) return i18n.language as Language;
  try {
    choice = parseChoice(await AsyncStorage.getItem(KEY));
  } catch {
    choice = 'system';
  }
  const language = resolveChoice(choice);
  if (i18n.language !== language) await i18n.changeLanguage(language);
  syncLayoutDirection(language);
  return language;
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
