# Store listing drafts: the slogan (not published)

Majd, Nov 27 2026: "yes lock it in, the suggested arabic line is fine, i think qur'an in headlines and normal quran in store keywords is fine". Slogan: **"Even one verse counts."** Arabic: **«ولو آية»**. Spelling: "Qur'an" in headlines, "Quran" only in store keywords (the keyword fields are unchanged).

Drafts only: `store/listing*.json` and `store/android/listing.json` are unchanged, so `scripts/asc.js` and `scripts/play.js` can't send them. Publishing waits for Majd's word.

| Field | Limit | Draft | Length | Today |
|---|---|---|---|---|
| App Store (US, en-GB): subtitle | 30 | Even one verse counts | 21 | Quran revision, on schedule |
| App Store (US, en-GB): promotional text | 170 | Even one verse counts. A little revision every day across everything you've memorized, with Revo to help you keep going. | 120 | Meet Revo, your revision coach: ask how your week went, what to revise first, or how anything in the app works. |
| App Store (US, en-GB): description's first line | 4000 | Even one verse counts. | 22 | Keep the Qur'an you've memorized. |
| App Store (ar-SA): subtitle | 30 | ولو آية | 7 | سمّع حفظك واكتشف أخطاءك |
| App Store (id): subtitle | 30 | Walau satu ayat pun berarti | 27 | Setor hafalan, lihat kesalahan |
| Google Play: short description | 80 | Even one verse counts. Revise what you've memorized, a little every day. | 72 | Revise your Quran hifz on a schedule. Time it, record it, and ask Revo. |

Where each goes once approved: `subtitle`, `promotionalText` and the first line of `description` in `store/listing.json` and `store/listing.en-GB.json`; `subtitle` in `store/listing.ar-SA.json` and `store/listing.id.json`; `shortDescription` in `store/android/listing.json`.
