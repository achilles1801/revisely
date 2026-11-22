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

## Metrics console (the owner's private page)

https://metrics.revisely.app (a Hosting custom domain; also https://revision-buddy-3a398.web.app) (Firebase
Hosting, `admin/`): Revo per account with its conversations,
spend against the caps, app health, downloads, retention (accounts active and coming back by sign-up week;
`functions/scripts/retention.js` prints the same, read-only) and functions, read live. Only an account with the custom claim
`admin: true` gets anything (`functions/scripts/set-admin.js <uid>`); the claim opens nothing else, since no
rule reads it. Functions `adminMetrics`, `adminRevo` (conversations locked until `config/admin.conversations`)
and `metricsTotals` (the hourly `metrics.yml` sends Sentry and App Store totals with its GitHub OIDC token, and
posts new alarms on the "Metrics alerts" issue). Sign-in in an app's built-in browser works only on
metrics.revisely.app: there the page is its own auth domain (`OWN_AUTH_DOMAIN_HOSTS` in `admin/console.js`); a
host joins that list only once its `/__/auth/handler` is a redirect URI of the Web OAuth client and it is an
authorized domain. Everything else: `scripts/metrics/README.md`.
