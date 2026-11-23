# Stats digest and the metrics console

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## Stats (weekly digest)

- The weekly App Store digest runs in the **private** repository `achilles1801/revisely-internal`
  (`stats/weekly.js`, `stats-digest.yml`, Mondays 15:00 UTC) and comments on that repository's "App stats (weekly
  digest)" issue. It moved there on Nov 21 2026 (Majd kept this repository public and moved what competitors
  shouldn't read). Its README and that workflow say how it works.
  - It needs the four secrets below in revisely-internal too; until they exist it skips with a notice.
  - Its Ask coach line comes from `coachDigestDays` (`functions/src/coachDigest.ts`), which still accepts only this
    repository's old `stats-digest.yml`, so the line is missing until that function accepts revisely-internal and
    is deployed.
- `scripts/stats/appStore.js` (Sales and Trends) and `digest.js` (tallies) stay here: the Metrics console's hourly
  totals (`scripts/metrics/totals.js`) use them.
- Data: App Store Connect Sales and Trends, daily `SALES`/`SUMMARY` reports, plus a finished month's
  `MONTHLY` once Apple publishes it. Product types `1*` are first downloads, `3*` re-downloads and
  `7*` updates. It reads only this app's Apple ID, `6767990248`. Read-only.
- Secrets (repository secrets, here for Metrics and in revisely-internal for the digest):
  - `ASC_REPORTS_KEY_ID`, `ASC_REPORTS_ISSUER_ID` and `ASC_REPORTS_KEY` (the `.p8` file's text): a
    team API key with the **Sales** role only. The App Manager key used by `scripts/asc.js` stays
    off GitHub, and an API key's role can't be changed after it's made.
  - `ASC_VENDOR_NUMBER`: App Store Connect → Payments and Financial Reports.
- Google Play (once the app is live there): Play Console exports installs, uninstalls and active
  devices as monthly CSVs to its Cloud Storage bucket (Download reports → Statistics → copy the
  `gs://pubsite_prod_…` URI). Invite a Google Cloud service account in Play Console → Users and
  permissions with "View app information and download bulk reports". Then fill in `play()` in
  revisely-internal's `stats/weekly.js` to read
  `stats/installs/installs_com.revisionbuddy.app_YYYYMM_overview.csv`, with secrets `PLAY_REPORTS_BUCKET` and
  `PLAY_REPORTS_SA_KEY`.

## Revisely Console (staff only: metrics, Open Door, audit log)

`admin/` on Firebase Hosting (Majd, Nov 14 2026: "a revisely dev dashboard like a real company"). **The one console
is https://revisely-dev.web.app** (revisely-dev's Hosting, deployed by hand: `firebase deploy --only hosting --project
revisely-dev`; nothing deploys Hosting by itself). It shows production and dev (below). https://metrics.revisely.app
(and revision-buddy-3a398.web.app) only redirects there since Nov 14 2026 (`scripts/metrics/metrics-redirect/`, its
README has the deploy and the undo); never deploy the root `firebase.json`'s hosting to production.
- **Pages:** `/sign-in` (its own page, phone-first: Google, an email link for people without Google, or email and
  password; an account with no role and no invite sees "Waiting for access" with its email and nothing else), `/` Overview (the metrics, with Retention), `/open-door` and `/open-door/<uid>`, `/audit`,
  `/staff` (owners only: give a role by exact email, change or take one; no changing your own, never the App Review
  account, never the last owner; each change in the audit log), `/label` (below). Signed out, every address goes to
  `/sign-in?next=…` (`shell.js`). Hosting's `cleanUrls` and rewrites serve them.
- **Roles** (`functions/src/console/roles.ts`, the one permission list): `owner` (everything, roles too), `admin`
  (everything but roles), `reviewer` (Open Door read and decide; no revoke, metrics, Revo conversations or audit),
  `dev` (metrics only), `labeller` (the labelling page only; any number of accounts). A custom claim `role`, given on the Staff page or with `cd functions && GOOGLE_APPLICATION_CREDENTIALS=… node
  scripts/set-role.js <email|uid> <role|none>` (`--list`, `--show`, `--roles`; refuses to remove the last owner), each
  change recorded in `consoleAudit` (closed). Who has a role is never in the repository. The old `admin: true` claim
  counts as owner until set-role replaces it (`set-admin.js` now only takes it away). The callables read claims live
  from Auth (`staffClaims` in index.ts), so a role taken away stops at the next call. Rules open nothing to any role.
- **Functions:** `adminMetrics` (metrics.read), `adminRevo` (revo.conversations; conversations locked until
  `config/admin.conversations`), `adminConsole` (`me`, Open Door `od.*`, `audit.*`, `staff.*`, `labels.*`; App Check
  on every action but `me`; Open Door only where `SUPPORT_PAGES` has the project), `metricsTotals` (the hourly `metrics.yml` with its
  GitHub OIDC token; alarms on the "Metrics alerts" issue).
- **Production and Dev in one console** (Majd, Nov 14 2026: one console with a switch; metrics.revisely.app to be
  retired, "why would we need two separate dashboards"): the console's project asks the other project's
  `consoleMetrics` (an HTTPS endpoint), proving who it is with a Google-signed ID token for its own service account from
  the metadata server (no key). `functions/src/console/peer.ts` says who may read whom: production answers
  revisely-dev's server only (`METRICS_READERS`).
  - `metrics`: the Overview's numbers.
  - `revo` (an account's conversations): also needs the staff member's own revisely-dev ID token (forwarded by
    `adminRevo`), whose role must allow `revo.conversations`; production still applies `config/admin.conversations`
    and logs each read as `revisely-dev/<uid>`.
  - Trade-off: revisely-dev's functions deploy automatically from develop, so code merged there runs where a staff
    member's ID token passes through while they use the console.
  - `consoleMetrics` is deployed by hand in production (Nov 14 2026, by Majd's word); the dev one answers nobody.
  - Dev's crash and App Store section stays empty: the hourly Metrics workflow sends those totals to production only.
- **App Check on the page:** reCAPTCHA Enterprise, a key per project in `APP_CHECK_KEYS` (`admin/firebase.js`; site
  keys are public). Production has none yet: add one before the console's Open Door or audit runs there.
- **Sign-in in Safari and built-in browsers** works only where the page is its own auth domain
  (`OWN_AUTH_DOMAIN_HOSTS` in `admin/firebase.js`: metrics.revisely.app, revisely-dev.web.app); a host joins only once
  its `/__/auth/handler` is a redirect URI of the project's Web OAuth client and an authorized domain. Phones sign in
  with a full-page redirect there.
- **Access requests, the main way in** (`functions/src/console/invites.ts`; Majd, Nov 16 2026: "i don't wanna manually
  type their email, once they attempt to sign in i should be able to see their 'attempt' in the console and then i can do
  actions on it"; the dev console only, `invites` in index.ts).
  - **The request:** anyone who signs in to the console with no role is an access request, `consoleRequests/{uid}`:
    name, email, Google photo, sign-in method, first and last attempt, attempts. They see "Waiting for access. Majd has
    been asked." and nothing else. That page asks again every 15 s while in front (`me` with `poll: true`, which isn't
    an attempt) and opens by itself once they have a role.
  - **The Staff page** lists pending requests first, newest first, with Give Labeller (one tap), another role (with a
    confirmation), Dismiss and Block. The Staff tab's badge counts them (`me.requests`, owners).
    - A dismissed request comes back on their next sign-in. A blocked one never does.
    - Every request seen, granted, dismissed or blocked is in the audit log's Role changes.
  - **By email, the fallback:** "Add someone by email instead" gives the role at once to an account that has signed
    in, or invites an email (`consoleInvites/{email}`). The first verified sign-in (Google or an email link, never a
    password sign-up's email) claims the invite through setRole (`via: 'invite'`). Invites can be cancelled, and are
    audited too.
  - **Sign-in methods:** the email link needs "Email link (passwordless sign-in)" on in Firebase Auth's Email/Password
    provider. It is on for revisely-dev (Nov 16 2026), and it makes the account the first time.
- **Label recitations** (`/label`, `admin/label.*`; adminConsole `labels.*`, `functions/src/console/labels.ts`; permission
  `recite.label`: owners, admins and **labellers**; revisely-dev only, `LABEL_PROJECTS`). Majd, Nov 15–16 2026: "if the
  issue is those recitations don't say what is right or wrong then i can help with that … i can even get my quran
  teacher to help with that". Its own page, made for a phone held in one hand, and linked from the console's tabs.
  - **The layout** (redesigned Nov 16 2026 after Majd's first try: "i dont see a way to go to next clip … not have to
    refresh if it gets stuck"): a progress line and "Clip 24 of 150"; a bar always at the bottom (‹ Previous, ▶,
    Next ›, which says "2 marks left" until it can go); swipes move clips too. One question at a time ("Is this a
    mistake?"). Speed and text size live in ⋯ Settings.
    - Nothing needs a reload. Every load has a 10 s watchdog that becomes Try again with the reason. Saves retry by
      themselves and show Saving… / Saved / Couldn't save · Retry. The clip's answers are kept as a draft, so a reload
      resumes them. Previous on a fresh visit uses `labels.recent`. The page's own failures go to the log
      (`labels.log`, event `labels.client`).
    - Majd's stuck session (Nov 16): `labels.stats` needed an index with the summed fields, (by.uid, at, answers, ms),
      and nothing on screen said how to move on.
  - **The flow:** one clip at a time, played as it opens, with the passage's words (Amiri Quran; Larger and Smaller text
    in ⋯, kept per device) and the checker's marks. Each mark gets Mistake, Not a mistake or Can't tell (All fine sets
    the rest to Not a mistake); tapping a word the checker missed labels it (wrong word, skipped, extra word after it,
    haraka, letter, not clear). Undo, −2 s, 0.75× (lower pitch: Web Audio), Unusable (bad audio, not this passage,
    another reason). An optional note (Majd, Nov 16 2026: "a text box for listener to put feedback for each word") on
    any word (Add a note, N) or on the clip (⋯ → Note on this clip): up to 300 characters, any language, saved with the
    label (`wordNotes`, `note`), in the audit entry and in the export; a word with one shows ✎. The header says how many clips have a label of all ("124 of 486"), how many wait for this labeller
    and today's count. The next clip is fetched and decoded while this one is labelled.
  - **The `labeller` role** opens this page only: every other console call refuses it, and the shell sends it to
    `/label`. Majd gives it on the Staff page (by exact email, after the person has signed in once, with Google, on the
    console's sign-in page) and takes it away there; each change goes to the audit log.
  - **Several labellers:** each label is `reciteLabelClips/{id}/labels/{uid}` (who, role, when, time spent, the answers,
    the clip as fine, mistakes or unusable, and every tap). A clip is labelled once by default, by whoever reaches it
    first; `recite-labels.js queue --batch <b> --to <email> [--share 0.2]` sends a share of a batch to someone as well
    (those come first on their page), so some clips get two labels to compare. The export has one line per label.
  - **Audit trail:** every save is a `consoleAudit` entry (kind `label`): who, the clip, the result, and each tap in order
    with what it was before (Audit log → Labels, `audit.read`; never a labeller).
  - **Audio** is Web Audio, with `navigator.audioSession.type = 'playback'` so the ringer switch doesn't mute it. The
    callable sends the clip's audio (AAC, about 6 KB a second) with the clip: nothing in Storage is opened to clients.
  - **Saving:** labels go in the background, one at a time, and wait on the phone (localStorage, per account) until the
    server has them.
  - **Data:** `reciteLabelClips/{id}` (+ `labels/{uid}`) and Storage `recite-labels/<batch>/`, closed to clients and to
    every role (the catch-alls; the rules suite checks them). Indexes (status, order), (queue, order), labels (by.uid, at).
  - **Adding clips and exporting labels:** `cd functions && GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json node
    scripts/recite-labels.js add|status|export|queue|remove` (its header has the clip format). The lab's format notes:
    `recite-labels.md` in the shared notes.
  - **What may be added:** only clips a person may listen to: a licensed set whose licence allows it (`licensed`),
    Majd's own recordings (`own`), recordings gathered with the reciter's permission (`permission`). Never the /record
    takes or anyone's Dev takes (`recite-tests/`, the lab's `dev-takes`, `record-raw`, `record-v1`): their consent says
    nobody listens. The script refuses a clip without one of those sources, and audio from those folders.
- **Opening fast** (Majd, Nov 16 2026: "it takes so long for it to initially load"): the Overview's numbers come from
  `adminMetrics` (2.3–10 s; for Production it asks production's `consoleMetrics`, cold or not). So the device keeps the
  role from the last visit (`rvc.me.<uid>`) and the last numbers per environment (`rvc.metrics.<uid>.<env>`). The
  console opens with them at once ("Updated … · N min ago"), while `me` and `adminMetrics` go out together. A role that
  changed reloads the page, and no role signs out. Every sign-out forgets them (`signOutNow` → `forgetDevice`). The
  server still checks every call.
- **Testing locally:** the console runs against the emulators from any static server that serves `admin/` with the
  rewrites and an `init.json` carrying `emulators` (`{auth, functionsHost, functionsPort}`; only a localhost page
  reads it). `functions/src/__tests__/review.emulator.test.ts` runs in CI against the Auth and Firestore emulators.
- Everything else about the metrics: `scripts/metrics/README.md`.
