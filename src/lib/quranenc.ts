// Translations from QuranEnc.com (the Encyclopedia of the Noble Quran), one store per translation.
//
// QuranEnc's terms ("Terms and Policies", the same on every translation's page; all 163 read
// Nov 8 2026) let its translations be downloaded and re-published if the content is not changed,
// added to or cut; the publisher and the source (QuranEnc.com) are named; the version is
// mentioned; the transcript information stays with it; notes on the translation go to QuranEnc; it
// is kept at the latest version; and no inappropriate advertisements are shown with it. So:
// - Each verse's translation and footnotes are kept exactly as the API gives them. The verse sheet
//   shows the "[n]" markers that have a footnote as raised numbers and the footnotes under the
//   verse; nothing else changes.
// - The credit under the verse is QuranEnc's own description of the translation (who translated
//   and issued it), QuranEnc.com and the version of the sura shown (lib/translation's creditLine).
// - A sura is kept on the phone as soon as it is read, in Documents/translations/<key>/ (kept out of
//   iCloud backups), one file per sura named with its version, and info.json beside them keeps
//   QuranEnc's own description of it (title, description, version, last update). The whole
//   translation can be downloaded (download()).
// - QuranEnc's list of translations is read at most once a day per translation in use (on any
//   connection, whenever a sura is read; one request answers for every translation). A sura from an
//   older version is fetched again as soon as it is read, and by a download; until then it is shown
//   with its own version. The sura endpoint carries no version, so a sura fetched before the list
//   has been read is labelled with the last version known (the bundled catalogue on a fresh install)
//   and fetched again if the list says otherwise.
//
// The catalogue (src/data/quranencCatalogue.json, from scripts/quranenc-catalogue.js) is QuranEnc's
// list as this release ships it: what the picker offers and the credits it shows until the list has
// been read on this phone. Translations on QuranEnc's website but not in its list have no published
// version (which its terms require), so they aren't in it.

import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import RecitationAudio from '../../modules/recitation-audio';
import { getSurahDisplay } from './quranData';
import { logger } from './logger';
import type { TextSegment } from './clearQuran';
import catalogueFile from '../data/quranencCatalogue.json';

const API = 'https://quranenc.com/api/v1';
export const QURANENC_LIST_URL = `${API}/translations/list`;
export const QURANENC_SURAS = 114;
const TIMEOUT_MS = 20_000;
const CHECK_EVERY_MS = 24 * 3_600_000;
/** After the list couldn't be read, it isn't asked again for this long. */
const RECHECK_AFTER_FAILURE_MS = 10 * 60_000;
const WORKERS = 2;
/** A download stops after this many suras fail in a row. */
const MAX_FAILURES_IN_A_ROW = 3;
/** A version as it may appear in a file name. */
const VERSION = /^[\w.-]{1,32}$/;
/** A key as it may appear in a folder name. */
const KEY = /^[a-z0-9_]{1,36}$/;

/** One translation in QuranEnc's list, as the catalogue keeps it. */
export interface QuranEncEntry {
  key: string;
  /** ISO 639 code, as QuranEnc gives it ("ur", "ceb"). */
  lang: string;
  dir: 'ltr' | 'rtl';
  version: string;
  updated: number;
  title: string;
  description: string;
  /** About how many bytes the whole translation takes on a phone. */
  bytes: number;
}

export const QURANENC_CATALOGUE: QuranEncEntry[] = (catalogueFile as { translations: QuranEncEntry[] }).translations;

export function catalogueEntry(key: string): QuranEncEntry | undefined {
  return QURANENC_CATALOGUE.find((e) => e.key === key);
}

/** Its page on QuranEnc.com: linked from the credit. */
export function quranEncPageUrl(key: string): string {
  return `https://quranenc.com/en/browse/${key}`;
}

/** QuranEnc's description of a translation (its list), with when it was read. */
export interface QuranEncInfo {
  key: string;
  version: string;
  last_update: number;
  title: string;
  description: string;
  checkedAt: number;
}

export interface QuranEncVerse {
  text: string;
  /** "[n] …" lines, as given; empty when the verse has none. */
  footnotes: string;
  version: string;
}

interface SuraFile {
  key: string;
  version: string;
  sura: number;
  /** [translation, footnotes] per verse, verse 1 first. */
  verses: [string, string][];
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

/** Within `ms` after `at` (a clock set back counts as outside). */
function within(at: number, ms: number): boolean {
  const age = Date.now() - at;
  return age >= 0 && age < ms;
}

// QuranEnc's list, shared by every translation: one request answers for all of them. A list read
// this launch is used for the day; a request in flight is shared.
let listRead: { at: number; entries: Partial<QuranEncInfo>[] } | null = null;
let listLoading: Promise<Partial<QuranEncInfo>[]> | null = null;

function readList(): Promise<Partial<QuranEncInfo>[]> {
  if (listRead && within(listRead.at, CHECK_EVERY_MS)) return Promise.resolve(listRead.entries);
  if (!listLoading) {
    listLoading = (async () => {
      const json = (await getJson(QURANENC_LIST_URL)) as { translations?: Partial<QuranEncInfo>[] };
      if (!Array.isArray(json?.translations)) throw new Error('Unexpected list');
      listRead = { at: Date.now(), entries: json.translations };
      return json.translations;
    })().finally(() => {
      listLoading = null;
    });
  }
  return listLoading;
}

/** The newest version QuranEnc's list gave this launch, if it has been read. */
export function listedVersion(key: string): string | undefined {
  const v = listRead?.entries.find((t) => t.key === key)?.version;
  return typeof v === 'string' && VERSION.test(v) ? v : undefined;
}

function pathOf(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/$/, '');
}

function root(): Directory {
  return new Directory(Paths.document, 'translations');
}

const FILE_NAME = /^(\d{3})-(.+)\.json$/;

function fileName(sura: number, version: string): string {
  return `${String(sura).padStart(3, '0')}-${version}.json`;
}

export interface QuranEncStore {
  readonly key: string;
  getVerse(sura: number, ayah: number): Promise<QuranEncVerse>;
  peekVerse(sura: number, ayah: number): QuranEncVerse | null;
  prefetch(sura: number): void;
  hasSura(sura: number): boolean;
  surasOnPhone(): number;
  onChange(listener: () => void): () => void;
  latestInfo(): Promise<QuranEncInfo>;
  download(stillWanted?: () => boolean, onProgress?: (done: number, total: number) => void): Promise<void>;
  remove(): void;
  reset(): void;
}

export interface StoreOptions {
  /** What this release knows of it, used until QuranEnc's list has been read on this phone. */
  known: QuranEncInfo;
  /** A cache folder (under Caches/translation) from an earlier, unlicensed source, deleted once. */
  legacyCache?: string;
}

/** A translation's store: its suras in memory and on the phone, its version, its download. */
export function createQuranEncStore(key: string, options: StoreOptions): QuranEncStore {
  if (!KEY.test(key)) throw new Error('Unexpected translation key');
  const memory = new Map<number, SuraFile>();
  const loading = new Map<number, Promise<SuraFile>>();
  const refreshing = new Set<number>();
  /** Sura → the version of its file on the phone. Null until the folder is read. */
  let index: Map<number, string> | null = null;
  let info: QuranEncInfo | null = null;
  let infoRead = false;
  let checking: Promise<QuranEncInfo> | null = null;
  let checkFailedAt = 0;
  let backupExcluded = false;
  let generation = 0;
  const listeners = new Set<() => void>();

  const dir = () => new Directory(root(), key);

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

  /** The folder's sura files, read once a launch (and kept up to date). */
  function suraIndex(): Map<number, string> {
    if (index) return index;
    const found = new Map<number, string>();
    if (options.legacyCache) {
      try {
        const old = new Directory(Paths.cache, 'translation', options.legacyCache);
        if (old.exists) old.delete();
      } catch (err) {
        logger.warn('Could not delete the old translation cache', err);
      }
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

  const notify = () => listeners.forEach((l) => l());

  function readInfo(): QuranEncInfo | null {
    if (!infoRead) {
      infoRead = true;
      try {
        const f = new File(dir(), 'info.json');
        if (f.exists) {
          const parsed = JSON.parse(f.textSync()) as QuranEncInfo;
          if (typeof parsed?.version === 'string') info = parsed;
        }
      } catch (err) {
        logger.warn('Could not read the translation info', err);
      }
    }
    return info;
  }

  /** The last version read from QuranEnc's list, or the one this release knows. */
  const knownInfo = (): QuranEncInfo => readInfo() ?? options.known;

  /**
   * The newest version, from QuranEnc's list (read at most once a day; after a failure, not again
   * for 10 minutes). If the list can't be read: the last one read, or the one this release knows.
   */
  function latestInfo(): Promise<QuranEncInfo> {
    const known = readInfo();
    if (known && within(known.checkedAt, CHECK_EVERY_MS)) return Promise.resolve(known);
    if (checkFailedAt > 0 && within(checkFailedAt, RECHECK_AFTER_FAILURE_MS)) return Promise.resolve(knownInfo());
    if (!checking) {
      const gen = generation;
      checking = (async () => {
        try {
          const entry = (await readList()).find((t) => t.key === key);
          if (!entry || typeof entry.version !== 'string' || !VERSION.test(entry.version)) {
            throw new Error(`${key} is not in QuranEnc’s list`);
          }
          const next: QuranEncInfo = {
            key,
            version: entry.version,
            last_update: Number(entry.last_update) || 0,
            title: String(entry.title ?? ''),
            description: String(entry.description ?? ''),
            checkedAt: Date.now(),
          };
          checkFailedAt = 0;
          // Removed meanwhile: nothing is written back.
          if (gen !== generation) return next;
          info = next;
          try {
            new File(ensureDir(), 'info.json').write(JSON.stringify(next));
          } catch (err) {
            logger.warn('Could not save the translation info', err);
          }
          return next;
        } catch (err) {
          logger.warn('Could not read QuranEnc’s list', err);
          checkFailedAt = Date.now();
          return knownInfo();
        }
      })().finally(() => {
        checking = null;
      });
    }
    return checking;
  }

  function store(file: SuraFile, gen: number): void {
    if (gen !== generation) return;
    if (!VERSION.test(file.version)) throw new Error('Unexpected translation version');
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
    notify();
  }

  /** Keeps a sura in memory, unless a newer version is there already. */
  function remember(file: SuraFile): SuraFile {
    const current = memory.get(file.sura);
    if (current && compareVersions(current.version, file.version) > 0) return current;
    memory.set(file.sura, file);
    return file;
  }

  /**
   * One sura from QuranEnc, stored on the phone with `version`. For a download (`strict`), a sura
   * that can't be stored is a failure, and it is kept in memory only if it was there already (the
   * whole translation would sit in memory for the session); for the reader, the text is shown anyway.
   */
  async function fetchSura(sura: number, version: string, strict: boolean): Promise<SuraFile> {
    const gen = generation;
    const json = await getJson(`${API}/translation/sura/${key}/${sura}`);
    const file: SuraFile = { key, version, sura, verses: parseSuraResponse(json, sura) };
    try {
      store(file, gen);
    } catch (err) {
      if (strict) throw err;
      logger.warn('Could not keep a sura of the translation', err);
    }
    if (gen !== generation || (strict && !memory.has(sura))) return file;
    return remember(file);
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
      // Unreadable (or replaced by a newer version meanwhile): see below.
    }
    // Only if it is still the file on record: a download may have replaced it.
    if (suraIndex().get(sura) !== version) return null;
    try {
      if (f.exists) f.delete();
    } catch {
      // Left; replaced when fetched.
    }
    suraIndex().delete(sura);
    return null;
  }

  /**
   * QuranEnc may have a newer version than the one this sura was kept with: asked once a day at
   * most, on any connection, and the sura fetched again if so (its terms: keep it at the latest
   * version). Never fails.
   */
  function refreshIfOutdated(sura: number, version: string): void {
    if (refreshing.has(sura)) return;
    refreshing.add(sura);
    const gen = generation;
    latestInfo()
      .then((latest) =>
        gen === generation && compareVersions(latest.version, version) > 0
          ? fetchSura(sura, latest.version, false)
          : undefined,
      )
      .catch(() => undefined)
      .finally(() => refreshing.delete(sura));
  }

  function loadSura(sura: number): Promise<SuraFile> {
    const known = memory.get(sura);
    if (known) return Promise.resolve(known);
    const pending = loading.get(sura);
    if (pending) return pending;
    const load: Promise<SuraFile> = (async () => {
      const stored = await readSura(sura);
      // Not waiting for QuranEnc's list: labelled with the last version known, and fetched again
      // below if the list says there is a newer one.
      const file = stored ? remember(stored) : await fetchSura(sura, knownInfo().version, false);
      refreshIfOutdated(sura, file.version);
      return file;
    })().finally(() => {
      if (loading.get(sura) === load) loading.delete(sura);
    });
    loading.set(sura, load);
    return load;
  }

  /** A sura older than `version`, or not on the phone. */
  function outdated(sura: number, version: string): boolean {
    const have = suraIndex().get(sura);
    return !have || compareVersions(have, version) < 0;
  }

  return {
    key,
    /** One verse: from memory, the phone, or QuranEnc (and then kept). */
    async getVerse(sura, ayah) {
      const file = await loadSura(sura);
      const verse = file.verses[ayah - 1];
      if (!verse) throw new Error('No such verse');
      return { text: verse[0], footnotes: verse[1], version: file.version };
    },
    /** One verse, if this launch already has its sura in memory. */
    peekVerse(sura, ayah) {
      const file = memory.get(sura);
      const verse = file?.verses[ayah - 1];
      return file && verse ? { text: verse[0], footnotes: verse[1], version: file.version } : null;
    },
    /** Starts loading a sura. Never fails. */
    prefetch(sura) {
      if (sura >= 1 && sura <= QURANENC_SURAS) loadSura(sura).catch(() => undefined);
    },
    /** This sura is on the phone (or in memory): it shows offline. */
    hasSura(sura) {
      return memory.has(sura) || suraIndex().has(sura);
    },
    /** Suras on the phone (any version). */
    surasOnPhone() {
      return suraIndex().size;
    },
    /** Called when a sura is stored or the translation is removed. */
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    latestInfo,
    /**
     * Downloads every sura not on the phone at the newest version. Carries on past a failed sura;
     * stops after 3 in a row. Throws if any failed (the rest are kept). `stillWanted` is asked
     * before each sura; `onProgress` hears the suras on the phone at the newest version.
     */
    async download(stillWanted = () => true, onProgress) {
      const latest = await latestInfo();
      const todo: number[] = [];
      for (let s = 1; s <= QURANENC_SURAS; s++) if (outdated(s, latest.version)) todo.push(s);
      const report = () => onProgress?.(QURANENC_SURAS - todo.filter((s) => outdated(s, latest.version)).length, QURANENC_SURAS);
      report();
      if (todo.length === 0) return;
      let next = 0;
      let failed = 0;
      let inARow = 0;
      await Promise.all(
        Array.from({ length: WORKERS }, async () => {
          while (next < todo.length && inARow < MAX_FAILURES_IN_A_ROW && stillWanted()) {
            const sura = todo[next++];
            // A sura read meanwhile (at the newest version) needn't come again.
            if (!outdated(sura, latest.version)) continue;
            try {
              await fetchSura(sura, latest.version, true);
              inARow = 0;
              report();
            } catch (err) {
              failed++;
              inARow++;
              logger.warn('Translation download failed', err);
            }
          }
        }),
      );
      if (failed > 0) throw new Error('Some suras did not download');
    },
    /** Deletes it from the phone. Suras read later are kept again. */
    remove() {
      generation++;
      memory.clear();
      loading.clear();
      refreshing.clear();
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
      notify();
    },
    /** Test hook. */
    reset() {
      memory.clear();
      loading.clear();
      refreshing.clear();
      index = null;
      info = null;
      infoRead = false;
      checking = null;
      checkFailedAt = 0;
      backupExcluded = false;
      generation = 0;
      listeners.clear();
    },
  };
}

const stores = new Map<string, QuranEncStore>();

/** What this release knows of a catalogue translation (its entry), as an info. */
export function knownInfoOf(entry: QuranEncEntry): QuranEncInfo {
  return {
    key: entry.key,
    version: entry.version,
    last_update: entry.updated,
    title: entry.title,
    description: entry.description,
    checkedAt: 0,
  };
}

/**
 * Copies from an earlier, unlicensed source, cached under Caches/translation and deleted once:
 * Saheeh International as alquran.cloud served it (the app's source before Nov 2026).
 */
const LEGACY_CACHES: Record<string, string> = { english_saheeh: 'en.sahih' };

/** The store of a translation in the catalogue (one per key). Undefined for a key it doesn't list. */
export function quranEncStore(key: string): QuranEncStore | undefined {
  const known = stores.get(key);
  if (known) return known;
  const entry = catalogueEntry(key);
  if (!entry) return undefined;
  const store = createQuranEncStore(key, { known: knownInfoOf(entry), legacyCache: LEGACY_CACHES[key] });
  stores.set(key, store);
  return store;
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const raise = (digits: string) => [...digits].map((d) => SUPERSCRIPT[Number(d)]).join('');
const FOOTNOTE_LINE = /^\[(\d+)\]\s*([\s\S]*)$/;

/** Footnotes as shown under the verse: one per "[n] …" line, its number raised, its text as given. */
export function footnoteLines(footnotes: string): { mark: string; text: string }[] {
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
 * The translation as shown: a "[n]" marker that has its footnote becomes the number, raised (square
 * brackets around words, "[All] praise", stay as they are). Nothing else changes.
 */
export function footnoteSegments(text: string, footnotes: string): TextSegment[] {
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

/** Test hook: every store, and the list read this launch. */
export function __resetQuranEncForTests(): void {
  stores.forEach((s) => s.reset());
  listRead = null;
  listLoading = null;
}
