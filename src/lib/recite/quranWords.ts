// Every word of the Qur'an: its text and where it sits on the mushaf pages.
//
// src/data/quranWords.dat (JSON) is built by scripts/build-quran-words.py from
// quran.com's word text and the glyph bounds of the page images (the same source
// as ayahBounds.json). It is an asset rather than part of the JavaScript bundle,
// so an update that doesn't change it doesn't download its 3 MB again; it is read
// once, the first time recitation checking needs it.
//
// Words are numbered 0..77428 in mushaf order. Pages run in the same order, so a
// page's words are one contiguous range.

import { looseWord, normalizeWord } from './arabic';
import { getSurahDisplay } from '../quranData';
import type { Rect } from '../ayahBounds';

export interface QuranWordsData {
  v: number;
  /** Words in each verse, in mushaf order (6236). */
  counts: number[];
  /** Each verse's words in Uthmani script, separated by spaces. */
  uthmani: string[];
  /** Each verse's words in standard spelling, no diacritics. */
  imlaei: string[];
  /** page, line, x0, x1 of every word (1024-wide page space). */
  boxes: number[];
  /** Per page: line, y0, y1, ... */
  lines: Record<string, number[]>;
}

export interface WordRef {
  sura: number;
  ayah: number;
  /** 1-based position in its verse. */
  position: number;
  page: number;
}

/** Words of a verse may contain a no-break space (يا أيها is one word on the page). */
const WORD_SPACE = ' ';

export class QuranWords {
  readonly count: number;
  private readonly sura: Uint8Array;
  private readonly ayah: Uint16Array;
  private readonly position: Uint16Array;
  private readonly page: Uint16Array;
  private readonly line: Uint8Array;
  private readonly x0: Uint16Array;
  private readonly x1: Uint16Array;
  /** First word of each verse, by verse number in mushaf order (0-based). */
  private readonly verseStart: Int32Array;
  /** verseIndexOf[sura] = index of its first verse. */
  private readonly suraVerse: Int32Array;
  /** First word of each page; pageStart[605] = count. */
  private readonly pageStart: Int32Array;
  private readonly lineBands: Map<number, Map<number, [number, number]>>;
  private readonly uthmaniWords: string[];
  /** Standard spelling, normalised (the main way a word is recognised). */
  private readonly keyList: string[];
  /** The Uthmani spelling, normalised, where it differs (الصلوة / الصلاة). */
  private readonly altKeyList: (string | null)[];
  /** The parts of a word written with a space (يا أيها), normalised. */
  private readonly partList: (string[] | null)[];
  /** Without hamzas (looseWord), to accept يأوده for يئوده. */
  private readonly looseList: string[];

  constructor(data: QuranWordsData) {
    const total = data.counts.reduce((a, b) => a + b, 0);
    this.count = total;
    this.sura = new Uint8Array(total);
    this.ayah = new Uint16Array(total);
    this.position = new Uint16Array(total);
    this.page = new Uint16Array(total);
    this.line = new Uint8Array(total);
    this.x0 = new Uint16Array(total);
    this.x1 = new Uint16Array(total);
    this.verseStart = new Int32Array(data.counts.length + 1);
    this.suraVerse = new Int32Array(116);
    this.pageStart = new Int32Array(606).fill(-1);
    this.uthmaniWords = new Array(total);
    this.keyList = new Array(total);
    this.altKeyList = new Array(total);
    this.partList = new Array(total);
    this.looseList = new Array(total);

    let w = 0;
    let sura = 1;
    let ayah = 0;
    for (let v = 0; v < data.counts.length; v++) {
      // Verse numbering restarts with each surah; counts run through the mushaf.
      ayah += 1;
      if (v > 0 && ayah > (getSurahDisplay(sura)?.ayahCount ?? 0)) {
        sura += 1;
        ayah = 1;
      }
      if (ayah === 1) this.suraVerse[sura] = v;
      this.verseStart[v] = w;
      const u = data.uthmani[v].split(' ');
      const s = data.imlaei[v].split(' ');
      for (let p = 0; p < data.counts[v]; p++, w++) {
        this.sura[w] = sura;
        this.ayah[w] = ayah;
        this.position[w] = p + 1;
        const b = w * 4;
        this.page[w] = data.boxes[b];
        this.line[w] = data.boxes[b + 1];
        this.x0[w] = data.boxes[b + 2];
        this.x1[w] = data.boxes[b + 3];
        this.uthmaniWords[w] = (u[p] ?? '').replace(/ /g, ' ');
        const parts = (s[p] ?? '').split(WORD_SPACE).map(normalizeWord).filter(Boolean);
        const key = parts.join('');
        this.keyList[w] = key;
        this.partList[w] = parts.length > 1 ? parts : null;
        this.looseList[w] = looseWord((s[p] ?? '').replace(/\u00A0/g, ''));
        const alt = normalizeWord((u[p] ?? '').replace(/ /g, ''));
        this.altKeyList[w] = alt && alt !== key ? alt : null;
      }
    }
    this.verseStart[data.counts.length] = w;
    this.suraVerse[115] = data.counts.length;

    for (let i = total - 1; i >= 0; i--) this.pageStart[this.page[i]] = i;
    this.pageStart[605] = total;
    for (let p = 604; p >= 1; p--) if (this.pageStart[p] < 0) this.pageStart[p] = this.pageStart[p + 1];

    this.lineBands = new Map();
    for (const [pageKey, flat] of Object.entries(data.lines)) {
      const m = new Map<number, [number, number]>();
      for (let i = 0; i + 2 < flat.length; i += 3) m.set(flat[i], [flat[i + 1], flat[i + 2]]);
      this.lineBands.set(Number(pageKey), m);
    }
  }

  ref(i: number): WordRef {
    return { sura: this.sura[i], ayah: this.ayah[i], position: this.position[i], page: this.page[i] };
  }

  pageOf(i: number): number {
    return this.page[i];
  }

  /** Ways the word may be heard, normalised: standard spelling first. */
  keys(i: number): string[] {
    const alt = this.altKeyList[i];
    return alt ? [this.keyList[i], alt] : [this.keyList[i]];
  }

  /** The word without hamzas (see looseWord). */
  looseKey(i: number): string {
    return this.looseList[i];
  }

  /** A word written with a space, as its normalised parts (يا, ايها); else null. */
  parts(i: number): string[] | null {
    return this.partList[i];
  }

  /** The word as printed (Uthmani). */
  uthmani(i: number): string {
    return this.uthmaniWords[i];
  }

  /** The words of a page: [first, end). */
  pageRange(page: number): [number, number] {
    const p = Math.min(604, Math.max(1, page));
    return [this.pageStart[p], this.pageStart[p + 1]];
  }

  /** The words of a verse: [first, end). */
  verseRange(sura: number, ayah: number): [number, number] {
    const v = this.suraVerse[sura] + ayah - 1;
    return [this.verseStart[v], this.verseStart[v + 1]];
  }

  /** Index of the first word of a verse. */
  verseFirstWord(sura: number, ayah: number): number {
    return this.verseRange(sura, ayah)[0];
  }

  /** Whether two words are in the same verse. */
  sameVerse(a: number, b: number): boolean {
    return this.sura[a] === this.sura[b] && this.ayah[a] === this.ayah[b];
  }

  /** The word's box on its page (1024-wide space), the full height of its line. */
  rect(i: number): Rect {
    const band = this.lineBands.get(this.page[i])?.get(this.line[i]) ?? [0, 0];
    return { x0: this.x0[i], y0: band[0], x1: this.x1[i], y1: band[1] };
  }

  /** The word under a point on a page, or null (margins, headers, verse markers). */
  wordAt(page: number, x: number, y: number): number | null {
    const [start, end] = this.pageRange(page);
    for (let i = start; i < end; i++) {
      const r = this.rect(i);
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return i;
    }
    return null;
  }
}

let loaded: QuranWords | null = null;
let loading: Promise<QuranWords> | null = null;

/** The word data, read from its asset the first time. */
export function loadQuranWords(): Promise<QuranWords> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = readAsset()
      .then((data) => {
        loaded = new QuranWords(data);
        return loaded;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

/** The word data if it has been loaded, else null. */
export function getQuranWords(): QuranWords | null {
  return loaded;
}

/** Tests: use this data instead of the asset. */
export function setQuranWordsForTests(data: QuranWordsData | null): void {
  loaded = data ? new QuranWords(data) : null;
  loading = null;
}

async function readAsset(): Promise<QuranWordsData> {
  // Required here so tests and screens that never check recitation don't load it.
  const { Asset } = require('expo-asset') as typeof import('expo-asset');
  const { File } = require('expo-file-system') as typeof import('expo-file-system');
  const asset = Asset.fromModule(require('../../data/quranWords.dat'));
  if (!asset.localUri) await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return JSON.parse(await new File(uri).text()) as QuranWordsData;
}
