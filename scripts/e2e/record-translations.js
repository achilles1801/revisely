#!/usr/bin/env node
// Writes src/lib/e2e/fixtures/translations.json: Al-Ikhlas (112, on page 604) in one QuranEnc
// translation per script the app shows, as QuranEnc.com's API gives it, and page 604's Arabic as
// alquran.cloud gives it. E2E builds are hermetic (no translation can be fetched there), so they
// write these to the phone (src/lib/e2e/demoTranslations.ts) for flow 14-translations, which takes
// a screenshot of the verse sheet in each. Versions are the catalogue's, so the app keeps them.
//
//   node scripts/e2e/record-translations.js

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'src', 'lib', 'e2e', 'fixtures', 'translations.json');
const catalogue = require('../../src/data/quranencCatalogue.json').translations;

// One per script (and both directions): Latin, Arabic script (four languages), N'Ko, the Indic
// scripts, Sinhala, Ethiopic, Han, Japanese, Thai, Khmer, Cyrillic.
const KEYS = [
  'english_saheeh',
  'french_rashid',
  'vietnamese_rwwad',
  'urdu_junagarhi',
  'persian_ih',
  'kurdish_bamoki',
  'pashto_rwwad',
  'uyghur_saleh',
  'ankobambara_dayyan',
  'hindi_omari',
  'assamese_rafeeq',
  'punjabi_arif',
  'gujarati_omari',
  'tamil_baqavi',
  'telugu_muhammad',
  'kannada_hamza',
  'malayalam_kunhi',
  'sinhalese_mahir',
  'amharic_sadiq',
  'chinese_makin',
  'japanese_saeedsato',
  'thai_rwwad',
  'khmer_cambodia',
  'serbian_rwwad',
];
const SURA = 112;
const PAGE = 604;

async function json(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Revisely/1.0' } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

async function main() {
  const suras = {};
  for (const key of KEYS) {
    const entry = catalogue.find((e) => e.key === key);
    if (!entry) throw new Error(`${key} is not in the catalogue`);
    const { result } = await json(`https://quranenc.com/api/v1/translation/sura/${key}/${SURA}`);
    suras[key] = { version: entry.version, verses: result.map((a) => [a.translation, a.footnotes ?? '']) };
  }
  const page = await json(`https://api.alquran.cloud/v1/page/${PAGE}/quran-uthmani`);
  const arabic = page.data.ayahs.map((a) => ({
    surahNumber: a.surah.number,
    surahName: a.surah.englishName,
    ayahNumber: a.numberInSurah,
    text: a.text,
  }));
  const out = { sura: SURA, page: PAGE, read: new Date().toISOString().slice(0, 10), arabic, suras };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  console.log(`${KEYS.length} translations of sura ${SURA}, page ${PAGE}'s Arabic → ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
