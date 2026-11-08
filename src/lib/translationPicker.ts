// What the translation picker lists: the translation in use (Selected), the favorites in the order
// starred, the ones downloaded to the phone, then every language (by its English name) with its other
// translations. A search keeps the translations whose language (in English or its own name),
// translator or credit has every word typed, accents and case aside.

import { languageName } from './translationLanguages';
import type { TranslationInfo } from './translation';
import type { DownloadStatus } from './translationDownloads';

export interface PickerSection {
  /** "selected", "favorites", "downloaded", or the language's code. */
  key: string;
  /** "Selected", "Favorites", "Downloaded", or the language's English name. */
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

export interface PickerOptions {
  /** The translation in use. */
  chosenId: string;
  /** Whole on the phone. */
  downloaded?: (t: TranslationInfo) => boolean;
  /** Can be removed here (not Saheeh International: it goes with the offline mushaf). */
  removable?: (t: TranslationInfo) => boolean;
  /** Favorite ids, in the order starred. */
  favorites?: string[];
  /** Edit: only the favorites (to reorder or unstar) and the downloads (to delete). */
  editing?: boolean;
}

const byName = (a: TranslationInfo, b: TranslationInfo) => a.name.localeCompare(b.name);

/**
 * The picker's groups (TRANS-5, TRANS-8): Selected, Favorites in the order starred, Downloaded, then
 * every language by its English name; each translation once. In Edit, the favorites (the one in use
 * too) and the downloads that can be deleted. A search filters every group.
 */
export function pickerSections(list: TranslationInfo[], query: string, opts: PickerOptions): PickerSection[] {
  const { chosenId, downloaded = () => false, removable = () => true, favorites = [], editing = false } = opts;
  const shown = list.filter((t) => matchesQuery(t, query));
  const starred = favorites.map((id) => shown.find((t) => t.id === id)).filter((t): t is TranslationInfo => !!t);
  const sections: PickerSection[] = [];
  if (editing) {
    if (starred.length > 0) sections.push({ key: 'favorites', title: 'Favorites', data: starred });
    const onPhone = shown.filter((t) => downloaded(t) && removable(t)).sort(byName);
    if (onPhone.length > 0) sections.push({ key: 'downloaded', title: 'Downloaded', data: onPhone });
    return sections;
  }
  const chosen = shown.find((t) => t.id === chosenId);
  if (chosen) sections.push({ key: 'selected', title: 'Selected', data: [chosen] });
  const favs = starred.filter((t) => t.id !== chosenId);
  if (favs.length > 0) sections.push({ key: 'favorites', title: 'Favorites', data: favs });
  const listed = new Set([chosenId, ...favs.map((t) => t.id)]);
  const onPhone = shown.filter((t) => !listed.has(t.id) && downloaded(t)).sort(byName);
  if (onPhone.length > 0) sections.push({ key: 'downloaded', title: 'Downloaded', data: onPhone });
  onPhone.forEach((t) => listed.add(t.id));
  const byLanguage = new Map<string, TranslationInfo[]>();
  for (const t of shown) {
    if (listed.has(t.id)) continue;
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
      data: byLanguage.get(code)!.sort(byName),
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
