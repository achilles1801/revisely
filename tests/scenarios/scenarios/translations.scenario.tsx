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
import { installQuranEnc, publishVersion, requestsTo, resetQuranEnc } from '../harness/quranenc';
import { VerseSheet } from '../../../src/components/verse/VerseSheet';
import { ThemeProvider } from '../../../src/context/ThemeContext';
import { DesignProvider } from '../../../src/design/DesignContext';
import { __resetQuranEncForTests } from '../../../src/lib/quranenc';

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

async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await act(async () => {
      await new Promise((r) => setImmediate(r));
    });
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** The verse sheet on Al-Ikhlas 2, as the reader opens it, its translation chosen by the user. */
function openSheet(initial: string, tester: boolean) {
  const chosen: string[] = [];
  function Reader() {
    const [id, setId] = useState(initial);
    return (
      <ThemeProvider>
        <DesignProvider>
          <VerseSheet
            verse={VERSE}
            translationId={id}
            tester={tester}
            onChangeTranslation={(next: string) => {
              chosen.push(next);
              setId(next);
            }}
            reciter={undefined}
            onChangeReciter={() => undefined}
            onNavigate={() => undefined}
            onClose={() => undefined}
          />
        </DesignProvider>
      </ThemeProvider>
    );
  }
  render(<Reader />);
  return { chosen };
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
});

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
    // The one in use first, then the languages with their own names.
    expect(textOf(screen.getByTestId('translation-section-chosen') as never)).toBe('In use');
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
