# Revisely Metrics (the owner's console)

A private web page that answers two questions on the owner's phone: how Revo is used, by whom and at what
cost (with each account's conversations), and whether the app is healthy. Built Nov 2026 to Majd's picks:
layout A with the phone status line, a Refresh button, exact cost per account, alarms pushed to him, and
everything in the cloud.

**Open it:** https://metrics.revisely.app once its domain is set up (below), or
https://revision-buddy-3a398.web.app (sign in with the owner's Google account).

**Sign-in in an app's built-in browser** works only on metrics.revisely.app. On web.app the page signs in
through `revision-buddy-3a398.firebaseapp.com`, another site, and built-in browsers wall off its storage:
Firebase stops halfway with "missing initial state" (Nov 10 2026; Safari is fine). On a host in
`OWN_AUTH_DOMAIN_HOSTS` (`admin/console.js`), the page is its own auth domain, and a phone signs in with a
full-page redirect. A host goes in that list only once both of these are done, or its sign-in breaks:
- `https://<host>/__/auth/handler` is an authorized redirect URI of the project's "Web client (auto
  created by Google Service)" (Google Cloud → APIs & Services → Credentials);
- the host is an authorized domain in Firebase → Authentication → Settings.

The domain itself is a Firebase Hosting custom domain (Hosting → Add custom domain), with its DNS records
in Cloudflare as "DNS only" (a proxied record stops Firebase issuing the certificate). `adminMetrics` and
`adminRevo` accept calls from it (`consoleOrigins` in `functions/src/metrics/admin.ts`).

## How it works

```
Browser (Firebase Hosting, admin/) ── Google sign-in ──► adminMetrics ──► Firestore, Revo's logs, Cloud Monitoring,
                                                                         the stored Sentry + App Store totals
                                 └─ tap an account ──► adminRevo ──► that account's chats and memory (live)

GitHub "Metrics" workflow, hourly ── Sentry + App Store totals ──► metricsTotals ──► adminMetrics/totals
                                 ◄── alarms that just started ── (posted on the "Metrics alerts" issue)
```

- **The page** (`admin/`: `index.html`, `console.js`, `console.css`) is served by Firebase Hosting. Its
  Firebase config comes from Hosting itself (`/__/firebase/init.json`), so no key is in the repository,
  and the project's own domain is already allowed for Google sign-in. It keeps nothing in the browser but
  the range and channel picked.
- **Who gets in:** only an account whose ID token carries `admin: true`, checked by the functions on
  every call (`functions/src/metrics/admin.ts`). Set it with `functions/scripts/set-admin.js <uid>`.
  No Firestore or Storage rule reads the claim, so it opens the console and nothing else.
- **adminMetrics** (callable) reads everything live and works out every number
  (`functions/src/metrics/aggregate.ts`), keeping the answer 2 minutes. Refresh asks for a new one. It
  covers the 1h, 24h, 7d and 30d ranges. Firestore reads name their fields (`select`), so the numbers never
  read conversation text. Logging and Monitoring are read with the function's own service account.
- **adminRevo** (callable) returns one account's conversations (questions, answers, what was added,
  ratings, actions) and what Revo remembers, read live when the owner opens that account. Nothing is
  copied or kept. Each read is logged as `admin` `{event: 'read-revo', reader, account}`, never with
  content. It shows counts only until `config/admin.conversations` is true
  (`set-admin.js --conversations on`), which is turned on only once the privacy policy says the developer
  may read conversations.
- **metricsTotals** (HTTPS) takes the workflow's totals. Only `metrics.yml` in this repository on `main`
  may call it, scheduled or by hand: it checks the job's GitHub OIDC token (audience `revisely-metrics`).
  It stores them in `adminMetrics/totals`, works out the alarms, and answers with those that just started.
  `scripts/metrics/push.js` posts them on the "Metrics alerts" issue, mentioning the owner, so GitHub
  emails it and the GitHub app pushes it.
- **Alarms:** Revo failing (3 in 15 minutes, or over 10% of an hour's calls), Revo resting or capped, today
  over half the daily allowance, the month over 80% of the cap, a function over 1% errors in an hour,
  production crash-free under 99% (50+ sessions). Each is posted once when it starts. They're checked
  hourly, with the workflow.
- **Server-only documents:** `adminMetrics/totals`, `adminMetrics/alarms` and `config/admin`. The rules'
  catch-all keeps them closed to every client (`tests/firestore-rules/default-deny.test.ts`).

## What's on it

- **Revo:** questions and Day in review over time, people, cost, failures by cause, resting and capped,
  cut-off replies, retries, answer time (p50/p95), the prompt cache, tokens, who uses it (Revo on, asked,
  came back), thumbs, actions taken, attachments, spend against the month's cap and today's allowance,
  and every account (questions, days, reviews, tokens, cost, days at the 20-question limit, failures,
  thumbs, last used). Tap one for its conversations and memory.
- **App** (Sentry and App Store totals, at most an hour old): active people by platform for store users
  or testers, crash-free by release, update adoption, App Store downloads.
- **Backend:** each Cloud Function's calls, refusals (4xx), errors (5xx) and latency; Firestore reads,
  writes and rule refusals today.

## Privacy

- The policy's Revo section says Revisely's developer may read Revo conversations and what it remembers to
  improve Revo and keep it safe, and that logs carry the account's internal ID (#498). App Store
  (Other User Content, Product Interaction) and Play (Other user-generated content) list Analytics as a
  purpose, and Play also lists security.
- Accounts are shown by their uid (pseudonymous), never by email or name.
- Conversation text stays in Firestore. It is read live for the owner and is never copied to GitHub
  (public), logs, or anywhere else. The workflow's totals hold nothing per account.
- Revo's log lines carry the uid from #497, kept 30 days by Cloud Logging.

## What it costs

About nothing at today's size. Each console load (or Refresh past the 2-minute cache) reads Revo's chats
and messages (named fields) and the testers, about 30 Monitoring calls and a few Logging pages. The
hourly totals run does the same once. Firestore reads are a few thousand a load and grow with Revo's use;
add a collection-group index on `messages.at` and read only the range when that matters. GitHub Actions
is free (public repository). Hosting serves a 60 KB page.

## Deploying (owner's word for each)

1. Functions: `firebase deploy --only functions:adminMetrics,functions:adminRevo,functions:metricsTotals`
2. Admin claim: `cd functions && GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-admin.js <uid>`
3. The page: `firebase deploy --only hosting` (from a checkout that has `admin/`).
4. The workflow: `metrics.yml`, `scripts/metrics/totals.js` and `push.js` on `main`. Deploy step 1
   first, or the hourly run fails until `metricsTotals` exists.
5. Conversations: only after the policy (#498) is live and the store answers are updated,
   `node scripts/set-admin.js --conversations on`.

The functions' service account needs to read Logging and Monitoring (`roles/logging.viewer`,
`roles/monitoring.viewer`). The default compute service account has them through Editor. The console shows
"Revo logs: … 403" or "Cloud Monitoring: … 403" if not.

## Upkeep

- **Platform split:** Sentry's sessions carry no OS. `totals.js` takes a release's platform from its Sentry
  events, then from another release of the same build, then from the build number: below
  `METRICS_IOS_MIN_BUILD` (20) is Android. Raise it before Android version codes reach 20.
- **The daily limit (20) and prices:** `aggregate.ts` `DAILY_QUESTIONS` follows `REVO_DAILY_QUESTIONS`.
  Costs come from the log lines, priced in `functions/src/coach/pricing.ts`.
- **The Clear Quran budget** isn't on the console: the worker keeps its counts in a Durable Object with
  no route to read them.
- **To shut it:** `set-admin.js <uid> --off`, or delete the three functions. The page alone shows nothing.
