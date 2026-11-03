// Saheeh International (English), the licensed copy from QuranEnc.com (#80).
//
// QuranEnc's terms ("Terms and Policies" on every translation's page, read Nov 2
// 2026) let its translations be downloaded and re-published if the content is
// not changed, added to or cut; the publisher and the source (QuranEnc.com) are
// named; the version is mentioned; the transcript information stays with it;
// notes on the translation go to QuranEnc; it is kept at the latest version; and
// no inappropriate advertisements are shown with it. So:
// - Each verse's translation and footnotes are kept exactly as the API gives
//   them. The verse sheet shows the "[n]" markers as raised numbers and the
//   footnotes under the verse; nothing else changes.
// - The credit under the verse names the publisher (Noor International Center,
//   which issues Saheeh International), QuranEnc.com and the version of the
//   sura shown (lib/translation's creditLine).
// - A sura is kept on the phone as soon as it is read, in
//   Documents/translations/english_saheeh/ (kept out of iCloud backups), one
//   file per sura named with its version. The whole translation (114 suras,
//   about 1 MB) downloads with the offline mushaf (lib/mushafOffline).
//   info.json keeps QuranEnc's own description of it (title, description,
//   version, last update).
// - QuranEnc's list of translations is read at most once a day; a sura from an
//   older version is downloaded again, and shown with its own version until then.
//
// Copies served by alquran.cloud (the app's source before Nov 2026) had no
// licence; their cached files are deleted.

import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import RecitationAudio from '../../modules/recitation-audio';
import { getSurahDisplay } from './quranData';
import { logger } from './logger';
import type { TextSegment } from './clearQuran';

export const SAHEEH_KEY = 'english_saheeh';
/** Its page on QuranEnc.com: linked from the credit. */
export const SAHEEH_PAGE_URL = 'https://quranenc.com/en/browse/english_saheeh';
const API = 'https://quranenc.com/api/v1';
export const SAHEEH_SURAS = 114;
/** On the phone, all 114 suras (measured Nov 2 2026, v1.1.2). */
export const SAHEEH_BYTES = 1_093_165;
const TIMEOUT_MS = 20_000;
const CHECK_EVERY_MS = 24 * 3_600_000;
const WORKERS = 2;

/** QuranEnc's description of the translation (its list), with when it was read. */
export interface SaheehInfo {
  key: string;
  version: string;
  last_update: number;
  title: string;
  description: string;
  checkedAt: number;
}

/** What QuranEnc's list said on Nov 2 2026: used until the list has been read on this phone. */
export const SAHEEH_KNOWN: SaheehInfo = {
  key: SAHEEH_KEY,
  version: '1.1.2',
  last_update: 1750772247,
  title: 'English Translation - Noor International Center',
  description: 'Issued by Noor International Center.',
  checkedAt: 0,
};

interface SuraFile {
  key: string;
  version: string;
  sura: number;
  /** [translation, footnotes] per verse, verse 1 first. */
  verses: [string, string][];
}

export interface SaheehVerse {
  text: string;
  /** "[n] …" lines, as given; empty when the verse has none. */
  footnotes: string;
  version: string;
}

const memory = new Map<number, SuraFile>();
const loading = new Map<number, Promise<SuraFile>>();
/** Sura → the version of its file on the phone. Null until the folder is read. */
let index: Map<number, string> | null = null;
let info: SaheehInfo | null = null;
let infoRead = false;
let checking: Promise<SaheehInfo> | null = null;
let backupExcluded = false;
let generation = 0;
const listeners = new Set<() => void>();

function root(): Directory {
  return new Directory(Paths.document, 'translations');
}

function dir(): Directory {
  return new Directory(root(), SAHEEH_KEY);
}

function pathOf(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/$/, '');
}

function ensureDir(): Directory {
  const d = dir();
  if (!d.exists) {
    d.create({ intermediates: true, idempotent: true });
    backupExcluded = false;
  }
  if (!backupExcluded && Platform.OS === 'ios') {
    backupExcluded = true;
    try {
      RecitationAudio?.excludeFromBackup(pathOf(root().uri));
    } catch (err) {
      logger.warn('Could not keep the translation out of backups', err);
    }
  }
  return d;
}

const FILE_NAME = /^(\d{3})-(.+)\.json$/;

function fileName(sura: number, version: string): string {
  return `${String(sura).padStart(3, '0')}-${version}.json`;
}

/** The folder's sura files, read once a launch (and kept up to date). */
function suraIndex(): Map<number, string> {
  if (index) return index;
  const found = new Map<number, string>();
  try {
    // The copy alquran.cloud served, cached before Nov 2026: unlicensed.
    const old = new Directory(Paths.cache, 'translation', 'en.sahih');
    if (old.exists) old.delete();
  } catch (err) {
    logger.warn('Could not delete the old translation cache', err);
  }
  try {
    const d = dir();
    if (d.exists) {
      for (const entry of d.list()) {
        if (!(entry instanceof File)) continue;
        const m = FILE_NAME.exec(entry.name);
        if (!m) continue;
        const sura = Number(m[1]);
        const known = found.get(sura);
        // Two versions of a sura (an update cut short): keep the newer.
        if (known && compareVersions(known, m[2]) >= 0) {
          entry.delete();
          continue;
        }
        if (known) new File(d, fileName(sura, known)).delete();
        found.set(sura, m[2]);
      }
    }
  } catch (err) {
    logger.warn('Could not read the translation folder', err);
  }
  index = found;
  return found;
}

/** "1.1.10" > "1.1.2". */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Suras on the phone (any version). */
export function saheehSurasOnPhone(): number {
  return suraIndex().size;
}

/** Called when a sura is stored or the translation is removed. */
export function onSaheehChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Exported for tests: QuranEnc's sura response, checked, in our shape. */
export function parseSuraResponse(json: unknown, sura: number): [string, string][] {
  const result = (json as { result?: { sura: string; aya: string; translation: string; footnotes?: string }[] })
    ?.result;
  const count = getSurahDisplay(sura)?.ayahCount;
  if (!Array.isArray(result) || !count || result.length !== count) throw new Error('Unexpected translation response');
  return result.map((a, i) => {
    if (Number(a.sura) !== sura || Number(a.aya) !== i + 1 || typeof a.translation !== 'string') {
      throw new Error('Unexpected translation response');
    }
    return [a.translation, typeof a.footnotes === 'string' ? a.footnotes : ''];
  });
}

async function getJson(url: string): Promise<unknown> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller?.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`QuranEnc request failed (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function infoFile(): File {
  return new File(dir(), 'info.json');
}

function readInfo(): SaheehInfo | null {
  if (!infoRead) {
    infoRead = true;
    try {
      const f = infoFile();
      if (f.exists) {
        const parsed = JSON.parse(f.textSync()) as SaheehInfo;
        if (typeof parsed?.version === 'string') info = parsed;
      }
    } catch (err) {
      logger.warn('Could not read the translation info', err);
    }
  }
  return info;
}

/**
 * The newest version, from QuranEnc's list (read at most once a day). If the
 * list can't be read: the last one read, or the one this release knows.
 */
export function latestSaheehInfo(): Promise<SaheehInfo> {
  const known = readInfo();
  if (known && Date.now() - known.checkedAt < CHECK_EVERY_MS) return Promise.resolve(known);
  if (!checking) {
    checking = (async () => {
      try {
        const json = (await getJson(`${API}/translations/list/en`)) as {
          translations?: Partial<SaheehInfo>[];
        };
        const entry = json?.translations?.find((t) => t.key === SAHEEH_KEY);
        if (!entry || typeof entry.version !== 'string') throw new Error('Saheeh International is not in the list');
        const next: SaheehInfo = {
          key: SAHEEH_KEY,
          version: entry.version,
          last_update: Number(entry.last_update) || 0,
          title: String(entry.title ?? ''),
          description: String(entry.description ?? ''),
          checkedAt: Date.now(),
        };
        info = next;
        try {
          const f = new File(ensureDir(), 'info.json');
          f.write(JSON.stringify(next));
        } catch (err) {
          logger.warn('Could not save the translation info', err);
        }
        return next;
      } catch (err) {
        logger.warn('Could not read QuranEnc’s list', err);
        return readInfo() ?? SAHEEH_KNOWN;
      }
    })().finally(() => {
      checking = null;
    });
  }
  return checking;
}

function store(file: SuraFile, gen: number): void {
  if (gen !== generation) return;
  const d = ensureDir();
  const name = fileName(file.sura, file.version);
  // Written beside it and moved in, so a file there is always whole.
  const partial = new File(d, `${name}.part`);
  if (partial.exists) partial.delete();
  partial.create();
  partial.write(JSON.stringify(file));
  const target = new File(d, name);
  if (target.exists) target.delete();
  partial.move(target);
  const idx = suraIndex();
  const before = idx.get(file.sura);
  if (before && before !== file.version) {
    try {
      const old = new File(d, fileName(file.sura, before));
      if (old.exists) old.delete();
    } catch (err) {
      logger.warn('Could not delete an older sura', err);
    }
  }
  idx.set(file.sura, file.version);
  listeners.forEach((l) => l());
}

/** One sura from QuranEnc, stored on the phone. */
async function fetchSura(sura: number): Promise<SuraFile> {
  const gen = generation;
  const [latest, json] = await Promise.all([
    latestSaheehInfo(),
    getJson(`${API}/translation/sura/${SAHEEH_KEY}/${sura}`),
  ]);
  const file: SuraFile = { key: SAHEEH_KEY, version: latest.version, sura, verses: parseSuraResponse(json, sura) };
  try {
    store(file, gen);
  } catch (err) {
    logger.warn('Could not keep a sura of the translation', err);
  }
  if (gen === generation) memory.set(sura, file);
  return file;
}

async function readSura(sura: number): Promise<SuraFile | null> {
  const version = suraIndex().get(sura);
  if (!version) return null;
  const f = new File(dir(), fileName(sura, version));
  try {
    const parsed = JSON.parse(await f.text()) as SuraFile;
    const count = getSurahDisplay(sura)?.ayahCount;
    if (parsed?.sura === sura && Array.isArray(parsed.verses) && parsed.verses.length === count) return parsed;
  } catch {
    // Unreadable: fetched again below.
  }
  try {
    if (f.exists) f.delete();
  } catch {
    // Left; replaced when fetched.
  }
  suraIndex().delete(sura);
  return null;
}

function loadSura(sura: number): Promise<SuraFile> {
  const known = memory.get(sura);
  if (known) return Promise.resolve(known);
  let pending = loading.get(sura);
  if (!pending) {
    pending = (async () => {
      const stored = await readSura(sura);
      if (stored) {
        memory.set(sura, stored);
        return stored;
      }
      return fetchSura(sura);
    })().finally(() => loading.delete(sura));
    loading.set(sura, pending);
  }
  return pending;
}

/** One verse: from memory, the phone, or QuranEnc (and then kept). */
export async function getSaheehVerse(sura: number, ayah: number): Promise<SaheehVerse> {
  const file = await loadSura(sura);
  const verse = file.verses[ayah - 1];
  if (!verse) throw new Error('No such verse');
  return { text: verse[0], footnotes: verse[1], version: file.version };
}

/** One verse, if this launch already has its sura in memory. */
export function peekSaheehVerse(sura: number, ayah: number): SaheehVerse | null {
  const file = memory.get(sura);
  const verse = file?.verses[ayah - 1];
  return file && verse ? { text: verse[0], footnotes: verse[1], version: file.version } : null;
}

/** Starts loading a sura. Never fails. */
export function prefetchSaheeh(sura: number): void {
  if (sura >= 1 && sura <= SAHEEH_SURAS) loadSura(sura).catch(() => undefined);
}

/** This sura is on the phone (or in memory): it shows offline. */
export function hasSaheehSura(sura: number): boolean {
  return memory.has(sura) || suraIndex().has(sura);
}

/**
 * Downloads every sura not on the phone at the newest version (lib/mushafOffline).
 * Throws if any failed; the rest are kept. `stillWanted` is asked before each sura.
 */
export async function downloadSaheeh(stillWanted: () => boolean = () => true): Promise<void> {
  const latest = await latestSaheehInfo();
  const idx = suraIndex();
  const todo: number[] = [];
  for (let s = 1; s <= SAHEEH_SURAS; s++) if (idx.get(s) !== latest.version) todo.push(s);
  if (todo.length === 0) return;
  let next = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < todo.length && failed === 0 && stillWanted()) {
        const sura = todo[next++];
        try {
          // A sura read meanwhile (at the newest version) needn't come again.
          if (suraIndex().get(sura) === latest.version) continue;
          await fetchSura(sura);
        } catch (err) {
          failed++;
          logger.warn('Translation download failed', err);
        }
      }
    }),
  );
  if (failed > 0) throw new Error('Some suras did not download');
}

/** Deletes it from the phone (Settings → Offline mushaf → Remove). Suras read later are kept again. */
export function removeSaheeh(): void {
  generation++;
  memory.clear();
  loading.clear();
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch (err) {
    logger.warn('Could not remove the translation', err);
  }
  index = new Map();
  info = null;
  infoRead = true;
  backupExcluded = false;
  listeners.forEach((l) => l());
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const raise = (digits: string) => [...digits].map((d) => SUPERSCRIPT[Number(d)]).join('');
const FOOTNOTE_LINE = /^\[(\d+)\]\s*([\s\S]*)$/;

/** Footnotes as shown under the verse: one per "[n] …" line, its number raised, its text as given. */
export function saheehFootnotes(footnotes: string): { mark: string; text: string }[] {
  return footnotes
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = FOOTNOTE_LINE.exec(line);
      return m ? { mark: raise(m[1]), text: m[2] } : { mark: '', text: line };
    });
}

/**
 * The translation as shown: a "[n]" marker that has its footnote becomes the
 * number, raised (square brackets around words, "[All] praise", stay as they
 * are). Nothing else changes.
 */
export function saheehSegments(text: string, footnotes: string): TextSegment[] {
  const marks = new Set<string>();
  for (const line of footnotes.split('\n')) {
    const m = FOOTNOTE_LINE.exec(line.trim());
    if (m) marks.add(m[1]);
  }
  if (marks.size === 0) return [{ text }];
  const out: TextSegment[] = [];
  let at = 0;
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    if (!marks.has(m[1])) continue;
    if (m.index! > at) out.push({ text: text.slice(at, m.index) });
    out.push({ footnote: raise(m[1]) });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** Test hook. */
export function __resetSaheehForTests(): void {
  memory.clear();
  loading.clear();
  index = null;
  info = null;
  infoRead = false;
  checking = null;
  backupExcluded = false;
  generation = 0;
  listeners.clear();
}
