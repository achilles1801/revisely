// A held verse's translation (TRANS-*): the app's own translation code (lib/translation,
// lib/quranenc, lib/saheeh) and the verse sheet, on the phone's disk, with QuranEnc.com and
// alquran.cloud answering from their recorded answers (harness/quranenc). Al-Ikhlas 2 (page 604)
// has a footnote in Urdu, French and English.
import fs from 'fs';
import os from 'os';
import path from 'path';
import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { setNow, setZone, ZONES } from '../harness/clock';
import { setPhoneFolder } from '../harness/fileSystem';
import {
  failSura,
  healSura,
  holdFrom,
  installQuranEnc,
  publishVersion,
  releaseHeld,
  requestsTo,
  resetQuranEnc,
  serveWhole,
} from '../harness/quranenc';
import { setOnline } from '../harness/netinfo';
import { Alert } from 'react-native';
import { VerseSheet } from '../../../src/components/verse/VerseSheet';
import { ThemeProvider } from '../../../src/context/ThemeContext';
import { DesignProvider } from '../../../src/design/DesignContext';
import { __resetQuranEncForTests, quranEncStore } from '../../../src/lib/quranenc';
import { __resetDownloadsForTests } from '../../../src/lib/translationDownloads';
import { __resetFavoritesForTests } from '../../../src/lib/translationFavorites';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pageOfVerse } from '../../../src/lib/verses';
import { __resetNetworkStateForTests, setNetworkState } from '../../../src/lib/networkState';
import NetInfo from '@react-native-community/netinfo';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const VERSE = { page: 604, sura: 112, ayah: 2 };
const URDU = 'qe.urdu_junagarhi';
const FRENCH = 'qe.french_rashid';
const URDU_CREDIT =
  'Translated by Muhammad Ibrahim Junagarhi, developed under the supervision of the Rowwad Translation Center. The original translation is available for the purpose of expressing opinion, evaluation, and continuous development.';

type TranslationModule = typeof import('../../../src/lib/translation');

/**
 * A cold start: the app's modules loaded afresh; the disk, the clock and QuranEnc stay. (The sheet's
 * tests render the modules imported above, one React; this is for the translation code alone.)
 */
function launch(): TranslationModule {
  let lib!: TranslationModule;
  jest.isolateModules(() => {
    lib = require('../../../src/lib/translation');
  });
  return lib;
}

/** A node's text, nested Text included, as the screen shows it. */
function textOf(node: { children: unknown[] }): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c as { children: unknown[] }))).join('');
}

const settle = async () => {
  for (let i = 0; i < 50; i++) await act(async () => undefined);
};

/** Waits for `check`, up to 10 s of real time (the scenario's Date stands still). */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    if (check()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** The verse sheet on a verse (Al-Ikhlas 2), as the reader opens it, its translation chosen by the user. */
function openSheet(
  initial: string,
  tester: boolean,
  start: { page: number; sura: number; ayah: number } = VERSE,
  accountId = 'account-a',
) {
  const chosen: string[] = [];
  function Reader() {
    const [id, setId] = useState(initial);
    const [verse, setVerse] = useState(start);
    return (
      <ThemeProvider>
        <DesignProvider>
          <VerseSheet
            verse={verse}
            translationId={id}
            tester={tester}
            accountId={accountId}
            onChangeTranslation={(next: string) => {
              chosen.push(next);
              setId(next);
            }}
            reciter={undefined}
            onChangeReciter={() => undefined}
            onNavigate={(v: { sura: number; ayah: number }) => setVerse({ ...v, page: pageOfVerse(v) })}
            onClose={() => undefined}
          />
        </DesignProvider>
      </ThemeProvider>
    );
  }
  const view = render(<Reader />);
  return { chosen, unmount: view.unmount };
}

const shown = () => screen.queryByTestId('verse-translation');

beforeAll(() => installQuranEnc());

beforeEach(() => {
  setZone(ZONES.london);
  setNow('2026-11-08 10:00');
  setPhoneFolder(fs.mkdtempSync(path.join(os.tmpdir(), 'revisely-phone-')));
  resetQuranEnc();
  // A new phone: nothing of the last one's translations in memory either.
  __resetQuranEncForTests();
  __resetDownloadsForTests();
  __resetFavoritesForTests();
  setOnline(true);
  __resetNetworkStateForTests();
  // What the app's MushafOfflineController does with NetInfo: the connection the verse sheet reads.
  stopNet = NetInfo.addEventListener((s) =>
    setNetworkState({ connected: s.isConnected === true && s.isInternetReachable !== false, type: s.type }),
  );
});

let stopNet: () => void = () => undefined;
afterEach(() => {
  stopNet();
  setOnline(true);
});

/** ⋯ → Select translation, then a search that brings `id`'s row into view. */
function openPicker(search: string): void {
  fireEvent.press(screen.getByLabelText('More'));
  fireEvent.press(screen.getByLabelText(/^Select translation/));
  fireEvent.changeText(screen.getByTestId('translation-search'), search);
}

const status = (id: string) => textOf(screen.getByTestId(`translation-status-${id}`) as never);

/** The app hears the connection go (NetInfo), as a phone does. */
async function goOffline(): Promise<void> {
  setOnline(false);
  await settle();
}

describe('a held verse in a QuranEnc translation (TRANS)', () => {
  it('[TRANS-1] Urdu shows exactly as QuranEnc gives it: its footnote’s number raised, the footnote under the verse', async () => {
    openSheet(URDU, true);
    await until(() => shown() != null, 'the translation');
    expect(textOf(screen.getByTestId('verse-translation') as never)).toBe('اللہ تعالیٰ بے نیاز ہے.¹');
    expect(textOf(screen.getByTestId('verse-footnotes') as never)).toBe('¹ یعنی سب اس کے محتاج ہیں، وہ کسی کا محتاج نہیں۔');
    // The Arabic is the verse's own, as alquran.cloud gives it.
    const page = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/quranenc/alquran/page-604-quran-uthmani.json'), 'utf8'));
    const arabic = page.data.ayahs.find((a: { surah: { number: number }; numberInSurah: number }) => a.surah.number === 112 && a.numberInSurah === 2).text;
    expect(screen.getByText(arabic)).toBeTruthy();
  });

  it('[TRANS-1] a translation that can’t load says so, and shows no other translation in its place', async () => {
    // Nothing recorded for this sura in Turkish: QuranEnc answers 404.
    openSheet('qe.turkish_shaban', true);
    await until(() => screen.queryByTestId('verse-error') != null, 'the error');
    expect(shown()).toBeNull();
    expect(screen.queryByText(/Eternal Refuge|بے نیاز|Maître/)).toBeNull();
    expect(screen.getByText("Couldn't load this verse. Check your connection.")).toBeTruthy();
  });

  it('[TRANS-2] under it: QuranEnc’s own credit, the version shown and a link to its page on QuranEnc.com', async () => {
    openSheet(URDU, true);
    await until(() => shown() != null, 'the translation');
    const credit = screen.getByTestId('translation-credit');
    expect(textOf(credit as never)).toBe(`${URDU_CREDIT} · v1.1.3QuranEnc.com`);
    const Linking = require('react-native').Linking;
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    fireEvent.press(screen.getByLabelText('QuranEnc.com, opens the website'));
    expect(open).toHaveBeenCalledWith('https://quranenc.com/en/browse/urdu_junagarhi');
  });

  it('[TRANS-2] the picker shows each translation with the same credit', async () => {
    openSheet(URDU, true);
    await until(() => shown() != null, 'the translation');
    fireEvent.press(screen.getByLabelText('More'));
    fireEvent.press(screen.getByLabelText(/^Select translation/));
    fireEvent.changeText(screen.getByTestId('translation-search'), 'French');
    const row = screen.getByTestId(`translation-row-${FRENCH}`);
    expect(textOf(row as never)).toContain('Rachid Maach');
    expect(textOf(row as never)).toContain('Translated by Rashid Ma’ash');
    expect(textOf(row as never)).toContain('QuranEnc.com');
  });

  it('[TRANS-3] Urdu reads right to left, its footnotes too; French left to right', async () => {
    openSheet(URDU, true);
    await until(() => shown() != null, 'the translation');
    const urdu = StyleSheet.flatten(screen.getByTestId('verse-translation').props.style);
    expect(urdu).toMatchObject({ writingDirection: 'rtl', textAlign: 'right' });
    const note = screen.getByTestId('verse-footnotes').children[0] as { props: { style: unknown } };
    expect(StyleSheet.flatten(note.props.style as never)).toMatchObject({ writingDirection: 'rtl', textAlign: 'right' });

    fireEvent.press(screen.getByLabelText('More'));
    fireEvent.press(screen.getByLabelText(/^Select translation/));
    fireEvent.changeText(screen.getByTestId('translation-search'), 'French');
    fireEvent.press(screen.getByTestId(`translation-row-${FRENCH}`));
    await until(() => shown() != null && textOf(shown() as never).startsWith('Allah est'), 'the French');
    const french = StyleSheet.flatten(screen.getByTestId('verse-translation').props.style);
    expect(french.writingDirection).toBeUndefined();
    expect(french.textAlign).toBeUndefined();
  });

  it('[TRANS-4] a new version on QuranEnc: the sura kept is shown with its own version, then fetched again the next day', async () => {
    // Day 1: read and kept on the phone at 1.1.3.
    let lib = launch();
    expect((await lib.getVerseText(604, 112, 2, URDU)).version).toBe('1.1.3');
    await settle();
    expect(requestsTo('translations/list')).toHaveLength(1);
    expect(requestsTo('sura/urdu_junagarhi/112')).toHaveLength(1);

    // The same day, another launch: from the phone, no new request.
    lib = launch();
    expect((await lib.getVerseText(604, 112, 2, URDU)).version).toBe('1.1.3');
    await settle();
    expect(requestsTo('translations/list')).toHaveLength(1);
    expect(requestsTo('sura/urdu_junagarhi/112')).toHaveLength(1);

    // QuranEnc publishes 1.1.4; the next day the list is read again and the sura fetched again.
    publishVersion('urdu_junagarhi', '1.1.4');
    setNow('2026-11-09 10:30');
    lib = launch();
    expect((await lib.getVerseText(604, 112, 2, URDU)).version).toBe('1.1.3');
    for (let i = 0; i < 200 && requestsTo('sura/urdu_junagarhi/112').length < 2; i++) await settle();
    expect(requestsTo('translations/list')).toHaveLength(2);
    expect(requestsTo('sura/urdu_junagarhi/112')).toHaveLength(2);
    await settle();
    expect((await lib.getVerseText(604, 112, 2, URDU)).version).toBe('1.1.4');

    // And after a restart, from the phone at 1.1.4.
    lib = launch();
    expect((await lib.getVerseText(604, 112, 2, URDU)).version).toBe('1.1.4');
  });

  it('[TRANS-4] one reading of QuranEnc’s list answers for every translation that day', async () => {
    const lib = launch();
    await lib.getVerseText(604, 112, 2, URDU);
    await lib.getVerseText(604, 112, 2, FRENCH);
    await lib.getVerseText(604, 112, 2, 'en.sahih');
    await settle();
    expect(requestsTo('translations/list')).toHaveLength(1);
  });

  it('[TRANS-5] testers pick from every language, by English or its own name, and the verse follows the choice', async () => {
    const { chosen } = openSheet(URDU, true);
    await until(() => shown() != null, 'the translation');
    fireEvent.press(screen.getByLabelText('More'));
    fireEvent.press(screen.getByLabelText(/^Select translation/));
    expect(screen.getByTestId('translation-picker')).toBeTruthy();
    // Selected first, then the languages with their own names.
    expect(textOf(screen.getByTestId('translation-section-selected') as never)).toBe('Selected');
    expect(textOf(screen.getByTestId('translation-section-am') as never)).toBe('Amharic · ⁨አማርኛ⁩');
    fireEvent.changeText(screen.getByTestId('translation-search'), 'turk');
    expect(textOf(screen.getByTestId('translation-section-tr') as never)).toBe('Turkish · ⁨Türkçe⁩');

    fireEvent.changeText(screen.getByTestId('translation-search'), 'francais');
    expect(screen.getByTestId(`translation-row-${FRENCH}`)).toBeTruthy();
    expect(screen.queryByTestId('translation-row-qe.turkish_shaban')).toBeNull();
    fireEvent.changeText(screen.getByTestId('translation-search'), 'اردو');
    expect(screen.getByTestId(`translation-row-${URDU}`)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('translation-search'), 'junagarhi');
    expect(screen.getByTestId(`translation-row-${URDU}`)).toBeTruthy();
    expect(screen.queryByTestId(`translation-row-${FRENCH}`)).toBeNull();

    fireEvent.changeText(screen.getByTestId('translation-search'), 'french');
    fireEvent.press(screen.getByTestId(`translation-row-${FRENCH}`));
    expect(chosen).toEqual([FRENCH]);
    await until(() => shown() != null && textOf(shown() as never).startsWith('Allah est'), 'the French');
    expect(textOf(shown() as never)).toBe('Allah est le Maître dont nul ne peut se passer¹.');
    expect(textOf(screen.getByTestId('translation-credit') as never)).toBe('Translated by Rashid Ma’ash · v1.0.3QuranEnc.com');
  });

  it('[TRANS-5] everyone else chooses Saheeh International or The Clear Quran®, as before', async () => {
    openSheet('en.sahih', false);
    await until(() => shown() != null, 'the translation');
    fireEvent.press(screen.getByLabelText('More'));
    fireEvent.press(screen.getByLabelText(/^Select translation/));
    expect(screen.queryByTestId('translation-picker')).toBeNull();
    expect(screen.getByText('Saheeh International — Noor International Center')).toBeTruthy();
    expect(screen.getByText('The Clear Quran® — Dr. Mustafa Khattab')).toBeTruthy();
    expect(screen.queryByText(/Junagarhi|Rachid Maach/)).toBeNull();
  });
});

describe('downloading a translation (TRANS-6)', () => {
  it('[TRANS-6] its size before, its progress while it comes, then on the phone, under Downloaded, and read offline', async () => {
    serveWhole('french_rashid');
    openSheet(FRENCH, true);
    await until(() => shown() != null, 'the translation');
    // From here the connection stalls at sura 57: the download stands midway until released.
    holdFrom('french_rashid', 57);
    openPicker('rashid');
    // Al-Ikhlas was kept as it was read; the rest is its size.
    expect(status(FRENCH)).toMatch(/^1 of 114 suras on this phone · 1\.[0-9]\u00A0MB$/);
    fireEvent.press(screen.getByTestId(`translation-download-${FRENCH}`));
    // Suras 1–56 and Al-Ikhlas: 57 of 114.
    await until(() => status(FRENCH) === 'Downloading… 50%', 'its progress');
    releaseHeld();
    await until(() => status(FRENCH).startsWith('On this phone'), 'the whole translation');
    expect(status(FRENCH)).toMatch(/^On this phone · 1\.[0-9]\u00A0MB$/);
    expect(quranEncStore('french_rashid')!.surasOnPhone()).toBe(114);
    // Each sura once: Al-Ikhlas came with the verse, the 113 others with the download.
    expect(requestsTo('sura/french_rashid/')).toHaveLength(114);
    // Selected stays first; it shows under Downloaded once another is selected.
    // Chosen again: the picker closes.
    fireEvent.press(screen.getByTestId(`translation-row-${FRENCH}`));
    openPicker('');
    expect(screen.queryByTestId('translation-section-downloaded')).toBeNull(); // selected, not listed twice
    fireEvent.changeText(screen.getByTestId('translation-search'), 'saheeh');
    fireEvent.press(screen.getByTestId('translation-row-en.sahih'));
    await until(() => shown() != null, 'Saheeh');
    openPicker('');
    expect(textOf(screen.getByTestId('translation-section-downloaded') as never)).toBe('Downloaded');
    fireEvent.press(screen.getByTestId(`translation-row-${FRENCH}`));

    // Offline: a sura never read, from the download.
    await goOffline();
    for (let i = 0; i < 3; i++) fireEvent.press(screen.getByLabelText('Next verse'));
    await until(() => shown() != null && textOf(shown() as never) === 'french_rashid 113:1', 'Al-Falaq offline');
  });

  it('[TRANS-6] stopped midway, it keeps what came and carries on from there', async () => {
    serveWhole('french_rashid');
    openSheet(FRENCH, true);
    await until(() => shown() != null, 'the translation');
    holdFrom('french_rashid', 57);
    openPicker('rashid');
    fireEvent.press(screen.getByTestId(`translation-download-${FRENCH}`));
    await until(() => status(FRENCH) === 'Downloading… 50%', 'some suras');
    // Stopped while suras are on their way: those land, and nothing more is asked for.
    fireEvent.press(screen.getByTestId(`translation-stop-${FRENCH}`));
    releaseHeld();
    await until(() => / of 114 suras on this phone/.test(status(FRENCH)), 'the stop');
    const kept = quranEncStore('french_rashid')!.surasOnPhone();
    expect(kept).toBeGreaterThanOrEqual(57);
    expect(kept).toBeLessThan(114);
    expect(status(FRENCH)).toMatch(new RegExp(`^${kept} of 114 suras on this phone`));
    fireEvent.press(screen.getByTestId(`translation-download-${FRENCH}`));
    await until(() => status(FRENCH).startsWith('On this phone'), 'the rest');
    // Nothing fetched twice.
    expect(requestsTo('sura/french_rashid/')).toHaveLength(114);
  });

  it('[TRANS-6] a download that fails says so and keeps what came; tried again, it finishes', async () => {
    serveWhole('french_rashid');
    failSura('french_rashid', 50);
    openSheet(FRENCH, true);
    await until(() => shown() != null, 'the translation');
    openPicker('rashid');
    fireEvent.press(screen.getByTestId(`translation-download-${FRENCH}`));
    await until(() => status(FRENCH).startsWith('Couldn’t download'), 'the failure');
    expect(status(FRENCH)).toBe('Couldn’t download all of it · 113 of 114 suras on this phone');
    healSura('french_rashid', 50);
    fireEvent.press(screen.getByTestId(`translation-download-${FRENCH}`));
    await until(() => status(FRENCH).startsWith('On this phone'), 'the last sura');
  });

  it('[TRANS-6] Remove asks first, then deletes it from the phone', async () => {
    serveWhole('french_rashid');
    openSheet('en.sahih', true);
    await until(() => shown() != null, 'the translation');
    openPicker('rashid');
    fireEvent.press(screen.getByTestId(`translation-download-${FRENCH}`));
    await until(() => status(FRENCH).startsWith('On this phone'), 'the download');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    fireEvent.press(screen.getByTestId(`translation-remove-${FRENCH}`));
    expect(alert).toHaveBeenCalledWith('Remove Rachid Maach?', expect.stringMatching(/^This frees 1\.[0-9]\u00A0MB\. You can download it again\.$/), expect.any(Array));
    alert.mockRestore();
    await until(() => /^1\.[0-9]\u00A0MB$/.test(status(FRENCH)), 'its size again');
    expect(quranEncStore('french_rashid')!.surasOnPhone()).toBe(0);
    expect(screen.queryByTestId('translation-section-downloaded')).toBeNull();
  });

  it('[TRANS-6] Saheeh International comes with the offline mushaf: no download button of its own', async () => {
    openSheet('qe.french_rashid', true);
    await until(() => shown() != null, 'the translation');
    openPicker('saheeh');
    expect(status('en.sahih')).toBe('Downloads with the offline mushaf');
    expect(screen.queryByTestId('translation-download-en.sahih')).toBeNull();
  });
});

describe('offline, a translation not on the phone (TRANS-7)', () => {
  it('[TRANS-7] says so, and offers one that is: Show it, and the verse is there', async () => {
    serveWhole('french_rashid');
    // French downloaded while online; Urdu in use, read only in Al-Ikhlas.
    openSheet(FRENCH, true);
    await until(() => shown() != null, 'French');
    openPicker('rashid');
    fireEvent.press(screen.getByTestId(`translation-download-${FRENCH}`));
    await until(() => status(FRENCH).startsWith('On this phone'), 'the download');
    fireEvent.changeText(screen.getByTestId('translation-search'), 'junagarhi');
    fireEvent.press(screen.getByTestId(`translation-row-${URDU}`));
    await until(() => shown() != null && textOf(shown() as never).startsWith('اللہ'), 'Urdu');

    await goOffline();
    for (let i = 0; i < 3; i++) fireEvent.press(screen.getByLabelText('Next verse'));
    await until(() => screen.queryByTestId('verse-offline') != null, 'the offline note');
    expect(textOf(screen.getByTestId('verse-offline') as never)).toBe("This translation isn't downloaded");
    expect(screen.getByText('Rachid Maach (French) is available offline.')).toBeTruthy();
    // Never French under Urdu's name.
    expect(screen.queryByTestId('translation-credit')).toBeNull();
    fireEvent.press(screen.getByText('Show Rachid Maach (French)'));
    await until(() => shown() != null && textOf(shown() as never) === 'french_rashid 113:1', 'French');
    expect(textOf(screen.getByTestId('translation-credit') as never)).toBe('Translated by Rashid Ma’ash · v1.0.3QuranEnc.com');
  });

  it('[TRANS-7] nothing else on the phone: it says how to read it offline, and offers nothing', async () => {
    openSheet(URDU, true);
    await until(() => shown() != null, 'Urdu');
    await goOffline();
    for (let i = 0; i < 3; i++) fireEvent.press(screen.getByLabelText('Next verse'));
    await until(() => screen.queryByTestId('verse-offline') != null, 'the offline note');
    expect(screen.getByText('Download it from Select translation to read it offline.')).toBeTruthy();
    expect(screen.queryByText(/^Show /)).toBeNull();
  });

  it('[TRANS-7] the Arabic isn’t on the phone either: it shows once back online, by itself', async () => {
    serveWhole('urdu_junagarhi');
    openSheet(URDU, true, { page: 1, sura: 1, ayah: 2 });
    await goOffline();
    await until(() => screen.queryByTestId('verse-error') != null, 'the error');
    expect(screen.getByText("This verse isn't downloaded yet. It shows when you're back online.")).toBeTruthy();
    expect(screen.queryByText(/^Show /)).toBeNull();
  });
});

describe('favorite translations (TRANS-8)', () => {
  beforeEach(() => AsyncStorage.clear());

  /** The rows of a group, in order, as the list shows them. */
  function rowsOf(section: string): string[] {
    const all = screen.getAllByTestId(/^translation-(section|row)-/).map((n) => n.props.testID as string);
    const start = all.indexOf(`translation-section-${section}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const out: string[] = [];
    for (const id of all.slice(start + 1)) {
      if (id.startsWith('translation-section-')) break;
      if (!out.includes(id)) out.push(id.replace('translation-row-', ''));
    }
    return out;
  }
  async function star(search: string, id: string): Promise<void> {
    fireEvent.changeText(screen.getByTestId('translation-search'), search);
    fireEvent.press(screen.getByTestId(`translation-star-${id}`));
    await until(() => screen.queryByTestId(`translation-star-${id}`)?.props.accessibilityState?.selected === true, `${id} starred`);
  }

  it('[TRANS-8] starred, they are listed under Selected in the order starred, and kept for that account', async () => {
    const first = openSheet(URDU, true);
    await until(() => shown() != null, 'the translation');
    openPicker('');
    await star('rashid', FRENCH);
    await star('shaban', 'qe.turkish_shaban');
    fireEvent.changeText(screen.getByTestId('translation-search'), '');
    expect(rowsOf('selected')).toEqual([URDU]);
    expect(rowsOf('favorites')).toEqual([FRENCH, 'qe.turkish_shaban']);
    first.unmount();

    // A later launch, the same account: still there. Another account on this phone: none.
    __resetFavoritesForTests();
    const again = openSheet(URDU, true);
    await until(() => shown() != null, 'the translation');
    openPicker('');
    await until(() => screen.queryByTestId('translation-section-favorites') != null, 'the favorites');
    expect(rowsOf('favorites')).toEqual([FRENCH, 'qe.turkish_shaban']);
    again.unmount();
    openSheet(URDU, true, VERSE, 'account-b');
    await until(() => shown() != null, 'the translation');
    openPicker('');
    await settle();
    expect(screen.queryByTestId('translation-section-favorites')).toBeNull();
  });

  it('[TRANS-8] Edit moves a favorite up, takes a star away, and deletes a download after asking', async () => {
    serveWhole('hindi_omari');
    openSheet(URDU, true);
    await until(() => shown() != null, 'the translation');
    openPicker('omari');
    fireEvent.press(screen.getByTestId('translation-download-qe.hindi_omari'));
    await until(() => (screen.queryByTestId('translation-status-qe.hindi_omari') ? status('qe.hindi_omari').startsWith('On this phone') : false), 'the download');
    await star('rashid', FRENCH);
    await star('shaban', 'qe.turkish_shaban');
    fireEvent.changeText(screen.getByTestId('translation-search'), '');

    fireEvent.press(screen.getByTestId('translation-edit'));
    expect(rowsOf('favorites')).toEqual([FRENCH, 'qe.turkish_shaban']);
    expect(rowsOf('downloaded')).toEqual(['qe.hindi_omari']);
    // Only what can be edited: no language groups, no star or download buttons.
    expect(screen.queryByTestId('translation-section-tr')).toBeNull();
    expect(screen.queryByTestId(`translation-star-${FRENCH}`)).toBeNull();
    expect(screen.getByTestId(`translation-up-${FRENCH}`).props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByTestId('translation-up-qe.turkish_shaban'));
    await until(() => rowsOf('favorites')[0] === 'qe.turkish_shaban', 'the move');
    fireEvent.press(screen.getByTestId(`translation-unstar-${FRENCH}`));
    await until(() => rowsOf('favorites').length === 1, 'the star taken away');

    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    fireEvent.press(screen.getByTestId('translation-remove-qe.hindi_omari'));
    expect(alert).toHaveBeenCalledWith('Remove Azizul Haq Al-Omari?', expect.any(String), expect.any(Array));
    alert.mockRestore();
    await until(() => screen.queryByTestId('translation-section-downloaded') == null, 'the download deleted');

    fireEvent.press(screen.getByTestId('translation-edit'));
    expect(rowsOf('favorites')).toEqual(['qe.turkish_shaban']);
    expect(screen.queryByTestId('translation-section-downloaded')).toBeNull();
  });
});

