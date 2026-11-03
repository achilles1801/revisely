// Saheeh International from QuranEnc.com (lib/saheeh): kept as read, downloaded whole, kept up to date.
const mockFiles = new Map<string, string>();
const mockDirs = new Set<string>();
const mockExcluded: string[] = [];
let mockWriteFails: (uri: string) => boolean = () => false;

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').pop() as string;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.set(this.uri, '');
    }
    write(text: string) {
      if (mockWriteFails(this.uri)) throw new Error('No space left on device');
      mockFiles.set(this.uri, text);
    }
    async text() {
      return mockFiles.get(this.uri) as string;
    }
    textSync() {
      return mockFiles.get(this.uri) as string;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    move(to: { uri: string }) {
      mockFiles.set(to.uri, mockFiles.get(this.uri) as string);
      mockFiles.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockDirs.has(this.uri) || [...mockFiles.keys()].some((k) => k.startsWith(`${this.uri}/`));
    }
    create() {
      mockDirs.add(this.uri);
    }
    delete() {
      for (const k of [...mockFiles.keys()]) if (k.startsWith(`${this.uri}/`)) mockFiles.delete(k);
      for (const d of [...mockDirs]) if (d === this.uri || d.startsWith(`${this.uri}/`)) mockDirs.delete(d);
    }
    list() {
      return [...mockFiles.keys()]
        .filter((k) => k.startsWith(`${this.uri}/`) && !k.slice(this.uri.length + 1).includes('/'))
        .map((k) => new File(k));
    }
  }
  return { Directory, File, Paths: { cache: 'file:///caches', document: 'file:///documents' } };
});
jest.mock('../../../modules/recitation-audio', () => ({
  __esModule: true,
  default: { excludeFromBackup: (path: string) => mockExcluded.push(path) },
}));

import { Platform } from 'react-native';
import { getSurahDisplay } from '../quranData';
import {
  __resetSaheehForTests,
  compareVersions,
  downloadSaheeh,
  getSaheehVerse,
  hasSaheehSura,
  latestSaheehInfo,
  onSaheehChange,
  parseSuraResponse,
  peekSaheehVerse,
  removeSaheeh,
  saheehFootnotes,
  saheehSegments,
  saheehSurasOnPhone,
  SAHEEH_KNOWN,
} from '../saheeh';

const DIR = 'file:///documents/translations/english_saheeh';
const LIST = 'https://quranenc.com/api/v1/translations/list/en';
const sura = (n: number) => `https://quranenc.com/api/v1/translation/sura/english_saheeh/${n}`;

let version = '1.1.2';
let offline = false;
let failSura: (n: number) => boolean = () => false;
let fetched: string[] = [];

/** QuranEnc's answer for a sura (made up, the real shape: ids, the Arabic, strings for numbers). */
function suraResponse(n: number) {
  const count = getSurahDisplay(n)!.ayahCount;
  return {
    result: Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      sura: String(n),
      aya: String(i + 1),
      arabic_text: 'عربي',
      translation: `v${version} ${n}:${i + 1}${i === 0 ? '[7]' : ''}`,
      footnotes: i === 0 ? `[7] A footnote to ${n}:1.` : '',
    })),
  };
}

function listResponse() {
  return {
    translations: [
      { key: 'english_rwwad', version: '1.0.20', last_update: 1, title: 'Rowwad', description: '' },
      {
        key: 'english_saheeh',
        version,
        last_update: 1750772247,
        title: 'English Translation - Noor International Center',
        description: 'Issued by Noor International Center.',
      },
    ],
  };
}

beforeEach(() => {
  mockFiles.clear();
  mockDirs.clear();
  mockExcluded.length = 0;
  mockWriteFails = () => false;
  __resetSaheehForTests();
  version = '1.1.2';
  offline = false;
  failSura = () => false;
  fetched = [];
  (global as any).fetch = jest.fn(async (url: string) => {
    fetched.push(url);
    if (offline) throw new TypeError('Network request failed');
    if (url === LIST) return { ok: true, status: 200, json: async () => listResponse() };
    const m = /\/sura\/english_saheeh\/(\d+)$/.exec(url);
    if (m && !failSura(Number(m[1]))) return { ok: true, status: 200, json: async () => suraResponse(Number(m[1])) };
    return { ok: false, status: 503, json: async () => ({}) };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('QuranEnc’s sura response', () => {
  it('keeps each verse’s translation and footnotes exactly as given', () => {
    expect(parseSuraResponse(suraResponse(1), 1)[0]).toEqual(['v1.1.2 1:1[7]', '[7] A footnote to 1:1.']);
    expect(parseSuraResponse(suraResponse(2), 2)).toHaveLength(286);
  });

  it('refuses anything that isn’t that whole sura, in order', () => {
    const short = suraResponse(2);
    short.result.pop();
    expect(() => parseSuraResponse(short, 2)).toThrow();
    expect(() => parseSuraResponse(suraResponse(3), 2)).toThrow();
    const swapped = suraResponse(1);
    [swapped.result[0], swapped.result[1]] = [swapped.result[1], swapped.result[0]];
    expect(() => parseSuraResponse(swapped, 1)).toThrow();
    expect(() => parseSuraResponse({ status: 0, error: 'x' }, 1)).toThrow();
  });
});

describe('reading a verse', () => {
  it('fetches its sura once, keeps it on the phone with its version, out of iCloud backups', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(await getSaheehVerse(2, 1)).toEqual({
      text: 'v1.1.2 2:1[7]',
      footnotes: '[7] A footnote to 2:1.',
      version: '1.1.2',
    });
    expect((await getSaheehVerse(2, 255)).text).toBe('v1.1.2 2:255');
    expect(fetched.sort()).toEqual([LIST, sura(2)].sort());
    expect(mockFiles.has(`${DIR}/002-1.1.2.json`)).toBe(true);
    expect(mockExcluded).toEqual(['/documents/translations']);
    // QuranEnc's description of it, kept with it (its terms: the transcript information).
    expect(JSON.parse(mockFiles.get(`${DIR}/info.json`)!)).toMatchObject({
      key: 'english_saheeh',
      version: '1.1.2',
      title: 'English Translation - Noor International Center',
      description: 'Issued by Noor International Center.',
    });
    expect(peekSaheehVerse(2, 2)?.text).toBe('v1.1.2 2:2');
    expect(peekSaheehVerse(3, 1)).toBeNull();
  });

  it('shows a sura read before offline, after a restart', async () => {
    await getSaheehVerse(18, 10);
    __resetSaheehForTests();
    offline = true;
    fetched = [];
    expect(await getSaheehVerse(18, 10)).toEqual({ text: 'v1.1.2 18:10', footnotes: '', version: '1.1.2' });
    expect(hasSaheehSura(18)).toBe(true);
    expect(hasSaheehSura(19)).toBe(false);
    await expect(getSaheehVerse(19, 1)).rejects.toThrow();
  });

  it('a damaged file is fetched again', async () => {
    await getSaheehVerse(5, 1);
    mockFiles.set(`${DIR}/005-1.1.2.json`, '{"sura":5,"verses":[');
    __resetSaheehForTests();
    fetched = [];
    expect((await getSaheehVerse(5, 3)).text).toBe('v1.1.2 5:3');
    expect(fetched).toContain(sura(5));
  });

  it('deletes the copy alquran.cloud served (unlicensed)', async () => {
    mockFiles.set('file:///caches/translation/en.sahih/50.json', '[]');
    mockFiles.set('file:///caches/translation/quran-uthmani/50.json', '[]');
    saheehSurasOnPhone();
    expect([...mockFiles.keys()]).toEqual(['file:///caches/translation/quran-uthmani/50.json']);
  });

  it('uses the version this release knows if QuranEnc’s list can’t be read', async () => {
    (global as any).fetch = jest.fn(async (url: string) =>
      url === LIST ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, json: async () => suraResponse(1) },
    );
    expect((await getSaheehVerse(1, 1)).version).toBe(SAHEEH_KNOWN.version);
  });
});

describe('the whole translation', () => {
  it('downloads every sura, then nothing more until there is a new version', async () => {
    const changes = jest.fn();
    onSaheehChange(changes);
    await downloadSaheeh();
    expect(saheehSurasOnPhone()).toBe(114);
    expect(fetched.filter((u) => u.includes('/sura/'))).toHaveLength(114);
    expect(changes).toHaveBeenCalledTimes(114);
    fetched = [];
    await downloadSaheeh();
    // The list was read less than a day ago, and every sura is at its version.
    expect(fetched).toEqual([]);
  });

  it('skips a sura already read', async () => {
    await getSaheehVerse(2, 1);
    fetched = [];
    await downloadSaheeh();
    expect(fetched).not.toContain(sura(2));
    expect(fetched.filter((u) => u.includes('/sura/'))).toHaveLength(113);
  });

  it('keeps what came when some fail, and fetches only the rest next time', async () => {
    failSura = (n) => n === 40;
    await expect(downloadSaheeh()).rejects.toThrow();
    const kept = saheehSurasOnPhone();
    expect(kept).toBeGreaterThan(0);
    expect(hasSaheehSura(40)).toBe(false);
    failSura = () => false;
    fetched = [];
    await downloadSaheeh();
    expect(saheehSurasOnPhone()).toBe(114);
    expect(fetched.filter((u) => u.includes('/sura/'))).toHaveLength(114 - kept);
  });

  it('stops between suras when no longer wanted', async () => {
    let n = 0;
    await downloadSaheeh(() => ++n <= 10);
    expect(saheehSurasOnPhone()).toBe(10);
  });

  it('a new version: checked once a day, every sura downloaded again, each shown with its own version until then', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);
    await downloadSaheeh();
    version = '1.1.3';
    // Within the day: still 1.1.2.
    await downloadSaheeh();
    expect((await getSaheehVerse(2, 1)).version).toBe('1.1.2');
    expect(await latestSaheehInfo()).toMatchObject({ version: '1.1.2' });

    jest.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000 + 25 * 3_600_000);
    expect(await latestSaheehInfo()).toMatchObject({ version: '1.1.3' });
    // Not downloaded yet: the sura on the phone, with its own version.
    expect(await getSaheehVerse(2, 1)).toMatchObject({ text: 'v1.1.2 2:1[7]', version: '1.1.2' });
    fetched = [];
    await downloadSaheeh();
    expect(fetched.filter((u) => u.includes('/sura/'))).toHaveLength(114);
    expect(await getSaheehVerse(2, 1)).toMatchObject({ text: 'v1.1.3 2:1[7]', version: '1.1.3' });
    const names = [...mockFiles.keys()].filter((k) => k.startsWith(DIR)).map((k) => k.slice(DIR.length + 1));
    expect(names.filter((n) => n.endsWith('-1.1.2.json'))).toEqual([]);
    expect(names.filter((n) => n.endsWith('-1.1.3.json'))).toHaveLength(114);
  });

  it('an update cut short leaves two versions of a sura: the newer is kept', async () => {
    mockFiles.set(`${DIR}/001-1.1.2.json`, JSON.stringify({ key: 'english_saheeh', version: '1.1.2', sura: 1, verses: [] }));
    mockFiles.set(
      `${DIR}/001-1.1.10.json`,
      JSON.stringify({
        key: 'english_saheeh',
        version: '1.1.10',
        sura: 1,
        verses: Array.from({ length: 7 }, (_, i) => [`new 1:${i + 1}`, '']),
      }),
    );
    offline = true;
    expect(await getSaheehVerse(1, 2)).toEqual({ text: 'new 1:2', footnotes: '', version: '1.1.10' });
    expect(mockFiles.has(`${DIR}/001-1.1.2.json`)).toBe(false);
  });

  it('is removed with the offline mushaf, and suras in flight then aren’t written', async () => {
    await getSaheehVerse(1, 1);
    let removed = false;
    // Two at a time: when Remove comes, the other sura is still on its way.
    await downloadSaheeh(() => {
      if (!removed && saheehSurasOnPhone() > 5) {
        removed = true;
        removeSaheeh();
      }
      return !removed;
    });
    expect(removed).toBe(true);
    expect(saheehSurasOnPhone()).toBe(0);
    expect([...mockFiles.keys()].filter((k) => k.startsWith(DIR))).toEqual([]);
    expect(peekSaheehVerse(1, 1)).toBeNull();
    // Read again later: kept again.
    await getSaheehVerse(1, 1);
    expect(saheehSurasOnPhone()).toBe(1);
  });
});

describe('keeping it at the latest version, and failing well', () => {
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  };

  it('a sura read is fetched again when QuranEnc has a newer version: no offline download needed', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);
    await getSaheehVerse(2, 1);
    await settle();
    version = '1.1.3';
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000 + 25 * 3_600_000);
    __resetSaheehForTests(); // a later launch
    fetched = [];
    // Shown at once from the phone, with its own version…
    expect(await getSaheehVerse(2, 1)).toMatchObject({ text: 'v1.1.2 2:1[7]', version: '1.1.2' });
    await settle();
    // …then the list says 1.1.3, and the sura comes again.
    expect(fetched.sort()).toEqual([LIST, sura(2)].sort());
    expect(await getSaheehVerse(2, 1)).toMatchObject({ text: 'v1.1.3 2:1[7]', version: '1.1.3' });
    expect(mockFiles.has(`${DIR}/002-1.1.3.json`)).toBe(true);
    expect(mockFiles.has(`${DIR}/002-1.1.2.json`)).toBe(false);
  });

  it('a list that can’t be read is asked once, not before every sura', async () => {
    (global as any).fetch = jest.fn(async (url: string) => {
      fetched.push(url);
      if (url === LIST) return { ok: false, status: 500, json: async () => ({}) };
      const n = Number(/\/(\d+)$/.exec(url)![1]);
      return { ok: true, status: 200, json: async () => suraResponse(n) };
    });
    await downloadSaheeh();
    expect(saheehSurasOnPhone()).toBe(114);
    expect(fetched.filter((u) => u === LIST)).toHaveLength(1);
    expect((await getSaheehVerse(9, 1)).version).toBe(SAHEEH_KNOWN.version);
  });

  it('carries on past a sura that fails every time, and says it failed', async () => {
    failSura = (n) => n === 40;
    await expect(downloadSaheeh()).rejects.toThrow();
    expect(saheehSurasOnPhone()).toBe(113);
    expect(hasSaheehSura(40)).toBe(false);
  });

  it('stops after three failures in a row (QuranEnc in trouble)', async () => {
    failSura = (n) => n > 10;
    await expect(downloadSaheeh()).rejects.toThrow();
    expect(saheehSurasOnPhone()).toBe(10);
    expect(fetched.filter((u) => u.includes('/sura/')).length).toBeLessThan(16);
  });

  it('a sura that can’t be kept (a full phone) is a failure for the download, but still shown when read', async () => {
    mockWriteFails = (uri) => uri.includes('/050-');
    await expect(downloadSaheeh()).rejects.toThrow();
    expect(hasSaheehSura(50)).toBe(false);
    expect((await getSaheehVerse(50, 1)).text).toBe('v1.1.2 50:1[7]');
  });

  it('the download doesn’t hold the whole translation in memory', async () => {
    await getSaheehVerse(1, 1);
    await downloadSaheeh();
    expect(peekSaheehVerse(1, 1)).not.toBeNull();
    expect(peekSaheehVerse(2, 1)).toBeNull();
    expect((await getSaheehVerse(2, 1)).text).toBe('v1.1.2 2:1[7]');
  });

  it('a clock set back (a list read “in the future”) doesn’t stop the checks', async () => {
    mockFiles.set(`${DIR}/info.json`, JSON.stringify({ ...SAHEEH_KNOWN, checkedAt: Date.now() + 30 * 86_400_000 }));
    expect(await latestSaheehInfo()).toMatchObject({ version: '1.1.2' });
    expect(fetched).toEqual([LIST]);
  });

  it('a version that couldn’t be a file name is not used', async () => {
    version = '1.2/../x';
    expect((await latestSaheehInfo()).version).toBe(SAHEEH_KNOWN.version);
  });
});

describe('how it is shown', () => {
  it('raises a footnote marker; brackets around words stay', () => {
    expect(saheehSegments('[All] praise is [due] to Allāh, Lord[4] of the worlds -', '[4] When referring…')).toEqual([
      { text: '[All] praise is [due] to Allāh, Lord' },
      { footnote: '⁴' },
      { text: ' of the worlds -' },
    ]);
    expect(saheehSegments('In the name of Allāh,[2] the Merciful.[3]', '[2] A.\n[3] B.')).toEqual([
      { text: 'In the name of Allāh,' },
      { footnote: '²' },
      { text: ' the Merciful.' },
      { footnote: '³' },
    ]);
    // A number without its footnote is left as written.
    expect(saheehSegments('See [12] here.', '')).toEqual([{ text: 'See [12] here.' }]);
    expect(saheehSegments('See [12] here.', '[13] Other.')).toEqual([{ text: 'See [12] here.' }]);
  });

  it('lists the footnotes as given, each number raised', () => {
    expect(saheehFootnotes('[98] Whose life is perfect.\n[99] Dependent on none.')).toEqual([
      { mark: '⁹⁸', text: 'Whose life is perfect.' },
      { mark: '⁹⁹', text: 'Dependent on none.' },
    ]);
    expect(saheehFootnotes('')).toEqual([]);
    expect(saheehFootnotes('A note without a number.')).toEqual([{ mark: '', text: 'A note without a number.' }]);
  });

  it('compares versions by number', () => {
    expect(compareVersions('1.1.10', '1.1.2')).toBeGreaterThan(0);
    expect(compareVersions('1.1.2', '1.1.2')).toBe(0);
    expect(compareVersions('1.0.20', '1.1')).toBeLessThan(0);
  });
});
