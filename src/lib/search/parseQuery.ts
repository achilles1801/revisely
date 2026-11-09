// Places typed into the search field: "10:16", "Yunus 16", "يونس", "page 62", "juz 30".
// Arabic words are searched for in the text as well (lib/search/quranSearch); these are
// the places a query names directly, shown first.

import { getAllSurahs, getSurahDisplay } from '../quranData';
import { editDistance, normalizeWord } from '../recite/arabic';

export type SearchTarget =
  | { kind: 'verse'; sura: number; ayah: number }
  | { kind: 'surah'; sura: number }
  | { kind: 'page'; page: number }
  | { kind: 'juz'; juz: number };

/** Arabic-Indic and Persian digits as 0-9. */
function westernDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const ayahCount = (sura: number) => getSurahDisplay(sura)?.ayahCount ?? 0;

function verse(sura: number, ayah: number): SearchTarget | null {
  return sura >= 1 && sura <= 114 && ayah >= 1 && ayah <= ayahCount(sura) ? { kind: 'verse', sura, ayah } : null;
}

/** A Latin surah name reduced to letters: "Āli-'Imrān" → "aliimran". */
function latinKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Without its article ("al-", "an-", "ash-"…): "Al-Fatihah" → "fatihah". */
function withoutArticle(name: string): string {
  const m = /^\s*(?:a[a-z]{0,2})[-\s'‘’]+(.+)$/i.exec(name.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  return m ? latinKey(m[1]) : latinKey(name);
}

interface SurahKeys {
  sura: number;
  latin: string[];
  arabic: string;
}

let surahKeys: SurahKeys[] | null = null;

function keys(): SurahKeys[] {
  if (!surahKeys) {
    surahKeys = getAllSurahs().map((s) => {
      const display = getSurahDisplay(s.number);
      const names = [s.name, display?.nameDisplay ?? s.name];
      const latin = new Set<string>();
      for (const n of names) {
        latin.add(latinKey(n));
        latin.add(withoutArticle(n));
      }
      return { sura: s.number, latin: [...latin].filter(Boolean), arabic: s.nameArabic.split(/\s+/).map(normalizeWord).join('') };
    });
  }
  return surahKeys;
}

/** Surahs whose name the text is, starts or nearly is, best first. */
function surahsNamed(text: string): number[] {
  const arabicWords = text.split(/\s+/).map(normalizeWord).filter(Boolean);
  if (arabicWords.length > 0) {
    if (arabicWords[0] === 'سوره' || arabicWords[0] === 'سورت') arabicWords.shift();
    const key = arabicWords.join('');
    if (!key) return [];
    return keys()
      .filter((s) => s.arabic === key || s.arabic === `ال${key}` || `ال${s.arabic}` === key)
      .map((s) => s.sura);
  }
  let q = latinKey(text);
  q = q.replace(/^(surah|surat|sura|soorah|surat)/, '');
  if (q.length < 2) return [];
  const exact: number[] = [];
  const prefix: number[] = [];
  const near: number[] = [];
  for (const s of keys()) {
    if (s.latin.includes(q)) exact.push(s.sura);
    else if (q.length >= 3 && s.latin.some((k) => k.startsWith(q))) prefix.push(s.sura);
    else if (q.length >= 4 && s.latin.some((k) => editDistance(q, k, 2) <= (q.length >= 7 ? 2 : 1))) near.push(s.sura);
  }
  return exact.length ? exact : prefix.length ? prefix : near.slice(0, 3);
}

/** The places `text` names, most likely first (none for plain Arabic words). */
export function parseReference(input: string): SearchTarget[] {
  const text = westernDigits(input).trim().replace(/\s+/g, ' ');
  if (!text) return [];

  let m = /^(\d{1,3})\s*[:.\-/ ]\s*(\d{1,3})$/.exec(text);
  if (m) {
    const v = verse(Number(m[1]), Number(m[2]));
    return v ? [v] : [];
  }
  m = /^(?:p|pg|pp|page|pages|ص|صفحه|صفحة|الصفحة|الصفحه)\.? ?(\d{1,3})$/i.exec(text);
  if (m) {
    const page = Number(m[1]);
    return page >= 1 && page <= 604 ? [{ kind: 'page', page }] : [];
  }
  m = /^(?:juz|juzz|jaz|para|جزء|الجزء)['’]? ?(\d{1,2})$/i.exec(text);
  if (m) {
    const juz = Number(m[1]);
    return juz >= 1 && juz <= 30 ? [{ kind: 'juz', juz }] : [];
  }
  m = /^(\d{1,3})$/.exec(text);
  if (m) {
    const n = Number(m[1]);
    const out: SearchTarget[] = [];
    if (n >= 1 && n <= 114) out.push({ kind: 'surah', sura: n });
    if (n >= 1 && n <= 604) out.push({ kind: 'page', page: n });
    return out;
  }
  // A surah's name, perhaps with an ayah: "Yunus 16", "al-kahf:10", "يونس ١٦".
  m = /^(.*?[^\d\s:])\s*[: ]\s*(\d{1,3})$/.exec(text);
  if (m) {
    const ayah = Number(m[2]);
    const found = surahsNamed(m[1])
      .map((sura) => verse(sura, ayah))
      .filter((v): v is SearchTarget => v != null);
    if (found.length) return found;
  }
  return surahsNamed(text).map((sura) => ({ kind: 'surah', sura }));
}

/** Whether the text has Arabic letters (worth searching in the text of the Qur'an). */
export function hasArabic(text: string): boolean {
  return /[ء-ي]/.test(text);
}
