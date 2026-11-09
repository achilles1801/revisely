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
   `reader` (inside the session on page 518), `activity` (from Home). Only `reader` and
   `activity` are on the page now (see Stills).
5. `python3 encode.py <raw dir> ../../docs/assets/clips` cuts out the pauses and writes MP4, WebM and
   a poster for each. Keep the total under about 5 MB.

## Revo

The Revo section plays the app's What's new "Revo moment", in a light and a dark take: the page
picks the one that matches the visitor's appearance (`site.js`, sources with `data-src` and
`data-src-dark`). It comes from the Revo session's recordings of the moment in the app (iPhone 17 Pro
Max simulator, 1320×2868, Indigo, an account named Maryam with Revo off; the README in
`~/Documents/revisely-today-mocks/whats-new/revo-intro/video/` says how they were made). The page's
take was made from the `revo-moment-preview-*-1320x2868.mp4` files, which end on the settled card
with no loop fade:

```bash
V=~/Documents/revisely-today-mocks/whats-new/revo-intro/video
python3 scripts/site-clips/revo.py --light $V/revo-moment-preview-light-1320x2868.mp4 \
  --dark $V/revo-moment-preview-dark-1320x2868.mp4 --hold 1.5 --fade 0.6 --poster 4.8
```

It writes `docs/assets/clips/revo-{light,dark}.{mp4,webm,jpg}` at the page's size, about 21 s:
the "Meet Revo" card stays 1.5 s longer than in the recording, so it can be read, then fades into
the first frame, so the loop has no seam. The poster is the "Revo" wordmark at 4.8 s (the Revo
session's choice), which is what a visitor with Reduce Motion sees until they press play; the end
card would show Turn on Revo and Later as buttons that do nothing on a web page. Update the video's
`aria-label` in `docs/index.html` if the moment changes. The section stays off the live site until
Revo is on for everyone.

## Stills

The Home and revision screens on the page are the approved App Store screenshots
(`store/screenshots/01-home.png`, `03-revision.png`), not clips: the Home clips (`plan`, `carry`)
showed Home from before 1.0.3 and were taken off the page on 2026-11-07. `python3
scripts/site-clips/stills.py` writes them to `docs/assets/img/screens/` (half size, WebP and JPEG,
with the Dynamic Island drawn in like the clips have it) and puts the Home screenshot into the
phone in `docs/assets/img/og.png`, the link preview. Run it again whenever those screenshots are
retaken.

The Arabic verse on the page (`docs/assets/img/verse-54-17.webp`) is the Uthmani text of 54:17 set in
Amiri (`assets/fonts/Amiri-Regular.ttf`) by headless Chrome and used as a CSS mask, so the page
needs no web font; the real text is in the HTML for screen readers.
