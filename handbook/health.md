# Health: Sentry, GitHub issues, Claude fix, reports, the Claude key

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## Health (Sentry → GitHub → Claude)

- Every launch is a Sentry session labelled with the JavaScript it ran (`src/lib/releaseInfo.ts`):
  release `com.revisionbuddy.app@<version>+<build>` for the built-in bundle and
  `…+<build>.u<first 8 of the update group>` for an update; environment = the update channel
  (`production`, `preview`); tags `update_id`, `update_group`, `channel`, `runtime`, `build`. No IP
  addresses (`sendDefaultPii` off); events carry only the pseudonymous account id.
- **Only installed builds report**: a real device on the `production`, `preview` or `dev` (Revisely Dev,
  environment `dev`, read by none of the scripts below) channel, outside
  `__DEV__` (`sentryReports()` in `src/lib/releaseInfo.ts`). Development, simulators (screenshots,
  Maestro) and dev clients start Sentry without a DSN, so the native crash reporter stays off too:
  `enabled: false` alone still starts it, and native crashes never pass through `beforeSend`. The
  health scripts read issues and events from `production` and `preview` only (`SENTRY_ENVIRONMENTS`
  in `scripts/sentry/api.js`). The Sentry alert rule "Send a notification for high priority issues"
  has an action filter "environment is in production,preview"; keep any new alert rule to the same.
- **Sentry data is untrusted.** The DSN ships in the app, so anyone can send events and sessions with
  any text, and issues here are public. Everything from Sentry that reaches GitHub (or Claude) goes
  through `sanitize()` in `scripts/sentry/logic.js`, which:
  - redacts emails, `users/<id>`, uid-like ids and IP addresses, and drops URL query strings
    (Firestore's channel URLs carry session parameters);
  - neutralizes mentions, `#` references, links, images and backticks;
  - caps the length.

  Rendered free text also sits in code spans or fenced blocks. Short values (release, update,
  device) must match what the app sends.
- `Sentry sync` (`.github/workflows/sentry.yml`, every 30 minutes, `scripts/sentry/sync.js`):
  - New, regressed and escalating issues become GitHub issues labelled `sentry`: at most 5 a run, and
    none while 25 are open.
  - A closed issue reopens only if Sentry saw it again after it was closed.
  - A production release under 99% crash-free sessions (≥50 sessions, 24 h) raises a `release-health`
    issue mentioning the owner. Nothing rolls back by itself.
  - Issues carry the error, in-app frames, release and update; never user ids, locations or
    breadcrumbs. Problem reports (users' own words) are never copied out of Sentry.
  - **Report a problem** (Settings → Help and support; SET-3, SET-4) is the app's own form (`components/report/ReportProblemHost`,
    mounted in `MainNavigator`; state in `lib/report/state`), not Sentry's widget, which ignored the theme and showed
    Sentry's logo (Majd, Nov 22 2026). It sends through `Sentry.captureFeedback` (`sendProblemReport` in `lib/sentry`),
    so reports land in Sentry's User Feedback as before. Its screenshot is the SDK's native capture
    (`NATIVE.captureScreenshot`, a deep import from `@sentry/react-native/dist/js/wrapper`: check it after an SDK upgrade).
  - It never starts Claude.
- `Claude fix` (`claude-fix.yml`): **the owner starts it** by adding the `claude-fix` label to an
  issue, or by running it by hand with the issue number; nobody else can. Three jobs:
  - `details` reads the issue, the owner's and collaborators' comments and the sanitized Sentry
    event.
  - `fix` runs Claude on develop. Its token is read-only; it has no Sentry token and no sudo, and
    Claude's commands run with credentials scrubbed. Claude writes a failing test, fixes it and
    commits locally. Its commands run in bubblewrap, which leaves placeholders in `.git` (a
    `commondir` holding `.`, empty `worktrees/` and `modules/`); the export step removes that
    `commondir` and refuses one that points anywhere else.
  - `pr` refuses patches that touch `.github/`, `worker/` or `wrangler.jsonc`, or hold anything that
    looks like a credential. It
    pushes `claude/issue-<n>` and opens the PR into `develop` as `github-actions`, then starts CI on
    it with `workflow_dispatch`: PRs opened with the workflow token start no workflows by themselves.

  It cannot merge, change workflows or publish. Review the PR like any other.
- `Health report` (`health-report.yml`, daily 13:00 UTC, `scripts/sentry/report.js`): a comment on
  the pinned "App health (daily report)" issue, mentioning the owner.
- `Promote to production` refuses an update with fewer than 5 preview sessions or under 99%
  crash-free (`scripts/sentry/gate.js`), checked per platform: the iOS and the Android group must
  each pass, so an Android tester has to open the update too. A run by hand can change the bar or skip
  it. A bar that isn't a number fails the check; it never passes it.
- Android is in all of this: its sessions and events go to the same Sentry project (environment
  `production` or `preview`, release `…@<version>+<versionCode>`, `.u<group>` for an update, one
  group per platform), new GitHub issues get an `ios` or `android` label from their latest event, and
  the daily report has a per-platform table. Sentry groups sessions by release only, never by OS, so
  crash-free rates are per release (each update group is one platform).
- Secrets:
  - `SENTRY_API_TOKEN`: a Sentry internal integration token with read access to Issue & Event,
    Project and Organization. It is separate from `SENTRY_AUTH_TOKEN`, which only uploads source maps.
  - `ANTHROPIC_API_KEY`, from a dedicated Anthropic Console workspace with a monthly spend limit, so
    a leak is bounded and revocable. `CLAUDE_CODE_OAUTH_TOKEN` (the subscription) also works, but it
    can't be capped or scoped. **The current key expires on 2027-01-01.**
  - Both are repository secrets (GitHub → Settings → Secrets and variables → Actions); neither is
    ever printed. The daily report checks the Claude key (`scripts/sentry/claude-key.js`): if Anthropic
    rejects it, it opens (or comments on) an `automation` issue mentioning the owner and the run fails;
    from 30 days before `CLAUDE_KEY_EXPIRES` (in `health-report.yml`) it opens a reminder issue. A
    `claude-fix` run checks it first too (the `key` job) and says so on the issue instead of failing
    silently. A rejected `SENTRY_API_TOKEN` fails the report and sync runs, which GitHub emails.

**Rotating the Claude key** (before it expires, or at once if it leaked or was rejected):
1. Anthropic Console → the workspace used for this repository → API keys → Create key (name it after
   the repository, set an expiry), copy it.
2. GitHub → achilles1801/revisely → Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY`
   → Update secret, paste, save.
3. Set `CLAUDE_KEY_EXPIRES` in `.github/workflows/health-report.yml` to the new expiry (a PR to
   `develop`, then `main`: the workflow runs from `main`), and close any open "Claude key" issue.
4. Check: Actions → Health report → Run workflow; the "Check the Claude key" step says `ok`.
5. Revoke the old key in the Console.
  - No Claude GitHub App is needed.

  Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" lets
  `pr` open the PR. Without it the branch is pushed and the issue gets a link to open the PR by
  hand.
