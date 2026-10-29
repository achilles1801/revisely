# Bundled notification sounds

The default athan for prayer notifications, bundled so it works offline and before any voice is
downloaded. The expo-notifications plugin (`app.config.js`) copies both files into the app on each
platform. Each platform uses its own file, and the names differ because Android's `res/raw` keys
files by basename.

| File | Platform | Format |
|---|---|---|
| `athan_default.caf` | iOS (`content.sound`) | IMA4 ADPCM, 22.05 kHz mono, 29.5 s |
| `athan_default_android.m4a` | Android (channel `prayer-athan`) | AAC 44.1 kHz mono, 29.5 s |

**Source:** Adhan by Asim Javed, ICR mosque (Friday 1st adhan, 17 May 2024), Internet Archive,
<https://archive.org/details/icr-friday-prayer-1st-adhan-17th-may-2024-9th-dhul-qadah-1445-by-asim-javed>.
**Licence:** CC0 1.0 (<https://creativecommons.org/publicdomain/zero/1.0/>). Credit isn't required,
but the app gives it. The clip was cut and loudness-normalised (−16 LUFS, faded under 30 s, iOS's
limit for a notification sound) by `build_athan.py` in the athan project (`~/Documents/revisely-athan`,
`notif/icr-asim-javed.*`).

Other voices are downloaded at runtime from `revisely.app/athan/` (worker/athan.ts) into
`Library/Sounds`, so they are not in the app binary and can be withdrawn.
