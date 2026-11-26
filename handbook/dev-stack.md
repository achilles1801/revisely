# Revisely Dev, the dev backend, dev.revisely.app

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## Dev stack (Revisely Dev, the dev backend, dev.revisely.app)

Majd's plan of Nov 11 2026 (`~/Documents/revisely-dev-stack/PLAN.md`): testing runs on an app and a backend
of its own, never on production data. What's below is in the repository; the clicks in PLAN §3 (App Store
Connect, Play, the Firebase project, Cloudflare, Workload Identity) are Majd's, and each switch stays off
until its part is set up.
- **Revisely Dev** (`APP_VARIANT=dev` in app.config.js): bundle id and package
  `com.revisionbuddy.app.dev`, name "Revisely Dev", the amber icon (`assets/dev/`), scheme
  `revisely-dev`, App Group `group.com.revisionbuddy.app.dev`, widget `com.revisionbuddy.app.dev.widget`.
  It installs beside the store app.
  - **Production's fingerprints don't move.** Without APP_VARIANT every value resolves as the store
    app's, and the fingerprint hashes the resolved config (and the plugins it loads), not the file.
    Check both fingerprints before and after any change to app.config.js (Nov 11 2026: iOS
    `2df7a2f0…`, Android `8876d062…`, unchanged by the variant). A dev-only value or plugin goes behind
    `DEV`: a plugin required for every variant is loaded for the store app too and moves its hash.
  - `plugins/withDevVariant` (dev only) points the widget's App Group and `revisely://` links at
    Revisely Dev's, in the copy the build works on (changing the Swift in `targets/` would move
    production's fingerprints). `APP_VARIANT=dev npx expo prebuild` on a laptop rewrites the tracked
    files: `git checkout targets/`. The lasting fix (the widget works both out from its bundle id) rides
    the next native release.
  - EAS fingerprints the project again after prebuild, and `targets/` counts: with APP_VARIANT=dev,
    `fingerprint.config.js` hashes the widget's Swift and `widget.entitlements` as committed
    (`devWidgetAsCommitted`), or the build stops on a runtime mismatch (Nov 11 2026: 0bce2dd9 before,
    282a2e42 inside). The store app's fingerprints never use it. `plugins/withDevVariant.js` itself
    counts toward Revisely Dev's fingerprints: editing it means new Dev builds on both platforms.
  - In the app (`lib/variant`):
    - it keeps its own `dev` channel, never preview or production, tester or not;
    - it never shows the store sheets;
    - it shows App info and Check for updates to everyone;
    - it calls The Clear Quran through dev.revisely.app (`extra.apiBase`), which has no key for it (below);
    - it reports to Sentry as environment `dev`, under `com.revisionbuddy.app.dev@…`. The crash-free
      gate, alerts, health issues, daily report and metrics console read production and preview only.
  - EAS: build profile `dev` (channel `dev`, environment `development`, APP_VARIANT=dev); submit profile
    `dev`: App Store Connect app "Revisely Dev" (Apple ID `6833565026`, SKU `revisely-dev`; its TestFlight
    internal group "Dev Team" gets every build) and Play internal testing of the Play app "Revisely Dev".
    Signing: EAS holds Revisely Dev's own profiles (the app and `.dev.widget`) and Android keystore.
  - The EAS `development` environment holds the dev project's config (`FIREBASE_*`, Google client ids,
    `API_BASE=https://dev.revisely.app`, the Sentry DSN). The store app's `development` profile (a
    simulator dev client, built by hand; last built May 2026) reads it too, so such a client talks to
    revisely-dev, where Google sign-in won't work for the store bundle id. `production` is untouched.
- **Updates and builds:** with the repository variable `DEV_APP` = `true`, a merged PR whose own `Required`
  passed goes to `dev` at the merge (`dev-at-merge.yml`, Majd, Nov 23 2026). Preview publishes each tested develop
  commit to `preview`; what Dev doesn't have yet (a push with no PR, a native change) goes through Dev's own lane, a
  run `Preview · Dev <sha>` in the group `eas-dev-builds`: its builds, then `dev-update`. Preview never waits for it.
  Every publish to `dev` holds the concurrency group `eas-dev`, and an older commit never replaces a newer one
  (`[commit <sha>]` in the message, `.github/scripts/publish-update.sh`).
  - Revisely Dev's runtimes are its own (tags `ios-dev-fp/<hash>`, `android-dev-fp/<hash>`), and a
    missing one builds (`ios-build.yml` / `android-build.yml` with `variant: dev`; EAS Build by hand has
    a variant choice too).
  - Android builds there only once `DEV_ANDROID_SUBMIT` is on. Before that, the first bundle goes to
    Play Console by hand: EAS Build, variant dev, submit off, then upload the .aab.
  - Nothing on the dev side stops preview: the at-merge publish is its own workflow, Dev's builds and update are their
    own run, Preview's dev steps come after preview's update and can fail without failing it, and Promote reads only the
    preview branch.
  - Each native change now builds twice (store and Dev).
  - **Native code in Revisely Dev only** (Nov 23 2026, for 1.0.5's on-device Recite; measured with local fingerprints
    before and after: the store app's unchanged, Revisely Dev's moving with the code):
    - an npm library with native code: the root `react-native.config.js` leaves it out unless
      `APP_VARIANT === 'dev'`, as it leaves whisper.rn out of Android; its config plugin, if any, behind `DEV`;
    - our own module: outside `modules/` (everything there is linked into the store app), for example
      `modules-dev/<name>/`, added to autolinking's search paths by a Dev-only plugin (Podfile
      `use_expo_modules!(searchPaths: [...])`, settings.gradle `expoAutolinking.searchPaths`), and counted by
      `fingerprint.config.js`'s `extraSources` only under APP_VARIANT=dev;
    - files a build fetches or generates go in `fingerprint.config.js`'s `ignorePaths`: EAS fingerprints again inside the
      build, and a hash that differs there stops it;
    - the JavaScript loads the module lazily (`requireOptionalNativeModule`) behind `isDevVariant()`.
    The release owner's native PR then moves it into the store app, and the store fingerprints once.
  - Secrets: `GOOGLE_SERVICE_INFO_PLIST_DEV` and `GOOGLE_SERVICES_JSON_DEV` (base64, as the store app's),
    from `firebase apps:sdkconfig` of the dev project's iOS and Android apps.
- **The dev backend:** Firebase project `revisely-dev` (number 433792838929; Blaze, a $10 budget alert;
  Firestore nam5; Storage `revisely-dev.firebasestorage.app`), the same rules and functions as production.
  - **Apps:** "Revisely Dev iOS" (`1:433792838929:ios:854e01f457f27d29bbf0b0`), "Revisely Dev Android"
    (`…:android:5c8c71d0893a4fe3bbf0b0`, with the EAS upload key's SHA-1; add Play App Signing's SHA-1
    after the first upload, or Google sign-in fails on Play installs) and "Revisely Dev Web"
    (`…:web:3d6ee9a1d16883d7bbf0b0`, the JavaScript SDK's `FIREBASE_APP_ID`, as production uses its web
    app). Sign-in: email and password, Google, Apple.
  - **Deploys:** `dev-backend.yml` deploys rules, indexes, Storage rules and every function on each
    develop push that changes them. Majd's standing OK covers dev only.
    - It runs keyless: GitHub OIDC through Workload Identity, develop of this repository only.
    - Its variables are `DEV_BACKEND`, `DEV_FIREBASE_PROJECT`, `DEV_WIF_PROVIDER` and `DEV_DEPLOY_SA`.
    - It refuses the production project. Production deploys stay by hand.
    - It never deletes anything on dev (Nov 16 2026): functions go by name, with no `--force`. Its `--force` deleted
      Revisely Console's functions and indexes on every develop deploy while they lived on a branch. A function or
      index taken out of the source stays on dev until it is deleted by hand.
    - Its `HOLD` lists functions a branch not yet in develop owns on dev, deployed by hand from it, so develop's older
      copies don't overwrite them. The change that brings them to develop empties it.
  - **Revo** has its own key there (a "revisely-dev" Anthropic workspace with a $10 monthly limit) and a
    `config/coach` cap of $10.
  - **Scripts** reach dev with `GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json`.
  - **Dev starts empty.** Sign in with any account; `set-preview-tester.js` makes it a tester, and Load
    test scenario fills it.
  - **Mushaf pages** come from production's public bucket (public, immutable files, nobody's data).
- **dev.revisely.app:** the Worker `revisely-dev` (`wrangler.dev.jsonc`), the same code as revisely.app.
  - Workers Builds deploys it from develop (non-production branch builds off), so its config is in both
    main and develop. A dev-only Worker change (behind a var only `wrangler.dev.jsonc` sets) goes through
    develop and reaches main with the next release, switched off there. Only a change meant for revisely.app
    goes to main first (Branches and releases).
  - `NOINDEX`: every answer carries `X-Robots-Tag: noindex, nofollow`, and `/robots.txt` disallows
    everything.
  - **Sign-in gate** (`worker/gate.ts`, Majd, Nov 14 2026: only him for now): with `DEV_GATE` "1"
    (`wrangler.dev.jsonc` only), every page needs a revisely-dev account with the custom claim `devSite`,
    kept in a `__Host-` cookie for the hour its ID token lasts. `/api/*` stays open for the Dev app. Let
    someone in with `functions/scripts/set-dev-site.js <email>` (`--off`, `--list`; revisely-dev only):
    nobody's email is in the repository.
  - **Keep it in step with revisely.app:** revisely.app is built from `main` and dev.revisely.app from
    `develop`. After a site PR merges into `main`, merge `main` back into `develop` (or send site work
    through `develop`); dev had drifted a whole redesign behind until Nov 14 2026.
  - **Which branch a Worker change goes to:** a dev-only change (behind a var only `wrangler.dev.jsonc`
    sets, like `DEV_GATE`, `ACCOUNT_PAGES` or `RECITE_SECTION`) goes through `develop` and reaches `main` with the next
    release, switched off there. Only a change meant for revisely.app goes to `main` first.
  - **The home's Recite section** (mistake detection: Recite, Mark mistakes, Recite the mistakes again, Test me,
    Premium's early access; Nov 17 2026), on dev only until the release:
    - `RECITE_SECTION` "1" (`wrangler.dev.jsonc` only) makes the worker add `recite-on` to the home's `<body>`
      (`worker/recite.ts`). `site.css` hides everything marked `data-when="RECITE_SECTION"` (the section and its
      header link) without it.
    - revisely.app serves its home straight from the assets, so the var can't turn it on there. **At the release** the
      line is `<body class="home recite-on">` in `docs/index.html`, with `RELEASED` in
      `worker/__tests__/reciteSection.test.ts` (which also fails if `wrangler.jsonc` ever sets the var).
    - Its screens are Revisely Dev's own, from E2E flow 18 (`scripts/site-clips/recite.py`, README there).
    - `#mistakes` (the store listing links it); the words start from #728 (Website & Open Door's, closed) with Premium's
      early-access wording (Majd, Nov 18: free for every account and sign-up, no end date yet, kept for life with
      features added later, bi-idhnillah) linking
      `/terms/#premium-early-access`, which arrives with #727 (terms, into main, held for the release).
  - Its API accepts only the dev project's sign-ins.
  - **No Clear Quran key.** The Clear Quran's portal allows one active Production key per product
    ("duplicate key … api_keys_active_developer_account_id_product_environment"), and revisely.app holds
    it. So the dev Worker answers 503 for The Clear Quran, and Revisely Dev shows "Couldn't load
    translation" for it (every other translation works). Don't give it revisely.app's key. If The Clear
    Quran allows a second key (or publishes a sandbox host), set it with
    `npx wrangler@4.153.0 secret put TCQ_API_KEY_LIVE --config wrangler.dev.jsonc`: its budget is already
    30 requests a day, which with revisely.app's 300 stays under the plan's 10,000 a month.
  - Its config is left out like `wrangler.jsonc` (app hash, paths-ignore, E2E, claude-fix).
- **The laptop's `.env`** stays on production until the orchestrator says otherwise: the store previews are
  filmed with it.
- **Recitation check** (Majd, Nov 11 2026: "push the best version we have so far on dev"): the lab's mistake
  detection in the Dev app only (`lib/reciteCheck`: `isDevVariant()`, `previewTester`, a binary with the
  microphone stream). The reader's one mic: Recite follows the reciter on the page, and with Mark mistakes (Premium) it
  marks the words skipped, said wrong or added, wrong harakat and letters and, with Strict, tajweed notes (madd lengths
  per Settings → Mushaf and Recite, qalqalah, ghunnah, ikhfa, idgham, iqlab). The verse menu's old "Check my recitation" row
  (record, then check) is gone (Nov 15 2026; nothing showed it any more).
  - **Two tiers** (Majd, Nov 22 2026: "saying a wrong haraka or letter IS a word mistake. the only two "tiers" is word
    (including haraqah and letters) mistakes and then second tier is tajweed level mistake which we can market as
    "beta". but the former should be perfected by release date"; RECITE-2). `markTier` in `lib/reciteLive/contract`:
    `mistake` (a wrong, skipped or extra word, a wrong haraka, a wrong letter: named "Wrong haraka", "Wrong letter",
    counted, never a "slip"), `tajweed` (Strict, "(Beta)" after its name in the card, the summary's line, Insights and
    Settings' "Strict (Beta)"; never counted) and `unclear` (Not clear, never counted, not a tier). Settings' levels are
    "Mistakes" and "Strict (Beta)"; there is no words-only level. `markGroup` stays what a mark is about: Recite memory
    keys words by it.
    - **Colours aren't decided** (Majd's decision says nothing about them): they stay by `markGroup`. The one switch is
      `COLOURS_FOLLOW_TIERS` in `components/reciteLive/markColours` (`colourGroup`, `markFill`, `markFirm`, the bar's
      `toneFill`): on, every mistake is red, amber only Not clear. Every page wash must read `markFill`/`markFirm` for it
      to reach them (LiveUnderlay and the hidden page's marks index colours by group until the shading PR moves them).
  - **In revision sessions too** (Majd, Nov 17 2026: "add the mistake detection and mic functionality same as mushaf to
    the revision sessions themselves and get rid of that old hidden view thing on the top"; RECITE-9). Everything Recite
    puts on a page lives in `components/reciteLive/useReciteLayer`, used by the reader and `ActiveRevisionScreen` alike:
    the mic and its menu, the take's bar, the page layers, the cards, the summary, the notice and the Premium page. A
    screen gives it `showPage` (its pager's `scrollToPage`, false for a page it doesn't hold) and puts `bar`,
    `controls`, `activity`, `pager` and `sheets` where they go.
    - A take never marks a session's page revised: its page turns are `scrollToPage`, which never reports an advance,
      so only a swipe or the Pages sheet marks one (SESS-1). A take past the session's last page leaves the page where it is.
    - A place the session doesn't hold (a similar ayah, a slip's ayah, a past take) opens the reader over it
      (`navigation.push('QuranReader', …)`); Back comes back. Test me is the reader's only (`testMe: false`).
    - The old hidden recite mode (the eye at the top of a session, `reciteModeEnabled`, on-device word following and
      pause detection) is gone with its help topic. The on-device speech model stays: voice search uses it.
  - The checker runs on Cloud Run in revisely-dev (`checker/` in the private repository `achilles1801/revisely-internal`,
    its README; it left this public repository on Nov 21 2026): the app has no JS-only way
    to run the model on the phone. It is deployed by hand, never to production, and the store app never calls it.
  - **Two services** (recite-server, Nov 15 2026; Majd approved halving the light levels' cost; recite-contract.md,
    "Two services"):
    - Recite (`follow`), and Words & harakat with letters off, go to `recite-check-pair` (two takes an instance);
      everything else goes to `recite-check`.
    - The app's Words & harakat sends `letters: true`, so today only Recite goes to the pair.
    - `lib/reciteLive/socket` picks the address when a take starts. A take the pair refuses (`level_elsewhere`), or
      can't start (unreachable, or its 403 while private), starts again on `recite-check` as a new take there.
    - A resume goes to the service that said `ready`.
    - `warmUpReciteCheck()` wakes both. Its pair `/health` answer also says whether the pair takes this phone's takes:
      a 403 (still private), or a take it couldn't start, sends takes straight to `recite-check` for an hour
      (`lib/reciteLive/pairService`, in memory). So even the first take after the reader opens pays no refused upgrade.
      An answer from `/health` lets takes back.
  - The model's licence (Quran Muaalem License 1.0, 2.1) asks for its AI notice, English and Arabic, before the
    first use and reachable afterwards: the sheet shows it first, and Settings → About has it.
  - "Keep as test data" (on by default; in the sheet and Settings → Testing) keeps each recording and its result
    in `recite-tests/<uid>/` in the dev bucket (closed to clients). The lab copies them with `fetch_takes.py`.
    **Nobody listens to them**, Majd included; they are held out of training, like the /record takes. Sessions may
    replay them through software to debug and improve Recite (Majd, Nov 26 2026: "yes all sessions can look at any
    recordings it wants to help debug and fix issues and enhance things"), within what testers were told: software
    checks them, no person plays another tester's take, and none goes into training.
  - **"Not clear"** (Majd, Nov 15 2026): a harakat or letter mark with `sure: "likely"` reads "Not clear" ("Say it more
    clearly. Not counted in the score."), shows only what was expected on its card, isn't amber in the bar, comes last
    in the summary and never counts in the score (`isUnclear` in `lib/reciteLive/contract`). A checker that sends
    `score.unclear` has left them out of `mistakes`; from one that doesn't, the app takes out the ones shown.
  - **Hear it and Pause** (Majd's Dev take, Nov 15 2026: Hear it ended the take, and Husary played on past it into
    Control Center): Hear it plays the reciter's ayah on the card's own player (`lib/reciteLive/hearAudio`), never the
    app's recitation, so there's no reader highlight, mini player or lock screen. During a take it pauses first: the
    microphone goes off and the take stays open on the same connection. The bar's Pause and Resume do the same, and
    Resume carries on from where it was. What the card plays stops when the card closes, the take ends or is closed, a
    new one starts, the reader goes, or anything else takes the audio.
  - **The checker is kept warm** (recite-server, Nov 15 2026; Majd's yes): Cloud Run stops an idle instance after about
    15 minutes and a new one takes 6–9 s. So while the reader is open, focused and in front with live checking on,
    `useKeepCheckerWarm` GETs `/health` (no sign-in, no model) on opening, every 10 minutes, and on coming back once
    10 minutes have passed. It skips this while a take is connecting, listening or checking, since its connection holds
    the instance.
  - **Takes are not recordings** (Majd picked option A, Nov 16 2026: "separate normal recordings from those recorded
    with mistake detection because it's clobbering the journals"; RMEM-6; mocks
    `~/Documents/revisely-today-mocks/takes-vs-recordings/`): a take never makes a recording, a sitting or revised pages.
    - A Mark mistakes take keeps its audio with the take (`take: true` on its `lib/recordings` entry, `localOnly`);
      Recite alone keeps nothing (`keepsAudio`). `listRecordings()` leaves take audio out ('takes' or 'all' to ask),
      so a day's Read, All activity, the calendar's mic count, Settings and Revo's day never see it; Settings' Delete all
      keeps it (`keepTakes`).
    - No note after a take: the summary's ⋯ has "Delete this take" (`useRememberTake.forget`, `apart.deleteTake`) and
      "In today's Recited ›" opens the day at its takes. A day's Recited is one row that opens `RecitedSheet`.
    - Takes saved before were plain recordings: `sortTakeAudio` (`lib/reciteMemory/apart`) marks those a take record
      names, once a launch, index only. Recite alone's old audio stays a recording.
  - **Calm, exact tracking** (Majd's Dev take, Nov 15 2026; Tarteel's mic take as the reference): a flat grey band
    behind the whole ayah being recited, every line of it (`ayahBand`, the page's one highlight `highlight` in theme/v2,
    below in "The design"; Majd, Nov 22 2026: "we should follow how tarteel does it here"), and on it a firmer grey
    rectangle on the word being recited (`highlightFirm`, the cursor's `cursorBox`, never ahead of the checker's place;
    Majd, Nov 22 2026, of Tarteel's: "a boxed rectangle kinda that moves side to side"; RECITE-19, `followCues` in
    lib/reciteLive/wash). A mark's wash shows over it. (Nov 21 2026 had dropped the word on a shown page, read from the
    Tarteel analysis, which missed Tarteel's box.) Before that, Nov 15, a blue band over the whole ayah read as running ahead (the
    checker's `at` was 1.0 s behind, never ahead), and the band was the line's only until Nov 22. Green (`followInk`) is
    Recite's one following colour: the word being said in the bar, and the newest word shown on a hidden page (below).
    None of Recite's colours follow the accent (design.test). Nothing shows before the checker has found where the
    reciter is (`locked`): no band, in either view. The hidden view has no band at all (Majd, Nov 15 2026: "there
    shouldn't be an always there highlight at the top when the verses are hidden").
  - **The hidden page is drawn empty** (RECITE-20, `components/reciteLive/HiddenInkLayer`; Majd, Nov 22 2026, of
    Tarteel's: "i dont see the words being a different color as its recited with page hidden", "let's do it and test
    it"): covers over the words still hidden with a faint rule on each, leaving the markers and every run of words shown
    open in the page's own ink (ready at once: #877 first drew them again as ~30 copies of the page image, which filled
    in one by one), and the newest word drawn again tinted green (the one copy; the page image from MushafPager's
    `pageOverlay`). A shown word's wash is behind the ink (`ShownWashes`), a hidden word's on its cover with no take
    running. A word with a mark keeps its wash and the page's ink instead. When a take stops, what it recited stays shown
    (`keepRecited`).
    - During a take nothing is drawn on a word still hidden: not the word being said, not its marks or past mistakes
      (Majd's Dev take, Nov 22 2026: they gave words away). With no take running, a hidden word's marks show on its place.
    - Switched to hidden mid-take it keeps everything behind the reciter (the page before the start too) and hides only
      what is ahead; after a take, everything (RECITE-21, `lib/reciteLive/hideSwitch`; Majd, Nov 22 2026: "do the same").
  - **Mistakes are highlights** (Majd, Nov 15 2026: "i don't like the red + circles, only things we should show are
    highlites for mistakes 3 colors max"; board `~/Documents/revisely-recite-mocks/marks-highlights/`): a highlight
    behind the word, the page's ink unchanged, drawn as a soft pastel wash, never a box (Majd, Nov 21 2026, after
    Tarteel's "blurb or splash": RECITE-19; `components/reciteLive/Wash`, `lib/reciteLive/wash`: a pill-shaped core
    whose edge fades out all round in its own colour, a `boxShadow`, reaching a little past the word so a box a few
    units off never shows an edge; pastel colours, checked in design.test), in three colours (`markGroup`, theme/v2 `markWord`…): red for a wrong,
    skipped or extra word (an extra word on the next word, the one the reciter was reaching for: "Hesitated here"; Majd,
    Nov 25 2026: "extra word marks ... should be put on the next word not on the word before the stumble because the
    word before the stumble was said right"; `lib/reciteLive/markPlace`, after the end it stays on the word before it,
    "Extra word after the end"), amber for a wrong haraka or letter and
    "Not clear", violet for a tajweed note (Strict). A word with several shows its strongest; the mark a card is open
    for is a firmer shade of its own (`…Firm`), no outline. No red ink, dotted lines or + discs. The bar, the card and
    the summary use the same highlights, and a small flat swatch beside the kind's name (never a round mark): the kind
    is always in words. "The page's ink unchanged" is about mistakes (Majd's Nov 15 board); the hidden page's newest word
    in the following ink (RECITE-20) is the one place the ink takes a colour, and it never carries a mark.
  - **The next word's cover turns red while something else is said** (contract draft 7's `off`; Majd's yes, Nov 15 2026):
    - What shows: in the hidden view only, red over the word's cover (the word-mistake highlight), its text still
      hidden. It's never a mark and never counted.
    - When it goes: once the word is said (`at` or `said` reach it), the reciter goes back, or a mark lands on it (a
      hesitation there included: the checker's extra word just before it; `off` in `lib/reciteLive/state`).
    - What the lab measured: right 86% of the times it fires, and never on hesitations or pauses.
    - VoiceOver hears nothing: the mic is on throughout a take.
  - **"Not a mistake" can be undone** (Majd, Nov 15 2026; Tarteel's Removed list): for 5 s an Undo in the take's bar, in the words' place (RECITE-25: never a note over the page),
    and after the take the summary's "1 marked not a mistake" (closed until tapped) lists each with Put back
    (`restoreMark`: the mark and what it counted come back). The checker is told both ways, so the lab never keeps a
    wrong label: on the connection while live (`dismiss`, `undismiss`), and after the final answer over HTTP (`POST
    /dismiss`, `/undismiss` with `when`, the tap's time, by which the lab orders a mark's labels; `sendLabel` in
    `lib/reciteCheck/service`, kept takes only; live on the checker since rev 00047). Before, a Not a mistake tapped
    after Stop never reached the checker: the connection drops every frame once it has the final answer. With VoiceOver
    or TalkBack the Undo stays 15 s, and Not a mistake and Put back are said (`components/reciteLive/a11y`; never while
    the microphone is on). The bar's words are read with their marks ("…, wrong word"): colour is never the only signal.
  - **Your recitation** on the mark card: the reciter's own voice, from the take's audio that the connection holds on
    the phone for resuming (`audioClip`). It plays the phrase the mistake is in (Majd, Nov 21 2026: "smart" playback;
    RECITE-18, `lib/reciteLive/phrase`): between the pause marks either side of it (any but ۙ), within its ayah, or the
    whole ayah when it's short (12 words or fewer, or 8 s or less), at most 15 s (else 4 words before and 3 after). Its
    times are when the cursor first reached each word. A skipped word plays from the word before it; a mark the cursor
    reached nothing near falls back to its `t` (0.6 s before to 0.4 s after). The pause marks are
    `src/data/quranWaqf.json` (`scripts/build-quran-waqf.py`, from Tanzil's Uthmani text, by the app's word numbers).
    It works until the take is closed, and has no button when the moment isn't known (E2E's recorded take has no audio).
    The clip is a WAV in the caches folder (`lib/reciteLive/clipFile`), on this phone only. A past take's ▶ (Recite's
    memory, `clipOfTake`) still plays a moment around one time: its record keeps no time for every word.
  - **Where a slip went** (`into`, contract draft 6; Majd said yes, Nov 15 2026; live on the checker since #617/#618):
    the final answer can name, on the first skipped or wrong word of a run, the similar ayah the reciter went on with,
    or (`ending`) the ayah whose ending they used. The summary gives each a row under its head ("You continued with
    Luqman 31:6, a similar ayah", "(and 2 others)" when `also` has more; "You ended ayah 5 as ayah 3 ends"), and a tap
    opens that ayah in the reader, highlighted until the page is turned. `parseInto` drops a malformed one, never its
    mark. A mark taken off takes its row with it (Put back restores it). It never counts in the score.
  - **Stop leaves a trace** (`lib/reciteLive/stopTrace`, Nov 15 2026, after a freeze on Stop that told us nothing): Stop
    writes a marker on the phone, each step to the summary adds to it (mic off, the final answer, the summary asked
    for), and a heartbeat keeps the longest JavaScript stall. The summary on screen, a failure, ✕ or leaving the reader
    removes it. One left at the next launch goes to Sentry once (environment `dev`, "Recite: a take's Stop never
    reached the summary", tag `recite_stop_last`). It holds no audio or words, only event types.
  - **A recitation past 15 minutes is a chain of takes** (RECITE-22, Nov 22 2026; the release owner's plan): the checker
    ends a take at 900 s of its audio (`done.why: "too_long"`), and a 20-page session runs 30–45 minutes.
    - `lib/reciteLive/chain` (pure): from 14:00 of a take, at a pause (`said` ≥ the cursor) after an ayah's or a phrase's
      last word, the take ends and the next starts, looking from the ayah the reciter continues in to the end of its page
      (`nextTakeFrom`: from the page's top, the checker's replay locked 2:61 on 2:58); any pause from 14:45, at once
      from 14:55; a `too_long` done chains too, the next take getting what was sent past 900 s first. At 13:30 `warmUpReciteCheck()`
      wakes a second recite-check instance (one take an instance) so the next take doesn't wait for a cold one.
    - `useLiveRecitation` keeps the current take in `curRef` and the takes rolled over in `priorRef`; the screens see
      `chainView` of both, which is the take itself when it never rolls over. The microphone never stops, every sample
      goes to one take, and an earlier take's audio goes with its connection once its answer is in.
    - One record in Recite's memory, with `links` (each take's checker id and first word; `takeOfWord` for labels).
      Your recitation on an earlier take's mark reads the take's recording file back (`TakeRecording.clip`) while it
      lasts, and after Stop the file as saved in the day's recordings (`takeFile`, lib/reciteMemory/takeAudio, as a
      past take's word does). With Save recordings off no file holds the earlier takes' audio.
    - E2E: `revisely://e2e/recite-live?on=1&long=45&speed=5` (flow 21, 45 minutes in 9): the stand-in enforces the cap,
      starts each take where the last ended, and beats every 2 s of audio (5 times as often by the clock).
  - **A take starts anywhere on the page** (Majd, Nov 14 2026; protocol 6). The start frame sends `startBy` (the page's
    last ayah), and the checker says where the reciter started (`locked`; recite-contract.md in the shared notes).
    - Until then the bar says Listening…, with no cursor and no score. **It must always find where he is** (Majd, Nov 20
      2026: "it should always find where i am there's no exception"), so there is no "can't find you" message: finding
      the place every time is the bar, measured by the lock benchmark (recite-server's `long/lockcases` in the shared
      notes' `long-takes.md`: 3,600 public takes from every kind of start, surah openings with and without the
      isti'adha and basmala, pauses, false starts, fast, quiet, off the page, and his kept takes). A take with no
      recitation in it still ends with nothing (`nolock` isn't read), and Stop just ends it, with no summary. With
      VoiceOver or TalkBack on, once Stop has turned the microphone off, one line is said then ("Couldn't follow that
      take. Try starting at the top of the page."; Majd, Nov 15 2026); nothing on screen changes for anyone.
    - What it passes over (live.py, Nov 20 2026, #786 and after): speech before the start fitted as stray words (the
      isti'adha and the basmala before 2:1 never locked); the basmala in the Qur'an-wide search (with الحمد لله after
      it, it is Al-Fatiha word for word); a short first word that reads like the page's first word. A surah's opening on
      the page locks as soon as its first word is heard (الٓمٓ after the basmala: 10 s → 2.7 s). A refrain the page
      repeats waits for the next ayah.
    - A page turned by hand searches that page again (`seek` with `startBy`).
    - **Anywhere in the Qur'an** (Majd, Nov 15 2026, step 2; protocol 7, shape A in recite-contract.md): a take from
      the mic also sends `startIn: "quran"`. When the page doesn't match, the checker looks in the whole Qur'an and locks
      only on a place it is sure is the one (`locked.where: "quran"`); the reader turns there (the cursor's page turn),
      VoiceOver hears "Started at …", and a Sentry breadcrumb notes it (numbers only; the checker keeps where every kept
      take locked). Spot tests and a voice search's ayahs never send it. Older checkers ignore it. It fits up
      to 35 s of speech while it searches (50 s at most), and a long run (8 words, one heard wrong) locks too: 2:255 and
      3:2 share their first seven words.
    - Nothing before the start is skipped, and the summary counts from the start.
    - A checker below protocol 6 (`ready.protocol`) doesn't search: the take starts at the page's first ayah, as
      before. So does a cursor that comes with no `locked` (`lib/reciteLive/state`).
  - **The hidden view leaves every verse marker whole** (Majd, Nov 15 2026: page 2's ۱ ۲ ۳ were cut, only ۴ whole). Its
    covers stop at each marker's opening in `src/data/pageLines.json`. Those came from glyph data about 7 units right
    of the page images' markers, so 6,210 of 6,235 were clipped (page 236's held part of its ring). The openings are now
    fitted to the images by `scripts/check-page-markers.py` (`--write`): it finds each marker's ornament by template
    (some pages and lines draw it smaller, page 3 wider; a sajdah sign stays with its marker) and checks that no marker
    ink is under a cover and no word's ink shows beside a marker, on the originals and Android's w1080 and w1440. Run it
    after any change to the page lines or the images; `hiddenPage.test` pins measured markers (page 2's among them).
  - **A marker is open in its own rows only** (Nov 22 2026: the end of a sajdah's overline showed above page 379's ۲٤
    on a hidden page, flow 18). `src/data/markerRows.json` holds each marker's rows (its ink with up to 1.5 units of
    room), written by the same script's `--write`. Over and under a marker, in its columns, `HiddenInkLayer` covers by
    halves: the right half while the word before the marker is hidden (the page reads right to left), the left half
    while the word after is, so a shown word's stroke over a marker (a kaf's top) still shows.
    - The script fails if a word's ink over or under a marker passes the marker's middle. None does: 53 markers have
      ink there, 12 of them another line's tip (a descender from above), covered with this line's words.
    - Ink beside the ring in its own rows (326 markers, up to 16.5 units) shows in any opening, as before.
  - **Every word's box is its ink too** (Majd, Nov 21 2026: the word just recited was "partially cut off").
    - `quranWords.dat`'s x0 and x1 (the hidden view, the cursor's box, the mistakes' highlights) came from glyph data
      2–12 units off the images; the next word's cover cut 84% of words, and on 450:14 one box held its neighbour's.
    - `scripts/check-word-boxes.py` (`--write`) fits each box to its word's ink, with half the gap to the next ink (at
      most 1.5 units), to a tenth, and widens a line's ends in `pageLines.json` to its words. It starts from the glyph
      boxes in git (`GLYPH_REF`), splits touching words at the junction (a waw's tail, a kaf's stroke: 480 places), and
      leaves the 199 quarter signs (۞, found by shape before the ayahs `quranWaqf.json` lists) and the sajdah overlines
      to no word. It checks the originals and Android's w1080 and w1440 (ownership from the originals, `--like`): no
      word cut beside a hidden one, no hidden word's ink in an opening. Run it after the page lines, the images or the
      word data change.
    - Word by word, a hidden word takes no extra edge (`WORD_EDGE` in `hiddenPage.ts`).
    - The limit: about 12% of words share columns with the next without touching (a kaf's top stroke over the previous
      word); the edge leaves that stroke's tip (up to about 20 units) over the word recited rather than cut it.
  - **A voice search with one result opens the reader at the ayah, nothing listening** (SEARCH-4; Majd, Nov 17 2026:
    "it takes me to the mushaf with the verse highlighted without it still recording then clicking back shows me that
    one search result"). It replaced Nov 15's "opens the reader reciting".
    - When a search by voice finds exactly one place (the list would say "1 result", not "Closest matches"), the search
      screen opens the reader there, the ayah highlighted as Open in the reader does (`lib/search/voiceOpens`).
    - Listening ended with the search, and nothing starts by itself. Back returns to the search, its words and result
      still there.
    - Several results, or a typed search, stay a list, and nothing opens by itself.
    - Gated with Recite (`reciteLiveEnabled`), so it's Revisely Dev's until the release.
    - E2E: `revisely://e2e/voice-search?heard=…` (flow 18, An-Naml 25).
  - **The search screen** (Majd, Nov 16 2026: "the mic button being top right is annoying to have to reach up there
    just to end the check"; Tarteel's as inspiration, built in our own design; for everyone with search): the field
    and a 56pt mic sit in one bar at the bottom (`search-bar`), in reach of a thumb, and the keyboard pushes them up
    (`KeyboardAvoidingView` padding, Android too). Stopping is one tap on the same button. While listening: what is
    heard so far, large, and the voice's level (`LiveWaveform` fed by `useVoiceSearch().levels`). A verse found is a
    row of its own (`components/search/SearchVerseCard`): surah and ayah first (the page a quiet detail), the ayat
    large with the words found in full ink, the account's translation exactly as given (raised footnote markers, its
    footnotes and its credit with the version kept, as QuranEnc's and The Clear Quran's terms ask;
    `getVerseTranslation`, no Arabic fetched; fetched only once its card has been on screen, since each Clear Quran block
    spends the account's and everyone's daily budget), then Share, Copy (the ayat from the word data on the phone, so they
    work offline; "Copied") and Open in the reader.
  - **Test me** (Majd, Nov 15 2026: approved, "random within all memorized pages, with an optional juz pick";
    `lib/reciteLive/testMe`, `components/reciteLive/TestMeSheets`). The mic's menu has Test me under Recite (Premium,
    locked like Mark mistakes; "Mark what you've memorized first" with nothing memorized). It asks where from:
    everything memorized, or one juz of it (only the juz with somewhere to start). Five places at random, none sharing
    an ayah, each starting in a memorized ayah of at least four words.
    - At each place the page turns there and is hidden but for the ayah's first two words. A Mark mistakes take covers
      that ayah and the next two (those memorized, in the same surah) and stops by itself at the end. The checker looks
      for the start only in the first ayah (`startBy`), so starting the ayah again or carrying on both work.
    - While listening the bar says which place it is ("1 of 5"); then how it went in the words' place ("Clean", "1 wrong
      word", "Stopped before the end", "Not continued" when the start was never found), with Next and ✕ and no score
      pill (an SE at the largest text had no room). ✕ ends the test early.
    - After the last place (or ✕): the summary, "4 of 5 continued cleanly" and each place with how it went (a tap shows
      it on the page), Test me again (the same juz) and Done. The page goes back to shown or hidden as before.
    - Each place's take keeps its audio with the take, as any Mark mistakes take does (never as a recording, RMEM-6).
    - E2E: flow 18 marks page 379 memorized (`scripts/server-memorized.js`) and tests Juz 19; a place gets a take of
      its own that says every word (`placeTake` in `lib/e2e/reciteLive`).
  - **An immersive page** (Majd, Nov 15 2026; Tarteel's): during a take a tap on the page puts the header and the bar
    away too, leaving the page, the juz and surah above it, and the take's time beside the page number
    (`TakeActivity`, red dot while recording; a tap on it brings the controls back). The status bar stays
    (`keepStatusBar` on `ReaderFrame`). A tap brings them back, and so do a mark's card and the take's end. With
    VoiceOver or TalkBack the bar never goes, so Stop is always there. Outside a take the page's tap is as before.
  - **Peeked words** (Majd, Nov 15 2026; `lib/reciteLive/peeked`): words shown by hand during a take (‹, ‹‹; with ‹‹
    only the words of the ayah not yet shown) stay in quiet grey ink on the page while the take lasts, shown or
    hidden, recited or not: a veil of the page's colour over their ink (`peekVeil` in `theme/readPalette`), never over
    a word with a mistake (its highlight shows as it is). Grey, not amber: amber is a slip. The summary says "3 words
    peeked" and lists each ayah's peeked words in a row (a tap shows it on the page). Peeks never count in the score
    (the checker counts them as `helped`). The verse Test me shows to start from isn't a peek.

## Native code for Revisely Dev only: `modules-dev/` (Recite on the phone, Nov 23 2026)

Majd, Nov 23 2026: "our main priority right now is to get the model on phone to avoid all unnecessary costs". The
work's notes and owners are in the shared notes (`on-device-recite.md`, the lead's `on-device-plan.md`, the release
owner's `on-device-release.md`).
- **Where the code goes.** Native modules for Revisely Dev alone live in `modules-dev/`, never `modules/`: everything
  in `modules/` is linked into the store app and moves its fingerprints, which makes Preview build and submit store
  binaries by itself. `plugins/withDevModules` (loaded only with APP_VARIANT=dev) adds the folder to autolinking's
  search path in Dev's Podfile (`use_expo_modules!(searchPaths: …)`) and settings.gradle
  (`expoAutolinking.searchPaths`), and `fingerprint.config.js` counts `modules-dev/` toward Dev's fingerprints only.
  JavaScript loads the module lazily (`requireOptionalNativeModule`, behind `isDevVariant()`): null in the store app,
  older Dev builds and tests. Before merging a native change, compute both store fingerprints the CI way: they must not
  move (Nov 23: iOS `d3acdfa5…`, Android `dd5fd2ad…`). The release-native PR (the release owner's) links the module
  into the store app and moves them once.
- **`modules-dev/recite-engine`** (the native module `ReciteEngine`): ONNX Runtime 1.31.1, the checker's version.
  - iOS: `ReviselyOnnxRuntime.podspec.json` takes the xcframework from Microsoft's signed NuGet package
    (`Microsoft.ML.OnnxRuntime` on nuget.org, pinned by SHA-256). ONNX Runtime's own pod (`onnxruntime-c`) downloads
    from download.onnxruntime.ai, which served a certificate for another name on Nov 23 2026, and its CocoaPods
    releases stop at 1.30.0; its GitHub repositories answer 404 since about Nov 17. The iOS build has the CPU, Core ML
    and XNNPACK providers.
  - Android: `com.microsoft.onnxruntime:onnxruntime-android:1.31.1` from Maven Central (CPU, XNNPACK, NNAPI).
  - The bench's core is plain C++ (`ios/RECBenchCore.cpp`) and plain Java (`android/…/Bench.java`, `LogMel.java`),
    so both run on a Mac against ONNX Runtime's desktop builds of the same version (the NuGet package's osx-arm64
    library; the `onnxruntime` jar on Maven Central) before a runner build. Their features follow workstream M's spec
    (`~/revisely-mistake-lab/runs/mobile/SPEC.md`) and match its vectors (Nov 23, Mac: features within 1.3e-6, the
    model's output identical, every top sound the same).
- **The private engine (`recite-core`)** (Majd, Nov 23 2026: "Keep the checker code in your private repo and pull it
  into the app at build time—do not commit it directly to a public repository"). Only compiled libraries and the C
  header cross; the source stays in `revisely-internal` (`recite-core/`).
  - **A release:** a tag `recite-core-v<x.y.z>` on `recite-core/main` runs that repository's
    `recite-core-release.yml`: the gate, the iOS xcframework (arm64, simulator arm64 + x86_64), Android static libraries
    (arm64-v8a, armeabi-v7a, x86_64), each one prelinked object where only `rc_*` is global, zipped onto a private
    release. iOS spends that repository's small free macOS allowance, so tag versions the app needs, not every merge.
    The gate refuses anything but the replay stand-in until the golden takes' parity check is wired in.
  - **Moving the app to it:** `node modules-dev/recite-engine/core/bump.js <x.y.z>` (the laptop's `gh`) checks the zip
    against the sha256 its CI published, copies it to `achilles1801/revisely-engine-releases`, a private repository of
    compiled zips and nothing else, reads the copy back, and writes `core/recite-core.lock` (repository, version, asset,
    sha256, ABI) and `core/include/recite_core.h`. The lock is the engine's only trace in git and what Dev's fingerprint
    hashes, so a new version is one Dev native build.
  - **The fetch:** `core/fetch.js` downloads the locked zip and fails the build if the sha256, version, ABI or header
    doesn't match. **With no token it leaves a stub**, which says "not available", and the app uses the server path:
    CI, E2E, forks and claude-fix. A token that is there but refused fails the build, so a release can't quietly ship
    the stub. The files land in `ios/core-bin/` or `android/build/recite-core/` (gitignored and out of the fingerprint:
    Dev's hash is the same with them there or not). On a laptop it uses the `gh` sign-in. Settings → Testing →
    On-device model shows which engine the build carries.
  - **The token:** the repository secret `RECITE_CORE_TOKEN`, a fine-grained token with read-only Contents on
    `revisely-engine-releases` alone, so a leak can't reach the source in `revisely-internal`. One step holds it: "Fetch
    the on-device engine" in `ios-build.yml` and `android-build.yml`, for Dev, before `npm ci`, running only `fetch.js`
    (no dependencies). `eas build` then gets the folder (`RECITE_CORE_PREFETCHED`) and no token, so no install script
    runs beside it. It is sent to the GitHub API alone, never to the storage host a download redirects to.
    `core/__tests__/tokenScope.test.js` fails on anything else, and claude-fix refuses patches to the fetch. To rotate
    it: GitHub → Settings → Developer settings → Fine-grained tokens → Regenerate; update the secret; set the repository
    variable `RECITE_CORE_EXPIRES` (YYYY-MM-DD) to the new date, which the daily health report reminds about from 30 days
    before.
- **The engine's self-check per device** (ONDEV-1): the bench records it as a `runs` entry `{mode: 'selfCheck', …}` in
  `onDeviceBench`, once per pack and app update (`recordSelfCheck`). Test Lab: `testLab.selfCheck` in the OBB's `bench.json`
  (`packId`, `blobs: [{name, file, room}]`) opens plain watermarked blobs, and the results file gets a `selfCheck` key.
  With the real engine the bench and Test Lab then run a take of the 90 s clip at the live pace (`engineTest.ts`), from that
  golden's own start frame (78:1–30): a `{mode: 'engineTest'}` run with late hops, the slowest hop, memory, the final marks and
  score, and each live mark with its sample position, so the same samples can be compared mark for mark with the Python.
  `bench.json`'s `takes` lists more clips, each with its golden's start frame; after them the speed check runs on the open
  engine and its p95 and hop go in the record (`{mode: 'speedCheck'}`; Test Lab: `engineTests` and `speedCheck`).
- **The on-device bench** (Settings → Testing → On-device model, BEHAVIOUR.md ONDEV-1): its list of runs, the models,
  the clip (EveryAyah, Husary, An-Naba from 78:1, 90 s: the start of the lab's `golden/bench-v0-on/husary.p7.clean.clean`, where "p7" is the item's name, not a mushaf page) and M's vectors live on the dev bucket under `models/recite/`
  (`bench.json` is the manifest: files with sizes and SHA-256, runs per platform, M's pass marks). Changing the runs or
  adding a model is an upload, not a build: put the file there with the dev admin key and add it to `bench.json`.
  The first run in a platform's list is the long run's (5 or 20 minutes at the live cadence, battery and heat each
  minute: research's protocol); a run with `fromMemory` opens its model from bytes, as the real path will after
  decrypting it (the bench's files themselves are plain: Dev only, signed in; the real path's pack is encrypted).
  Only watermarked models go there (the lead, Nov 23: never v7 in the clear; M's `v7m-*` files). Storage rules let
  only accounts with the `onDeviceBench` custom claim read `models/recite/` (Revisely Dev is open to anyone with its
  link, so signing in isn't enough): `GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json node
  scripts/set-bench-access.js <email> [--off] | --list` from `functions/`; the screen refreshes the token before it
  reads, so a new claim counts at once. Only the admin SDK writes the folder. Each finished bench sends
  one record to Firestore `onDeviceBench` (create only: the phone, the build, each run's numbers; no uid, no audio);
  read them with the dev admin key.
- **Recite's pack on the phone** (Settings → Downloads and storage, BEHAVIOUR.md ONDEV-2, ONDEV-3; design in the shared
  notes, `on-device-a3-pack.md`):
  - **Server:** `functions/src/recitePack/` (the gated callable, the `.rcpk` format).
  - **A new pack** (after any file in `golden/pack-v4` or `pack-strict`, or a model, changes; a pack folder is never remade in place, and `manifest.json` travels in the core part): from `functions/`, after
    `npm ci && npm run build`, `GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json node
    scripts/recite-pack-make.js --lab` (`--dry` first; `--hold` uploads it without offering it to phones, and `--make-current <id>` offers it later). It refuses a table that isn't its manifest's and a model without its
    ownership mark, and the id comes from the files' hashes, so a changed file is a new version and nothing is ever
    overwritten. Phones move to it at their next daily check; the app only fetches the version the callable names.
  - **Parts:** `core` (48.9 MB: `v7.graph.onnx`, `v7.weights.f16`, `v7.weights.json`, `v7.check`, the engine's load-time self-check, and the tables) and `strict` (from pack-v4, 42.8 MB:
    `v5.graph.onnx`, `v5.weights.f16` and `v5.weights.json`, the marked full-precision v5, with `v5.check` and `strict.bin`). Only marked models leave the Mac (hashes in the private
    repo's `checker/marks.json`). The names are `rc_blob`'s (`recite_core.h`). Tables are deflated; the weights stay stored.
  - **Phone:** `RecitePackReader` (Swift, Java) checks every chunk and blob; `RecitePackKey` holds the device key;
    `src/lib/onDevice/packRun.ts` is the download. `warmEngine()` (`lib/onDevice/engine.ts`) opens it through the module's `enginePackOpen`, on the engine's thread; RC_ERR_DATA drops the pack (`dropBadPack`). `v7.weights.f16` gets
    a 64-byte aligned buffer of its `room` (fp32 size), and `rc_blob.size` is `room`.
  - **Check the readers** against the server's format, on a Mac with no simulator: `scripts/recite-pack-check/run.sh`.
  - Android keeps it out of backups through `plugins/withDevModules` (Dev only), so the store fingerprints don't move.
- **Firebase Test Lab** (Majd, Nov 23: "yes let's use google test lab") times mid-range Android phones with no account:
  Revisely Dev's Android build has Test Lab's game-loop intent filter (`plugins/withDevModules`), and
  `src/lib/onDevice/testLoop` runs the bench from an OBB (a zip of the bench's files plus a `bench.json` with a
  `testLab` section: runs, windows, a long run) and writes the record to the game loop's results file. Run it with
  `gcloud firebase test android run --project revisely-dev --type game-loop --app <Dev .aab> --obb-files
  main.<versionCode>.com.revisionbuddy.app.dev.obb --device model=a15,version=34 --timeout 20m`; the results are
  `results_scenario_0.json` in the run's results bucket. Blaze gives 30 physical-device minutes a day free, then $5
  an hour per phone (by the minute): keep runs short and say the price before going over.
