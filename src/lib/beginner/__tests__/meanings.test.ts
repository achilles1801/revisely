// Every ayah of every surah on the beginner path has its meaning (BEHAVIOUR.md BEGIN-7, BEGIN-4; Majd, Nov 28 2026:
// "there's no translation for some of these verses"). Read from QuranEnc's own Saheeh International for the 38 surahs
// (recorded in tests/scenarios/fixtures/quranenc, as the app fetches it), through the function Learn and Home show it with.
// The rule it replaced left out every verse with a footnote: 161 of the 571.
import fs from 'fs';
import path from 'path';
import { ayahCount } from '../../ayahKeys';
import { BEGINNER_SURAHS } from '../surahs';
import { meaningOf, meaningText } from '../learn';

const FIXTURES = path.resolve(__dirname, '../../../../tests/scenarios/fixtures/quranenc/sura/english_saheeh');
type Recorded = { sura: string; aya: string; translation: string; footnotes: string };
const recorded = (sura: number): Recorded[] => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${sura}.json`), 'utf8')).result;

describe('[BEGIN-7] every ayah on the path has its meaning', () => {
  it('all 571 ayahs of the 38 surahs, footnoted or not, each with its text and its footnotes', () => {
    let ayahs = 0;
    let footnoted = 0;
    const missing: string[] = [];
    for (const sura of BEGINNER_SURAHS) {
      const verses = recorded(sura);
      expect([sura, verses.length]).toEqual([sura, ayahCount(sura)]);
      for (const v of verses) {
        ayahs += 1;
        const meaning = meaningOf({ text: v.translation, footnotes: v.footnotes });
        if (!meaning || meaningText(meaning).trim().length === 0) {
          missing.push(`${v.sura}:${v.aya}`);
          continue;
        }
        if (v.footnotes.trim()) {
          footnoted += 1;
          // Nothing cut (TRANS-1): every footnote kept, and no "[n]" left unraised for a footnote it has.
          const lines = v.footnotes.split('\n').filter((l) => l.trim());
          expect([`${v.sura}:${v.aya}`, meaning.footnotes.length]).toEqual([`${v.sura}:${v.aya}`, lines.length]);
          for (const f of meaning.footnotes) {
            const n = /^\[(\d+)\]/.exec(lines[meaning.footnotes.indexOf(f)].trim())?.[1];
            if (n) expect(meaningText(meaning)).not.toContain(`[${n}]`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
    expect([ayahs, footnoted]).toEqual([571, 161]);
  });

  it('Al-Fatihah’s first, second and fourth, as Majd found them blank: each shown, its footnote numbers raised', () => {
    const fatihah = recorded(1).map((v) => meaningOf({ text: v.translation, footnotes: v.footnotes })!);
    expect(meaningText(fatihah[0])).toBe('In the name of Allāh,² the Entirely Merciful, the Especially Merciful.³');
    expect(meaningText(fatihah[1])).toBe('[All] praise is [due] to Allāh, Lord⁴ of the worlds -');
    expect(meaningText(fatihah[3])).toBe('Sovereign of the Day of Recompense.⁵');
    expect(fatihah[0].footnotes.map((f) => f.mark)).toEqual(['²', '³']);
  });

  it('no verse, or one with no text, has none (Learn then says it is loading, or offline)', () => {
    expect(meaningOf(null)).toBeNull();
    expect(meaningOf({ text: '  ', footnotes: '' })).toBeNull();
  });
});
