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
- **Pages:** `/sign-in` (its own page: Google, or email and password; no sign-up; an account without a role sees "No
  access" with Sign out, and nothing else), `/` Overview (the metrics, with Retention), `/open-door` and `/open-door/<uid>`, `/audit`.
  Signed out, every address goes to `/sign-in?next=…` (`shell.js`). Hosting's `cleanUrls` and rewrites serve them.
- **Roles** (`functions/src/console/roles.ts`, the one permission list): `owner` (everything, roles too), `admin`
  (everything but roles), `reviewer` (Open Door read and decide; no revoke, metrics, Revo conversations or audit),
  `dev` (metrics only). A custom claim `role`, given with `cd functions && GOOGLE_APPLICATION_CREDENTIALS=… node
  scripts/set-role.js <email|uid> <role|none>` (`--list`, `--show`, `--roles`; refuses to remove the last owner), each
  change recorded in `consoleAudit` (closed). Who has a role is never in the repository. The old `admin: true` claim
  counts as owner until set-role replaces it (`set-admin.js` now only takes it away). The callables read claims live
  from Auth (`staffClaims` in index.ts), so a role taken away stops at the next call. Rules open nothing to any role.
- **Functions:** `adminMetrics` (metrics.read), `adminRevo` (revo.conversations; conversations locked until
  `config/admin.conversations`), `adminConsole` (`me`, Open Door `od.*`, `audit.*`; App Check on every action but
  `me`; Open Door only where `SUPPORT_PAGES` has the project), `metricsTotals` (the hourly `metrics.yml` with its
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
- **Testing locally:** the console runs against the emulators from any static server that serves `admin/` with the
  rewrites and an `init.json` carrying `emulators` (`{auth, functionsHost, functionsPort}`; only a localhost page
  reads it). `functions/src/__tests__/review.emulator.test.ts` runs in CI against the Auth and Firestore emulators.
- Everything else about the metrics: `scripts/metrics/README.md`.
