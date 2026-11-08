// Recorded translations for the verse sheet's screenshots (E2E builds only: EXPO_PUBLIC_E2E=1).
//
// E2E builds reach nothing but the emulators (network.ts), so no translation or Arabic text can be
// fetched there. At install the app writes Al-Ikhlas in one QuranEnc translation per script, and
// page 604's Arabic, where the app keeps what it has read (fixtures/translations.json, from
// scripts/e2e/record-translations.js): the verse sheet then reads them as it would after reading
// them online. Versions are the catalogue's, so nothing is fetched again.
//
// A flow can't hold a verse in the reader there (the page images are blocked too), so a link opens
// the real verse sheet over whatever shows (E2ERoot), as a tester, on a verse and a translation:
//
//   revisely://e2e/verse?ref=112:2&t=qe.urdu_junagarhi   (t optional: Saheeh International)
//   …&theme=dark   (or light: the theme it opens in, kept as ThemeContext keeps it)
//   revisely://e2e/verse?close=1

/* eslint-disable @typescript-eslint/no-var-requires */
const files = () => require('expo-file-system') as typeof import('expo-file-system');
/* eslint-enable @typescript-eslint/no-var-requires */

interface Fixtures {
  sura: number;
  page: number;
  arabic: { surahNumber: number; surahName: string; ayahNumber: number; text: string }[];
  suras: Record<string, { version: string; verses: [string, string][] }>;
}

/** Writes the recorded suras and page, unless they are there already. Never fails. */
export function installDemoTranslations(): void {
  try {
    const { Directory, File, Paths } = files();
    const fx = require('./fixtures/translations.json') as Fixtures;
    for (const [key, s] of Object.entries(fx.suras)) {
      const dir = new Directory(Paths.document, 'translations', key);
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const name = `${String(fx.sura).padStart(3, '0')}-${s.version}.json`;
      const file = new File(dir, name);
      if (file.exists) continue;
      file.create();
      file.write(JSON.stringify({ key, version: s.version, sura: fx.sura, verses: s.verses }));
    }
    // lib/translation's cache of a page of Arabic, read before.
    const cache = new Directory(Paths.cache, 'translation', 'quran-uthmani');
    if (!cache.exists) cache.create({ intermediates: true, idempotent: true });
    const page = new File(cache, `${fx.page}.json`);
    if (!page.exists) {
      page.create();
      page.write(JSON.stringify(fx.arabic));
    }
    // eslint-disable-next-line no-console
    console.log(`[e2e] translations: ${Object.keys(fx.suras).length} of sura ${fx.sura} on the phone`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`[e2e] translations not written: ${String(err)}`);
  }
}

export interface E2EVerse {
  page: number;
  sura: number;
  ayah: number;
  translationId?: string;
  theme?: 'light' | 'dark';
}

let current: E2EVerse | null = null;
const listeners = new Set<(v: E2EVerse | null) => void>();

export function e2eVerse(): E2EVerse | null {
  return current;
}

export function onE2EVerse(listener: (v: E2EVerse | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setVerse(v: E2EVerse | null): void {
  current = v;
  listeners.forEach((l) => l(v));
}

/** revisely://e2e/verse?…: opens (or closes) the verse sheet. True if it was this link. */
export function handleVerseLink(url: string): boolean {
  const m = /^[a-z0-9+.-]+:\/\/e2e\/verse\?(.*)$/i.exec(url);
  if (!m) return false;
  const params = new Map(
    m[1].split('&').map((kv) => {
      const [k, v = ''] = kv.split('=');
      return [decodeURIComponent(k), decodeURIComponent(v)] as const;
    }),
  );
  if (params.get('close') === '1') {
    setVerse(null);
    return true;
  }
  const ref = /^(\d{1,3}):(\d{1,3})$/.exec(params.get('ref') ?? '');
  if (!ref) return true;
  const { pageOfVerse } = require('../verses') as typeof import('../verses');
  const sura = Number(ref[1]);
  const ayah = Number(ref[2]);
  const asked = params.get('theme');
  const theme = asked === 'dark' || asked === 'light' ? asked : undefined;
  const open = () =>
    setVerse({ page: pageOfVerse({ sura, ayah }), sura, ayah, translationId: params.get('t') || undefined, theme });
  if (!theme) {
    open();
    return true;
  }
  // Saved where ThemeContext reads it; the overlay's providers start again in it (E2ERoot).
  const AsyncStorage = (require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage')).default;
  const { THEME_KEY } = require('./theme') as typeof import('./theme');
  AsyncStorage.setItem(THEME_KEY, theme)
    .catch(() => undefined)
    .then(open);
  // eslint-disable-next-line no-console
  console.log(`[e2e] verse ${sura}:${ayah} ${params.get('t') ?? ''}`);
  return true;
}
