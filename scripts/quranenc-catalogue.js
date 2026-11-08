#!/usr/bin/env node
// Writes src/data/quranencCatalogue.json: every translation in QuranEnc.com's list
// (https://quranenc.com/api/v1/translations/list), as the app ships it. Each entry
// keeps QuranEnc's own key, language, direction, version, title and description
// (the credit its terms ask for: the publisher, QuranEnc.com and the version), and
// about how many bytes it takes on a phone.
//
// The app reads the list again once a day (lib/quranenc), so versions shown stay
// current without this file; run it again to add translations QuranEnc has added.
// Translations on QuranEnc's website but not in this list have no published
// version, which its terms require: they are left out until QuranEnc lists them.
//
// Size: QuranEnc's SQLite file for the translation (HEAD, no download), times the
// ratio measured for Saheeh International (1,093,165 bytes kept on a phone,
// 1,245,184 in the SQLite file, Nov 2026).
//
//   node scripts/quranenc-catalogue.js

const fs = require('fs');
const path = require('path');

const API = 'https://quranenc.com/api/v1';
const OUT = path.join(__dirname, '..', 'src', 'data', 'quranencCatalogue.json');
const ON_PHONE_RATIO = 1093165 / 1245184;
const PARALLEL = 6;
const KEY = /^[a-z0-9_]{1,36}$/;
const VERSION = /^[\w.-]{1,32}$/;

async function json(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Revisely/1.0' } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

async function bytesOf(key) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`https://quranenc.com/downloads/sqlite/${key}.sqlite`, { method: 'HEAD' });
      if (!res.ok) throw new Error(`${res.status} for ${key}`);
      const n = Number(res.headers.get('content-length'));
      if (!Number.isFinite(n) || n <= 0) throw new Error(`No length for ${key}`);
      return Math.round(n * ON_PHONE_RATIO);
    } catch (err) {
      if (attempt >= 3) throw err;
    }
  }
}

async function main() {
  const { translations } = await json(`${API}/translations/list`);
  if (!Array.isArray(translations) || translations.length < 50) throw new Error('Unexpected list');
  const entries = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < translations.length) {
        const t = translations[next++];
        if (!KEY.test(t.key) || !VERSION.test(t.version)) throw new Error(`Unexpected entry ${t.key}`);
        if (t.direction !== 'ltr' && t.direction !== 'rtl') throw new Error(`Unexpected direction for ${t.key}`);
        entries.push({
          key: t.key,
          lang: t.language_iso_code,
          dir: t.direction,
          version: t.version,
          updated: Number(t.last_update) || 0,
          title: String(t.title).trim(),
          description: String(t.description ?? '').trim(),
          bytes: await bytesOf(t.key),
        });
      }
    }),
  );
  entries.sort((a, b) => a.lang.localeCompare(b.lang) || a.key.localeCompare(b.key));
  const out = { source: `${API}/translations/list`, read: new Date().toISOString().slice(0, 10), translations: entries };
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${entries.length} translations, ${new Set(entries.map((e) => e.lang)).size} languages → ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
