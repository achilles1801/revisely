# Revisely Metrics (the owner's private dashboard)

A private claude.ai page, "Revisely Metrics", that answers two questions on the owner's phone: how Revo
is used, by whom and at what cost, and whether the app is healthy. Built Nov 2026 (Majd's picks: layout
A with the phone status line, refreshed every 6 hours, a Refresh button, push alerts).

## How it updates

```
GitHub workflow "Metrics" ──► Sentry + App Store totals (artifact, totals only)
                                   │
Mac: launchd job (every minute) ──► collect.js ──► metrics.json in Drive ──► the dashboard reads it
       ▲   reads Firestore, Revo's logs and Cloud Monitoring                (Google Drive connector,
       │   with the read-only service account                               as the owner)
       └── the dashboard's Refresh button writes the time into Drive's "refresh" file
```

- **Every 6 hours**, `watch.js` (launchd, `app.revisely.metrics`) runs `collect.js`. That starts the
  Metrics workflow, waits for its totals (up to 4 minutes, else it uses the last good run), reads
  Firestore, Revo's log lines and Cloud Monitoring, works out the numbers (`metrics.js`) and overwrites
  `metrics.json` in the owner's Drive folder "Revisely metrics". A copy stays on the Mac in
  `~/.local/share/revisely-metrics/`.
- **Refresh button:** the page sets the "refresh" file's description to the time of the tap, through the
  owner's Google Drive connector (its only write). `watch.js` checks that file every minute. A newer time
  starts a run, so new numbers arrive about 2–4 minutes after the tap. The page polls every 30 s until
  they do. With the Mac asleep or off, the request waits, and the page says so after 10 minutes.
- **Each run recomputes the last 30 days** from the sources (logs keep 30 days, Sentry 90, Monitoring
  6 weeks, Firestore forever), so a missed run loses nothing.
- **Alerts:** when an alarm turns on (Revo failing, resting or capped, spend over half the day's
  allowance or 80% of the month's cap, a function over 1% errors, production crash-free under 99%),
  `watch.js` starts the workflow in alert mode. That posts on the GitHub issue "Metrics alerts",
  mentioning the owner, so GitHub emails it and the GitHub app pushes it. An alarm is posted once when it
  starts, not again while it lasts.
- **Stale data:** the page marks data older than 26 hours as an alarm.

## What's on it

- **Revo:** questions and Day in review over time, people who asked, cost (exact from the logs),
  failures by cause, resting and capped, cut-off replies, retries, answer time (p50/p95), prompt cache
  share and tokens, who uses it (Revo on, asked, came back), thumbs, actions taken, attachments by kind,
  spend this month against the cap and today against the daily allowance, and a table of accounts.
- **App:** active people by platform (store users or testers), crash-free by release, update adoption
  per platform, App Store downloads.
- **Backend:** each Cloud Function's calls, refusals (4xx), errors (5xx) and latency; Firestore reads,
  writes and rule refusals today.
- **Time ranges:** 1h (5-minute steps), 24h (hourly), 7d (6-hourly), 30d (daily). Sentry has no 5-minute
  steps, so the app charts need 24h or longer. Numbers are as of the last run, never live.

## Privacy

- Accounts show only as a keyed hash ("k7f2·a9"). The key and the hash → uid lookup stay on the Mac
  (`~/.config/revisely-metrics/config.json`, `~/.local/share/revisely-metrics/lookup.json`). To find
  an account: `node ~/.local/share/revisely-metrics/bin/collect.js --who k7f2a9`.
- Never read or shown: question and answer text, chat titles, memory, emails, names, IP addresses,
  locations. Firestore reads ask for named fields only (`select`), so content never leaves Firestore.
- Revo's log lines carry the account's uid from #497. The privacy policy's #revo section says so: logs
  hold counts and costs linked to the account's internal ID, for 30 days.
- The per-account file lives in the owner's private Google Drive, and the page lives in his private
  claude.ai account. Nothing per account passes through GitHub. The workflow's artifact holds totals
  only, like the public health and stats issues.
- Turning Revo off or deleting conversations deletes that account's chats, so its history here
  shrinks. Spend totals stay exact.

## What it costs

- **Google Cloud:** reads inside the free tiers. A run reads the Revo chats and messages (non-content
  fields), the users' tester flags and the ledger: a few thousand Firestore reads at today's size. It
  also makes about 30 Monitoring calls and a few Logging pages.
- **GitHub Actions:** free (public repository). One run takes about a minute.
- **Sentry, App Store Connect, Drive:** none.
- **Claude:** none. The page reads Drive directly; no Claude session runs on a schedule.

## Setting it up (once)

1. **Service account** `revisely-metrics@revision-buddy-3a398.iam.gserviceaccount.com`. Roles
   `roles/monitoring.viewer`, `roles/logging.viewer`, `roles/datastore.viewer` (read-only); the Google
   Drive API enabled; a JSON key at `~/secrets/revisely-metrics.json` (chmod 600, never in the repo).
2. **Drive:** a folder "Revisely metrics" in the owner's Drive with `metrics.json` (any JSON to start)
   and an empty `refresh` file, shared with the service account as Editor.
3. **Mac:** `bash scripts/metrics/install.sh`. Put the two Drive file ids in
   `~/.config/revisely-metrics/config.json` (`drive.metricsFileId`, `drive.refreshFileId`), and your own
   uid in `ownerUids` to mark your account "you". Then run
   `node ~/.local/share/revisely-metrics/bin/watch.js --now`.
4. **The page:** `scripts/metrics/dashboard.html` with the two file ids in its `CONFIG`, published as a
   private artifact. It declares the `mcp` capability for Google Drive's `download_file_content` and
   `update_file`; the first open asks the owner to allow it.
5. **Workflow:** `.github/workflows/metrics.yml` runs from `main` (`gh workflow run` needs it there).

## Upkeep

- After changing the scripts, run `bash scripts/metrics/install.sh` again. The job runs the copies in
  `~/.local/share/revisely-metrics/bin`, never a checkout.
- Log: `~/Library/Logs/revisely-metrics.log`. State (last run, last request, alarms on):
  `~/.local/share/revisely-metrics/state.json`.
- **Platform split:** Sentry's sessions carry no OS. `totals.js` takes a release's platform from its
  Sentry events, then from another release of the same build, and only then from the build number:
  below `METRICS_IOS_MIN_BUILD` (20) is Android. Builds that never sent an event fall back to that rule,
  so raise it before Android version codes reach 20.
- **Revo's limit (20) and prices** are read from the code's behaviour (`metrics.js` `DAILY_QUESTIONS`;
  costs come from the log lines, priced by `functions/src/coach/pricing.ts`). Change them together.
- **The Clear Quran budget** isn't on the page yet: the worker keeps its counts in a Durable Object with no
  route to read them.
- To stop it all: `bash scripts/metrics/install.sh --uninstall`, delete the key, and remove the service
  account's roles.
