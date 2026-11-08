// What the translation picker lists: the translation in use first, then the ones downloaded to the
// phone, then every language (by its English name) with its other translations. A search keeps the
// translations whose language (in English or its own name), translator or credit has every word
// typed, accents and case aside.

import { languageName } from './translationLanguages';
import type { TranslationInfo } from './translation';
import type { DownloadStatus } from './translationDownloads';

export interface PickerSection {
  /** "chosen", "downloaded", or the language's code. */
  key: string;
  /** "In use", "Downloaded", or the language's English name. */
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

export function pickerSections(
  list: TranslationInfo[],
  query: string,
  chosenId: string,
  downloaded: (t: TranslationInfo) => boolean = () => false,
): PickerSection[] {
  const shown = list.filter((t) => matchesQuery(t, query));
  const sections: PickerSection[] = [];
  const chosen = shown.find((t) => t.id === chosenId);
  if (chosen) sections.push({ key: 'chosen', title: 'In use', data: [chosen] });
  const onPhone = shown.filter((t) => t.id !== chosenId && downloaded(t));
  if (onPhone.length > 0) {
    sections.push({ key: 'downloaded', title: 'Downloaded', data: onPhone.sort((a, b) => a.name.localeCompare(b.name)) });
  }
  const byLanguage = new Map<string, TranslationInfo[]>();
  for (const t of shown) {
    if (t.id === chosenId || onPhone.includes(t)) continue;
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

/** Megabytes as Settings writes them ("1.1 MB", "12 MB"; mushafOfflineUi's formatMegabytes). */
export function megabytes(bytes: number): string {
  const mb = bytes / 1e6;
  return `${mb >= 10 ? Math.round(mb) : Math.max(0.1, Math.round(mb * 10) / 10)}\u00A0MB`;
}

/** The row's line about the phone: its size, what is on the phone, a download's progress. */
export function downloadLine(s: DownloadStatus | null): string | null {
  if (!s) return null;
  if (!s.manageable) return s.phase === 'complete' ? 'On this phone, with the offline mushaf' : 'Downloads with the offline mushaf';
  switch (s.phase) {
    case 'downloading':
      return `Downloading… ${Math.floor((100 * s.suras) / s.total)}%`;
    case 'complete':
      return `On this phone · ${megabytes(s.bytes)}`;
    case 'failed':
      return `Couldn’t download all of it · ${s.suras} of ${s.total} suras on this phone`;
    case 'partial':
      return `${s.suras} of ${s.total} suras on this phone · ${megabytes(s.bytes)}`;
    default:
      return megabytes(s.bytes);
  }
}
