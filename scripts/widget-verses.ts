// Builds targets/widget/verses.json, the verse-of-the-day list for the widget:
// short, complete verses, their Arabic (Uthmani, as the app's verse sheet shows
// it, from api.alquran.cloud), surah name and mushaf page.
//
//   npx sucrase-node scripts/widget-verses.ts
//
// The widget shows Arabic and the reference only: Saheeh International isn't
// licensed for this (issue #80), and The Clear Quran® is API-only.

import fs from 'fs';
import path from 'path';
import { pageOfVerse } from '../src/lib/verses';
import { getSurah } from '../src/lib/quranData';

// Short, whole verses: remembrance, the Qur'an itself, du'a, hope.
const PICKS: [number, number][] = [
  [1, 2], [1, 5], [2, 152], [2, 153], [2, 45], [2, 201], [3, 8], [3, 139], [7, 23], [13, 28],
  [14, 7], [15, 9], [16, 128], [20, 25], [20, 26], [23, 118], [28, 24], [29, 69], [33, 41], [40, 60],
  [47, 24], [51, 56], [54, 17], [55, 13], [55, 26], [55, 27], [73, 4], [75, 17], [87, 6], [93, 3],
  [93, 5], [94, 5], [94, 6], [94, 8], [96, 1], [97, 1], [99, 7], [103, 2], [108, 1], [110, 1],
  [112, 1], [112, 4], [3, 200], [2, 156], [65, 3],
];
const MAX_CHARS = 140; // longer won't fit a small widget in Amiri

async function main() {
  const out: { sura: number; ayah: number; surah: string; page: number; arabic: string }[] = [];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (const [sura, ayah] of PICKS) {
    // Gently: the API rate-limits bursts (429).
    let res = await fetch(`https://api.alquran.cloud/v1/ayah/${sura}:${ayah}/quran-uthmani`);
    for (let attempt = 1; res.status === 429 && attempt <= 5; attempt++) {
      await wait(2000 * attempt);
      res = await fetch(`https://api.alquran.cloud/v1/ayah/${sura}:${ayah}/quran-uthmani`);
    }
    if (!res.ok) throw new Error(`${sura}:${ayah}: HTTP ${res.status}`);
    await wait(800);
    const json = (await res.json()) as { data?: { text?: unknown; numberInSurah?: unknown; surah?: { number?: unknown } } };
    const d = json.data;
    if (!d || d.surah?.number !== sura || d.numberInSurah !== ayah || typeof d.text !== 'string') {
      throw new Error(`${sura}:${ayah}: unexpected response`);
    }
    let text = d.text.trim();
    // Arabic letters, marks and spaces only: nothing else belongs in a verse.
    if (!/^[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿\s]+$/.test(text)) {
      throw new Error(`${sura}:${ayah}: unexpected characters`);
    }
    // As the verse sheet (stripBismillah): the edition puts the basmala before verse 1.
    if (ayah === 1 && sura !== 1 && sura !== 9) {
      const words = text.split(/\s+/);
      if (words.length > 4 && words[0].startsWith('بِسْمِ')) text = words.slice(4).join(' ');
    }
    if (text.length > MAX_CHARS) {
      console.log(`skip ${sura}:${ayah} (${text.length} chars)`);
      continue;
    }
    const surah = getSurah(sura)?.name;
    if (!surah) throw new Error(`no surah ${sura}`);
    out.push({ sura, ayah, surah, page: pageOfVerse({ sura, ayah }), arabic: text });
  }
  const file = path.join(__dirname, '..', 'targets', 'widget', 'verses.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  console.log(`${out.length} verses → ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
