// Which printing of the Madani mushaf the pages show (Settings → Mushaf), kept on this phone.
//
// - madani1405: the 1405 AH print, as rendered by github.com/quran/quran.com-images (the
//   app's pages since the start).
// - madani1441: the King Fahd Complex's 1441 AH print, drawn from the Complex's own vector
//   files (dm.qurancomplex.gov.sa, free to use in apps; scripts/build-mushaf-1441.py).
//
// Page numbers mean the same in both. 568 of the 604 pages hold the same verses; the other 36
// come in runs (120–123, 144–145, 531–534, 564–565, 567–570, 575–576, 583–600) that begin and
// end on the same verses in both, and every surah and juz starts on the same page. So a plan, a
// session, a memorized page or a bookmark is the same page number in either; what changes is the
// image, and where the verses sit on it (lib/ayahBounds, lib/verses), so pressing and holding,
// recitation and the reader's surah follow the page shown.

import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import madani1441 from '../data/mushaf1441.json';

export type MushafEditionId = 'madani1405' | 'madani1441';

export interface MushafEdition {
  id: MushafEditionId;
  /** As the picker and Settings name it. */
  name: string;
  /** One line under the name in the picker. */
  description: string;
  /** Its folder in Storage and on the phone under mushaf/ ('' = the root, the 1405 pages). */
  folder: string;
  /** Width / height of its page images. */
  aspect: number;
  /** The credit the publisher asks for (the picker shows it). */
  credit: string;
  /** Data for hidden recite mode (lines and words) exists for it. */
  reciteData: boolean;
}

export const MUSHAF_EDITIONS: Record<MushafEditionId, MushafEdition> = {
  madani1405: {
    id: 'madani1405',
    name: 'Madani 1405',
    description: 'The classic Madani print',
    folder: '',
    aspect: 2600 / 4206,
    credit: 'Pages rendered from the King Fahd Complex fonts by the quran.com-images project.',
    reciteData: true,
  },
  madani1441: {
    id: 'madani1441',
    name: 'Madani 1441',
    description: 'The newer print, sharp on large screens',
    folder: '1441',
    // The window inside the frame that the build script draws (254.4 × 410.4 pt).
    aspect: madani1441.page.width / madani1441.page.height,
    credit:
      'Mushaf al-Madinah an-Nabawiyyah, 1441 AH, from the digital edition of the King Fahd Glorious Qur’an Printing Complex, Madinah.',
    reciteData: false,
  },
};

/** In the picker, top to bottom. */
export const MUSHAF_EDITION_ORDER: MushafEditionId[] = ['madani1405', 'madani1441'];

export const DEFAULT_MUSHAF_EDITION: MushafEditionId = 'madani1405';

export const MUSHAF_EDITION_KEY = '@revisely_mushaf_edition:v1';

export function isMushafEditionId(v: unknown): v is MushafEditionId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(MUSHAF_EDITIONS, v);
}

let current: MushafEditionId = DEFAULT_MUSHAF_EDITION;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<(id: MushafEditionId) => void>();

/** The edition the pages show now. */
export function getMushafEdition(): MushafEditionId {
  return current;
}

export function mushafEdition(id: MushafEditionId = current): MushafEdition {
  return MUSHAF_EDITIONS[id];
}

/** Hears each change of edition (after the stored choice loads, or a new choice). */
export function onMushafEdition(listener: (id: MushafEditionId) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function apply(id: MushafEditionId): void {
  if (id === current) return;
  current = id;
  listeners.forEach((l) => l(id));
}

/** Reads the stored choice (once; the app calls it at launch). */
export function loadMushafEdition(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(MUSHAF_EDITION_KEY);
      // A choice made while this was loading wins.
      if (!loaded && isMushafEditionId(raw)) apply(raw);
    } catch (err) {
      logger.warn('Could not read the mushaf choice', err);
    } finally {
      loaded = true;
      loading = null;
    }
  })();
  return loading;
}

/** Settings → Mushaf. */
export async function setMushafEdition(id: MushafEditionId): Promise<void> {
  loaded = true;
  apply(id);
  try {
    await AsyncStorage.setItem(MUSHAF_EDITION_KEY, id);
  } catch (err) {
    logger.warn('Could not save the mushaf choice', err);
  }
}

/** The edition, kept current (re-renders on a change). */
export function useMushafEdition(): MushafEditionId {
  return useSyncExternalStore(onMushafEdition, getMushafEdition);
}

/** Test hook. */
export function __setMushafEditionForTests(id: MushafEditionId): void {
  apply(id);
}

/** Test hook. */
export function __resetMushafEditionForTests(): void {
  current = DEFAULT_MUSHAF_EDITION;
  loaded = false;
  loading = null;
  listeners.clear();
}
