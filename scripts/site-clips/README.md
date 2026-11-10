# Website screens and clips

revisely.app's home is one frame: a slideshow of eight slides, each a line or two and a phone, then
a Revo section and a small footer (`docs/index.html`, `docs/assets/site.css`, `docs/assets/site.js`).
Each phone shows a picture (`docs/assets/img/slides/`, light and dark), and four of them play a loop
over it (`docs/assets/clips/`). Everything shown comes from the demo accounts, never a real user's data.

| Slide | Light | Dark |
| --- | --- | --- |
| 1 Pitch | Home in Indigo, Crimson and Jade, fanned (store captures) | the same, dark |
| 2 Today | Home (store capture) | Home (store capture) |
| 3 Time and record | loop `recite` | loop `session-dark` (the stopwatch, no recording) |
| 4 Search | loop `search` | still: the results |
| 5 Translations | loop `translations` | still: the picker (store capture) |
| 6 Activity | loop `activity` | still: the month (store capture) |
| 7 Prayer times and the Qibla | stills: Times and Qibla, crossfading | the same, dark |
| 8 Offline | still: Al-Mulk's opening page | the same, dark |

A slide with no dark loop shows its dark picture: `data-clip-dark` is simply left out.

## Pictures

```bash
python3 scripts/site-clips/slides.py --captures ~/Documents/revisely-today-mocks/store-104/captures \
  --stills <dir of the site's stills> --posters <dir where cut.py wrote the loops>
```

writes `docs/assets/img/slides/<name>.webp` at 600×1304 (the loops' size; about 1 MB for all 22).
The list of which picture comes from where is `SCREENS` in `slides.py`:

- **Store captures**: the store previews session's 1320×2868 captures of the screenshots account
  (`screenshots@revisely.app`, seeded by that session's `seed-screenshots.js`: today Juz 28,
  "Starts at Al-Mujadila"), so the site and the App Store listing match.
- **Stills**: `xcrun simctl io <udid> screenshot` of the same account, for screens the store set
  doesn't have: the Prayer sheet on Times and on Qibla (`flows/prayer.yaml`, `flows/qibla.yaml`,
  with the simulator's location set to Chicago), search results in dark, and Al-Mulk's first page
  (`revisely://read?page=562`), light and dark.
- **Posters**: for a slide with a loop, the frame the loop starts from, which `cut.py` writes as
  `<name>.jpg`. The page starts the loop at that moment (`data-t-light` / `data-t-dark` in
  `docs/index.html`, the same number as `--poster` below) and shows it only once it is there, so
  nothing jumps.

## Loops

Recorded on an iPhone 17 Pro Max simulator (a clone of one that already has the screenshots
account's session, so nobody types a password), with the status bar at 9:41
(`xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100
--wifiBars 3 --cellularBars 4`) and Metro from a `develop` checkout with `--no-dev --minify`.
Sentry stays off on simulators.

1. `scripts/site-clips/take.sh <udid> scripts/site-clips/flows/<flow>.yaml raw/<name>.mp4` records
   the simulator while Maestro runs the flow. `search`, `translations` and `activity` start from
   Home (translations from the reader on Ayat al-Kursi); `session` is recorded with the phone in
   dark to make `session-dark`. A stopwatch started in a session is discarded afterwards, so nothing
   is logged. `recite` (light) is cut from the store previews' iOS tour footage: the stopwatch
   and a recording running over Al-Mulk.
2. `cut.py` turns a take into a loop: simctl writes a frame only when the screen changes, so it
   rebuilds a steady 30 fps copy, shortens every still stretch to `--hold`, keeps (`--keep`) or drops
   (`--drop`) stretches, and cross-fades the end into the first frame. It writes `<name>.mp4`
   (H.264), `<name>.webm` (VP9) and `<name>.jpg`, 600 px wide. The page's loops:

   ```bash
   cd scripts/site-clips
   python3 cut.py raw/recite.mp4 out recite --start 7.6 --end 33 --hold 1.4 --keep 22.5-33 --fade 0.5 --poster 13.5
   python3 cut.py raw/session-dark.mp4 out session-dark --start 7.4 --end 29.6 --hold 1.5 --fade 0.5 \
     --keep 16.5-28.5 --drop 20.6-27.0 --poster 3.2
   python3 cut.py raw/search.mp4 out search --start 13.0 --hold 1.9 --fade 0.5 --poster 7.6 --vp9-crf 43
   python3 cut.py raw/translations.mp4 out translations --start 8.6 --hold 1.6 --fade 0.5 --drop 26.8-38.7 --poster 6.0
   python3 cut.py raw/activity.mp4 out activity --start 11.62 --hold 1.6 --fade 0.5 --poster 3.0
   ```

   A ticking clock never looks still to the freeze detection, hence `--keep` around the stopwatch.
   `--vp9-crf` is raised when the WebM comes out heavier than the MP4 (search's did at 38).
3. Copy the `.mp4` and `.webm` into `docs/assets/clips/` and the `.jpg` into the posters folder for
   `slides.py`. The loops are 0.4–1.2 MB each; a visitor downloads one only when its slide is
   showing, and none with Reduce Motion on until they press play.

## Revo

The Revo section plays the app's What's new "Revo moment", in a light and a dark take
(`data-clip-light` / `data-clip-dark` on `#revo-screen`). It comes from the Revo session's recordings
of the moment in the app (iPhone 17 Pro Max simulator, 1320×2868, Indigo, an account named Maryam
with Revo off; the README in `~/Documents/revisely-today-mocks/whats-new/revo-intro/video/` says how
they were made). The page's take was made from the `revo-moment-preview-*-1320x2868.mp4` files,
which end on the settled card with no loop fade:

```bash
V=~/Documents/revisely-today-mocks/whats-new/revo-intro/video
python3 scripts/site-clips/revo.py --light $V/revo-moment-preview-light-1320x2868.mp4 \
  --dark $V/revo-moment-preview-dark-1320x2868.mp4 --hold 1.5 --fade 0.6 --poster 4.8
```

It writes `docs/assets/clips/revo-{light,dark}.{mp4,webm,jpg}` at the page's size, about 21 s:
the "Meet Revo" card stays 1.5 s longer than in the recording, so it can be read, then fades into
the first frame, so the loop has no seam. The poster is the "Revo" wordmark at 4.8 s, which is what
a visitor with Reduce Motion sees until they press play; the end card would show Turn on Revo and
Later as buttons that do nothing on a web page. Update the picture's `alt` in `docs/index.html` if
the moment changes.

## Share image

`python3 scripts/site-clips/stills.py` puts the App Store Home screenshot
(`store/screenshots/01-home.png`) into the phone in `docs/assets/img/og.png`, the link preview. Run
it again whenever that screenshot is retaken.
