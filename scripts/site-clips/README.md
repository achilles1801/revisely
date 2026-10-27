# Website clips

The looping clips on revisely.app (`docs/assets/clips/`) are recordings of the dev client on an
iPhone 17 Pro Max simulator, in the new design (Settings → Preview → New design) with the Indigo accent
(the default; Settings → Appearance → Accent), light appearance,
signed in to the demo account `screenshots@revisely.app`. No real user's data appears in them.

## Recording

1. Clone a simulator that already has the demo session, so nobody types a password
   (`xcrun simctl clone <udid> "Revisely website clips"`), boot it and set the status bar:
   `xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4`.
2. Run Metro from a `develop` checkout with `--no-dev --minify` and open the dev client on it.
   Sentry stays off on simulators (`sentryReports` in `src/lib/releaseInfo.ts`).
3. Optional: `seed-demo-history.js` adds a month of revision sessions to the demo account (tagged
   `seed: 'website-clips'`; `--remove` deletes exactly those) and a half-finished yesterday, which is
   what makes Home offer "Add 6 from yesterday". Run it from `functions/` with the admin key, e.g.
   `GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json ADMIN_PATH=$PWD/node_modules/firebase-admin node ../scripts/site-clips/seed-demo-history.js`.
   The dates in it are for October 2026; move them before reusing it.
4. For each flow, record while Maestro drives the app:
   `xcrun simctl io <udid> recordVideo --codec=h264 raw-<name>.mp4` in one shell,
   `maestro --device <udid> test flows/<name>.yaml` in another, then Ctrl-C the recording.
   `- pause: N` in the flows is shorthand: expand it to an optional `extendedWaitUntil` with a
   timeout of N ms before running (Maestro has no plain wait). Order: `carry` (once a day: carrying
   over can't be repeated without undoing `carryOver` on the user doc), `plan` (from Home),
   `reader` (inside the session on page 518), `activity` (from Home).
5. `python3 encode.py <raw dir> ../../docs/assets/clips` cuts out the pauses and writes MP4, WebM and
   a poster for each. Keep the total under about 5 MB.

The Arabic verse on the page (`docs/assets/img/verse-54-17.webp`) is the Uthmani text of 54:17 set in
Amiri (`assets/fonts/Amiri-Regular.ttf`) by headless Chrome and used as a CSS mask, so the page
needs no web font; the real text is in the HTML for screen readers.
