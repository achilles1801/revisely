// The page store, the Arabic text and Saheeh International, faked: they "download" at once unless told otherwise.
// Pages are kept per edition (lib/mushafEdition); mockPhone is the 1405 pages.
const mockPhone = new Set<number>();
const mockPhone1441 = new Set<number>();
const mockPhoneOf = (edition: string) => (edition === 'madani1441' ? mockPhone1441 : mockPhone);
let mockFail: (page: number) => boolean = () => false;
let mockStored: ((page: number, edition: string) => void) | null = null;
let mockRemoved: ((page: number, edition: string) => void) | null = null;
const mockDownloadedEditions: string[] = [];
let mockArabicCalls = 0;
let mockDuringArabic: () => void = () => undefined;
const mockDownloaded: number[] = [];
let mockArabic = false;
let mockArabicFails = false;
let mockFree: number | null = 10e9;
let mockBeforeDownload: (page: number) => void = () => undefined;
let mockSaheeh = 0;
let mockSaheehFails = false;
let mockSaheehCalls = 0;
let mockSaheehChange: (() => void) | null = null;

jest.mock('../pageCache', () => {
  const mockSizes = require('../../data/mushafSizes.json');
  const edition = () => require('../mushafEdition').getMushafEdition();
  return {
    PAGE_COUNT: 604,
    cachePage: async (page: number, ed: string = edition()) => {
      mockBeforeDownload(page);
      await Promise.resolve();
      if (mockFail(page)) return null;
      mockDownloaded.push(page);
      mockDownloadedEditions.push(ed);
      mockPhoneOf(ed).add(page);
      mockStored?.(page, ed);
      return `documents/mushaf/full/${page}.png`;
    },
    migrateLegacyPages: () => undefined,
    onPageStored: (l: (page: number, edition: string) => void) => {
      mockStored = l;
      return () => {
        mockStored = null;
      };
    },
    onPageRemoved: (l: (page: number, edition: string) => void) => {
      mockRemoved = l;
      return () => {
        mockRemoved = null;
      };
    },
    pagesOnPhone: (ed: string = edition()) => new Set(mockPhoneOf(ed)),
    pageSizeTable: (ed: string = edition()) => (ed === 'madani1441' ? mockSizes['1441/w1440'] : mockSizes.full) ?? [],
    removeAllPages: () => {
      mockPhone.clear();
      mockPhone1441.clear();
    },
    removeEditionPages: (ed: string) => mockPhoneOf(ed).clear(),
  };
});
jest.mock('../translation', () => ({
  hasArabicText: () => mockArabic,
  downloadArabicText: async (stillWanted: () => boolean = () => true) => {
    mockArabicCalls++;
    mockDuringArabic();
    await Promise.resolve();
    if (mockArabicFails) throw new Error('offline');
    if (stillWanted()) mockArabic = true;
  },
  removeArabicText: () => {
    mockArabic = false;
  },
}));
jest.mock('../saheeh', () => ({
  SAHEEH_SURAS: 114,
  SAHEEH_BYTES: 1_093_165,
  saheehSurasOnPhone: () => mockSaheeh,
  onSaheehChange: (l: () => void) => {
    mockSaheehChange = l;
    return () => {
      mockSaheehChange = null;
    };
  },
  downloadSaheeh: async (stillWanted: () => boolean = () => true) => {
    mockSaheehCalls++;
    await Promise.resolve();
    if (mockSaheehFails) throw new Error('offline');
    if (stillWanted()) {
      mockSaheeh = 114;
      mockSaheehChange?.();
    }
  },
  removeSaheeh: () => {
    mockSaheeh = 0;
  },
}));
jest.mock('expo-file-system', () => ({
  Paths: {
    get availableDiskSpace() {
      return mockFree;
    },
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import sizes from '../../data/mushafSizes.json';
import {
  __resetMushafOfflineForTests,
  ARABIC_TEXT_BYTES,
  downloadMushafNow,
  getMushafStatus,
  prepareMushafOffline,
  removeMushafDownload,
  setMushafActive,
  setMushafCellular,
  settleMushafDownload,
  startMushafOffline,
} from '../mushafOffline';
import { describeMushaf, formatMegabytes } from '../mushafOfflineUi';
import { __resetNetworkStateForTests, setNetworkState } from '../networkState';
import { __resetPageImageSetForTests } from '../quranImages';
import { __resetMushafEditionForTests, setMushafEdition } from '../mushafEdition';
import { otherEditionsOnPhone, removeOtherEditionPages } from '../mushafOffline';

const WIFI = { connected: true, type: 'wifi' };
const CELLULAR = { connected: true, type: 'cellular' };
const OFFLINE = { connected: false, type: 'none' };
const PAGE_BYTES = (sizes.full as number[]).reduce((a, b) => a + b, 0);
const FULL_BYTES = PAGE_BYTES + ARABIC_TEXT_BYTES + 1_093_165;

async function settle() {
  for (let i = 0; i < 5; i++) {
    await settleMushafDownload();
    await new Promise((r) => setImmediate(r));
  }
}

beforeEach(async () => {
  __resetMushafOfflineForTests();
  __resetNetworkStateForTests();
  __resetPageImageSetForTests();
  __resetMushafEditionForTests();
  mockPhone.clear();
  mockPhone1441.clear();
  mockDownloaded.length = 0;
  mockDownloadedEditions.length = 0;
  mockFail = () => false;
  mockStored = null;
  mockRemoved = null;
  mockArabicCalls = 0;
  mockDuringArabic = () => undefined;
  mockArabic = false;
  mockArabicFails = false;
  mockFree = 10e9;
  mockBeforeDownload = () => undefined;
  mockSaheeh = 0;
  mockSaheehFails = false;
  mockSaheehCalls = 0;
  mockSaheehChange = null;
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the offline mushaf download', () => {
  it('waits for the start, then downloads every page, the Arabic text and Saheeh International on Wi-Fi', async () => {
    setNetworkState(WIFI);
    await prepareMushafOffline();
    await settle();
    expect(mockDownloaded).toEqual([]);
    expect(getMushafStatus().phase).toBe('pending');

    startMushafOffline();
    await settle();
    expect(mockPhone.size).toBe(604);
    expect(mockArabic).toBe(true);
    expect(mockSaheeh).toBe(114);
    const s = getMushafStatus();
    expect(s.phase).toBe('complete');
    expect(s.textReady).toBe(true);
    expect(s.bytes).toBe(FULL_BYTES);
    expect(describeMushaf(s)).toEqual({
      value: 'Downloaded',
      subtitle: 'All 604 pages and Saheeh International · 250\u00A0MB',
    });
  });

  it('downloads only the pages it doesn’t have, in order', async () => {
    for (let p = 1; p <= 600; p++) mockPhone.add(p);
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(mockDownloaded.sort((a, b) => a - b)).toEqual([601, 602, 603, 604]);
  });

  it('waits for Wi-Fi on mobile data', async () => {
    setNetworkState(CELLULAR);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(mockDownloaded).toEqual([]);
    expect(getMushafStatus().phase).toBe('waiting-for-wifi');
    expect(describeMushaf(getMushafStatus()).subtitle).toBe('Waiting for Wi-Fi · 0 of 604 pages');

    setNetworkState(WIFI);
    await settle();
    expect(getMushafStatus().phase).toBe('complete');
  });

  it('treats a metered network (a hotspot) as mobile data', async () => {
    setNetworkState({ connected: true, type: 'wifi', expensive: true });
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(getMushafStatus().phase).toBe('waiting-for-wifi');
  });

  it('uses mobile data once allowed, and stops between pages when it is turned off', async () => {
    setNetworkState(CELLULAR);
    await prepareMushafOffline();
    startMushafOffline();
    mockBeforeDownload = (page) => {
      if (page === 100) void setMushafCellular(false);
    };
    await setMushafCellular(true);
    await settle();
    expect(mockPhone.size).toBeGreaterThan(90);
    expect(mockPhone.size).toBeLessThan(110);
    expect(getMushafStatus().phase).toBe('waiting-for-wifi');
    expect(JSON.parse((await AsyncStorage.getItem('@revisely_mushaf_offline:v1')) as string)).toEqual({
      auto: true,
      cellular: false,
    });
  });

  it('downloads over mobile data for one "Download now"', async () => {
    setNetworkState(CELLULAR);
    await prepareMushafOffline();
    await downloadMushafNow({ overMobileData: true });
    await settle();
    expect(getMushafStatus().phase).toBe('complete');
    expect(getMushafStatus().prefs.cellular).toBe(false);
  });

  it('stops when the connection goes and carries on from there when it is back', async () => {
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    mockFail = () => false;
    mockBeforeDownload = (page) => {
      if (page === 200) {
        setNetworkState(OFFLINE);
        mockFail = () => true;
      }
    };
    await settle();
    expect(getMushafStatus().phase).toBe('offline');
    const before = mockPhone.size;
    expect(before).toBeGreaterThan(190);
    expect(before).toBeLessThan(210);
    expect(describeMushaf(getMushafStatus()).subtitle).toBe(`Continues when you're online · ${before} of 604 pages`);

    mockFail = () => false;
    mockBeforeDownload = () => undefined;
    const downloadedBefore = mockDownloaded.length;
    setNetworkState(WIFI);
    await settle();
    expect(getMushafStatus().phase).toBe('complete');
    // Nothing downloaded twice.
    expect(mockDownloaded.length - downloadedBefore).toBe(604 - before);
    expect(new Set(mockDownloaded).size).toBe(mockDownloaded.length);
  });

  it('stops while the app is in the background and resumes when it comes back', async () => {
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    mockBeforeDownload = (page) => {
      if (page === 50) setMushafActive(false);
    };
    await settle();
    expect(mockPhone.size).toBeLessThan(60);
    expect(getMushafStatus().phase).toBe('pending');
    mockBeforeDownload = () => undefined;
    setMushafActive(true);
    await settle();
    expect(getMushafStatus().phase).toBe('complete');
  });

  it('tries failed pages again later', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    setNetworkState(WIFI);
    await prepareMushafOffline();
    mockFail = (page) => page % 100 === 0;
    startMushafOffline();
    await settle();
    expect(getMushafStatus().phase).toBe('error');
    expect(mockPhone.size).toBe(598);
    expect(describeMushaf(getMushafStatus()).subtitle).toBe("Some of it didn't download · tries again soon");

    mockFail = () => false;
    jest.advanceTimersByTime(60_000);
    await settle();
    expect(getMushafStatus().phase).toBe('complete');
  });

  it('carries on without the Arabic text if it fails (tried again next time)', async () => {
    mockArabicFails = true;
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(mockPhone.size).toBe(604);
    expect(mockSaheeh).toBe(114);
    expect(mockArabic).toBe(false);
    // Not done until the text is here too.
    expect(getMushafStatus().phase).toBe('error');
    expect(getMushafStatus().textReady).toBe(false);
  });

  it('gets the Arabic text on a later run when every page is already here', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    for (let p = 1; p <= 604; p++) mockPhone.add(p);
    mockSaheeh = 114;
    mockArabicFails = true;
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(mockArabic).toBe(false);
    expect(getMushafStatus().phase).toBe('error');
    expect(describeMushaf(getMushafStatus()).subtitle).toBe("Some of it didn't download · tries again soon");
    mockArabicFails = false;
    // After its backoff (a minute after the first failure), on the retry timer.
    jest.advanceTimersByTime(61_000);
    await settle();
    expect(mockArabic).toBe(true);
    expect(mockDownloaded).toEqual([]);
    expect(getMushafStatus().phase).toBe('complete');
  });

  it('pages done, text still coming: the progress names the text', async () => {
    for (let p = 1; p <= 604; p++) mockPhone.add(p);
    setNetworkState(WIFI);
    await prepareMushafOffline();
    const s = getMushafStatus();
    expect(s.phase).toBe('pending');
    expect(describeMushaf({ ...s, phase: 'downloading' }).subtitle).toBe('Downloading · the text and translation');
    expect(describeMushaf(s).value).toBe('98%');
  });

  it('tries Saheeh International again later when it fails, and is done once it comes', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    mockSaheehFails = true;
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(mockPhone.size).toBe(604);
    expect(mockSaheehCalls).toBe(1);
    expect(getMushafStatus().phase).toBe('error');
    // Not again before its backoff, however often a run starts.
    setMushafActive(true);
    await settle();
    expect(mockSaheehCalls).toBe(1);
    mockSaheehFails = false;
    jest.advanceTimersByTime(61_000);
    await settle();
    expect(mockSaheehCalls).toBe(2);
    expect(getMushafStatus().phase).toBe('complete');
  });

  it('a translation download that left suras out is a failure, tried again later', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const saheeh = jest.requireMock('../saheeh');
    const real = saheeh.downloadSaheeh;
    saheeh.downloadSaheeh = async () => {
      mockSaheehCalls++;
      mockSaheeh = 100;
    };
    try {
      setNetworkState(WIFI);
      await prepareMushafOffline();
      startMushafOffline();
      await settle();
      expect(getMushafStatus().phase).toBe('error');
      saheeh.downloadSaheeh = real;
      jest.advanceTimersByTime(61_000);
      await settle();
      expect(getMushafStatus().phase).toBe('complete');
    } finally {
      saheeh.downloadSaheeh = real;
    }
  });

  it('once everything is here, each run still asks for a newer version of the translation', async () => {
    for (let p = 1; p <= 604; p++) mockPhone.add(p);
    mockArabic = true;
    mockSaheeh = 114;
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(getMushafStatus().phase).toBe('complete');
    expect(mockSaheehCalls).toBe(1);
    expect(mockArabicCalls).toBe(0);
    expect(mockDownloaded).toEqual([]);
  });

  it('counts suras read in the verse sheet', async () => {
    setNetworkState(CELLULAR);
    await prepareMushafOffline();
    const before = getMushafStatus().bytes;
    mockSaheeh = 57;
    mockSaheehChange?.();
    await new Promise((r) => setTimeout(r, 450));
    expect(getMushafStatus().bytes - before).toBe(Math.round(1_093_165 / 2));
  });

  it('needs room for the next page and a margin; the text (~3 MB) still comes', async () => {
    mockFree = 100_000_000;
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(mockDownloaded).toEqual([]);
    expect(mockArabic).toBe(true);
    expect(mockSaheeh).toBe(114);
    expect(getMushafStatus().phase).toBe('no-space');
    expect(describeMushaf(getMushafStatus()).subtitle).toBe('Not enough free space · 0 of 604 pages');
  });

  it('downloads what fits, stops when the phone fills up, and carries on once there is room', async () => {
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    mockBeforeDownload = (page) => {
      if (page === 100) mockFree = 100_100_000;
    };
    await settle();
    const fitted = mockPhone.size;
    expect(fitted).toBeGreaterThan(95);
    expect(fitted).toBeLessThan(105);
    expect(getMushafStatus().phase).toBe('no-space');

    mockFree = 10e9;
    mockBeforeDownload = () => undefined;
    setMushafActive(true);
    await settle();
    expect(getMushafStatus().phase).toBe('complete');
  });

  it('downloads a page again that the reader found broken', async () => {
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    mockPhone.delete(5);
    mockDownloaded.length = 0;
    mockRemoved?.(5, 'madani1405');
    await settle();
    expect(mockDownloaded).toEqual([5]);
    expect(getMushafStatus().phase).toBe('complete');
  });

  it('tries the Arabic text again only after a while', async () => {
    mockArabicFails = true;
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(mockArabicCalls).toBe(1);
    setMushafActive(true);
    await settle();
    setNetworkState(CELLULAR);
    setNetworkState(WIFI);
    await settle();
    expect(mockArabicCalls).toBe(1);
  });

  it('Remove while the Arabic text is downloading: it is not saved', async () => {
    setNetworkState(WIFI);
    await prepareMushafOffline();
    mockDuringArabic = () => void removeMushafDownload();
    startMushafOffline();
    await settle();
    expect(mockArabic).toBe(false);
    expect(getMushafStatus().phase).toBe('paused');
  });

  it('a switch flipped before the saved choices have loaded keeps them', async () => {
    await AsyncStorage.setItem('@revisely_mushaf_offline:v1', JSON.stringify({ auto: false, cellular: false }));
    await setMushafCellular(true);
    expect(JSON.parse((await AsyncStorage.getItem('@revisely_mushaf_offline:v1')) as string)).toEqual({
      auto: false,
      cellular: true,
    });
  });

  it('counts the pages the reader downloads', async () => {
    setNetworkState(CELLULAR);
    await prepareMushafOffline();
    mockStored?.(5, 'madani1405');
    // Progress reaches the screen a moment later (a few times a second at most).
    await new Promise((r) => setTimeout(r, 450));
    expect(getMushafStatus().pages).toBe(1);
  });

  it('sends progress a few times a second at most, and a new phase at once', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const { onMushafStatus } = require('../mushafOffline');
    setNetworkState(CELLULAR);
    await prepareMushafOffline();
    const seen: number[] = [];
    onMushafStatus((s: { pages: number }) => seen.push(s.pages));
    jest.advanceTimersByTime(500);
    for (let p = 1; p <= 10; p++) mockStored?.(p, 'madani1405');
    expect(seen).toEqual([1]);
    jest.advanceTimersByTime(400);
    expect(seen).toEqual([1, 10]);
    setNetworkState(OFFLINE);
    expect(getMushafStatus().phase).toBe('offline');
  });

  it('moves to the 1441 print when it is chosen, keeping the 1405 pages until they are removed', async () => {
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(getMushafStatus().phase).toBe('complete');
    mockDownloadedEditions.length = 0;

    await setMushafEdition('madani1441');
    await settle();
    expect(mockPhone1441.size).toBe(604);
    expect(new Set(mockDownloadedEditions)).toEqual(new Set(['madani1441']));
    expect(mockPhone.size).toBe(604);
    const s = getMushafStatus();
    expect(s.phase).toBe('complete');
    const bytes1441 = ((sizes as Record<string, number[]>)['1441/w1440'] ?? []).reduce((a, b) => a + b, 0);
    expect(bytes1441).toBeGreaterThan(0);
    expect(s.totalBytes).toBe(bytes1441 + ARABIC_TEXT_BYTES + 1_093_165);

    expect(otherEditionsOnPhone()).toEqual([{ edition: 'madani1405', pages: 604, bytes: PAGE_BYTES }]);
    removeOtherEditionPages('madani1405');
    expect(mockPhone.size).toBe(0);
    expect(otherEditionsOnPhone()).toEqual([]);
    // The print chosen is never removed this way.
    removeOtherEditionPages('madani1441');
    expect(mockPhone1441.size).toBe(604);
  });

  it('counts only the pages of the print chosen', async () => {
    setNetworkState(CELLULAR);
    await prepareMushafOffline();
    mockStored?.(5, 'madani1441');
    await new Promise((r) => setTimeout(r, 450));
    expect(getMushafStatus().pages).toBe(0);
  });

  it('a switch stops the run for the old print between pages', async () => {
    setNetworkState(WIFI);
    await prepareMushafOffline();
    mockBeforeDownload = (page) => {
      if (page === 3) void setMushafEdition('madani1441');
    };
    startMushafOffline();
    await settle();
    // The 1405 run stopped within a few pages; the 1441 print is all here.
    expect(mockPhone.size).toBeLessThan(10);
    expect(mockPhone1441.size).toBe(604);
  });

  it('removes everything and stays off until "Download now"', async () => {
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    await removeMushafDownload();
    expect(mockPhone.size).toBe(0);
    expect(mockArabic).toBe(false);
    expect(mockSaheeh).toBe(0);
    expect(getMushafStatus().phase).toBe('paused');
    expect(describeMushaf(getMushafStatus())).toEqual({ value: 'Download', subtitle: 'Not on this phone · 250\u00A0MB' });

    setNetworkState(CELLULAR);
    setNetworkState(WIFI);
    setMushafActive(true);
    await settle();
    expect(mockPhone.size).toBe(0);

    await downloadMushafNow();
    await settle();
    expect(getMushafStatus().phase).toBe('complete');
  });

  it('remembers that it was removed (on this phone)', async () => {
    setNetworkState(WIFI);
    await prepareMushafOffline();
    await removeMushafDownload();
    __resetMushafOfflineForTests();
    setNetworkState(WIFI);
    await prepareMushafOffline();
    startMushafOffline();
    await settle();
    expect(getMushafStatus().phase).toBe('paused');
    expect(mockDownloaded).toEqual([]);
  });
});

describe('describeMushaf', () => {
  const base = { total: 604, totalBytes: FULL_BYTES, textReady: false, prefs: { auto: true, cellular: false } };
  it('shows the progress while downloading', () => {
    expect(describeMushaf({ ...base, phase: 'downloading', pages: 302, bytes: FULL_BYTES / 2 })).toEqual({
      value: '50%',
      subtitle: 'Downloading · 302 of 604 pages',
    });
  });
  it('says how it will download before it starts', () => {
    expect(describeMushaf({ ...base, phase: 'pending', pages: 0, bytes: 0 }).subtitle).toBe(
      'Downloads on Wi-Fi · 250\u00A0MB',
    );
    expect(
      describeMushaf({ ...base, prefs: { auto: true, cellular: true }, phase: 'pending', pages: 0, bytes: 0 }).subtitle,
    ).toBe('Downloads on Wi-Fi or mobile data · 250\u00A0MB');
  });
  it('formats sizes as the system does', () => {
    expect(formatMegabytes(135_200_000)).toBe('135\u00A0MB');
    expect(formatMegabytes(2_109_200)).toBe('2.1\u00A0MB');
  });
});
