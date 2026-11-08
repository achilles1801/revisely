// What the translation picker lists: the translation in use first, then every language (by its
// English name), each with its translations. A search keeps the translations whose language (in
// English or its own name), translator or credit has every word typed, accents and case aside.

import { languageName } from './translationLanguages';
import type { TranslationInfo } from './translation';

export interface PickerSection {
  /** "chosen", or the language's code. */
  key: string;
  /** "In use", or the language's English name. */
  title: string;
  /** The language's own name, when it differs from the title. */
  native?: string;
  data: TranslationInfo[];
}

/** Lower case, without accents or marks ("Français" → "francais"). */
export function foldForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function haystack(t: TranslationInfo): string {
  const lang = languageName(t.languageCode);
  return foldForSearch([lang.name, lang.native, t.language, t.name, t.author, t.credit.text, t.key ?? ''].join(' '));
}

/** Every word of the query is somewhere in the translation's language, translator or credit. */
export function matchesQuery(t: TranslationInfo, query: string): boolean {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = haystack(t);
  return words.every((w) => hay.includes(w));
}

export function pickerSections(list: TranslationInfo[], query: string, chosenId: string): PickerSection[] {
  const shown = list.filter((t) => matchesQuery(t, query));
  const sections: PickerSection[] = [];
  const chosen = shown.find((t) => t.id === chosenId);
  if (chosen) sections.push({ key: 'chosen', title: 'In use', data: [chosen] });
  const byLanguage = new Map<string, TranslationInfo[]>();
  for (const t of shown) {
    if (t.id === chosenId) continue;
    const group = byLanguage.get(t.languageCode) ?? [];
    group.push(t);
    byLanguage.set(t.languageCode, group);
  }
  const languages = [...byLanguage.keys()].sort((a, b) => languageName(a).name.localeCompare(languageName(b).name));
  for (const code of languages) {
    const lang = languageName(code);
    sections.push({
      key: code,
      title: lang.name,
      ...(lang.native !== lang.name ? { native: lang.native } : {}),
      data: byLanguage.get(code)!.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return sections;
}
