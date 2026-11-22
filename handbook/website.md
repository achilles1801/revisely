# The website (account, Premium, Open Door) and the worker

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## Account, Premium and Open Door (the website; dev only)

Majd, Nov 14 2026: revisely.app becomes the account and Premium home, with **Open Door** (Premium free for anyone who
can't pay) as one part. On **dev.revisely.app and revisely-dev only**; revisely.app, the production project and its auth
settings only on Majd's word, after the privacy text for web sign-in. Contract with the app and the checker:
side-session notes `apply-support.md`.
- **Pages:** `docs/apply/` (Open Door: landing, steps, questions, the form), `docs/premium/` (Free vs Premium, nothing
  for sale, no prices), `docs/account/` (plan and where it came from, the application, sign out). English and Arabic
  (`docs/assets/strings.js`, `site-i18n.js`; Amiri, right to left, a switch defaulting to the browser's language).
- **The home and Support in Arabic, on dev only** (Majd, Nov 15 2026: "languages: Arabic only for now"):
  - Their HTML carries the keys (`data-t…`) and its own English. `site-i18n.js` reads that English before it switches.
  - The dev worker adds the switch, the language set before the first paint, `strings-site.js` (Arabic only) and
    `site-rtl.css` (`worker/nav.ts`). revisely.app shows them unchanged.
  - The app's screens are English, so labels stay English in isolates (⁨…⁩), with steps joined by ←.
  - Arabic is Amiri cut to what the pages write (`scripts/site/amiri-subset.sh`, WOFF2, Regular and Bold).
    `worker/__tests__/siteArabic.test.ts` fails on a character outside it, a key without Arabic, or an unused one.
- **Kept off revisely.app:** the worker answers 404 for `/apply`, `/premium` and `/account` unless `ACCOUNT_PAGES` is
  "1" (`wrangler.dev.jsonc` only); `wrangler.jsonc` sends those paths through the worker so the gate holds once develop
  reaches main.
- **Their links in the site's navigation** (header, phone menu, footer, the account button) on dev only: with
  `ACCOUNT_PAGES` "1" the worker adds them to the site's own pages (`worker/nav.ts`, which also loads
  `account-nav.css` / `account-nav.js`), so revisely.app's HTML never links a page that answers 404 there. The three
  pages carry the navigation themselves (`data-acct-nav`).
- **Sign-in only** (Google pop-up, email and password), no sign-up: accounts are made in the app. The web config is
  `/__/firebase/init.json`, which the worker serves from `FIREBASE_HOSTING` (revisely-dev's Hosting site, an empty
  release made only for that), so no key is in the repository. dev.revisely.app is an authorized domain of revisely-dev.
- **The page the app opens** (`/apply/#c=<code>`, from the callable `supportLink`) never signs in and is bare: no
  Premium, account, Download, Donate or store links (App Store 3.1.1, Play's payments policy).
- **Back end** (`functions/src/support`): `entitlements/{uid}` (`premium`, read by the app and the checker; `grants` per
  source), `supportApplication`, `devGrantPremium` / `devRevokePremium`. Each refuses in a project with no program page
  (`SUPPORT_PAGES`), so nothing is collected in production. Majd decides with
  `functions/scripts/support-applications.js` (a decision deletes the answers). No Claude session reads a real
  application.

## Worker (revisely.app/api)

(dev.revisely.app is a second Worker with the same code, `wrangler.dev.jsonc`: see "Dev stack".)

`wrangler.jsonc` + `worker/`: the Cloudflare Worker that serves `docs/` at revisely.app also runs
`/api/*` (nothing else reaches the code). `GET /api/tcq/windows/<surah>:<verse>` answers the block
holding that verse (`{ surah, from, to, verses: [{ verse_key, text }] }`, up to 30 verses, aligned
1–30, 31–60, …; `windowOf()`), and `GET /api/tcq/verses/<surah>:<verse>` one verse from it (builds
from before blocks). Each:
- needs a Firebase ID token (`Authorization: Bearer`), verified in the worker against Google's keys
  (`worker/auth.ts`; project `FIREBASE_PROJECT_ID`); every malformed token is a 401.
- 30 requests a minute per user (`ratelimits`), and daily budgets for what reaches The Clear Quran
  (`worker/budget.ts`, one Durable Object): `TCQ_DAILY_LIMIT_LIVE` for everyone on the live key, App
  Store, TestFlight and dev together (300 × 30 days stays under the 10,000-a-month plan),
  `TCQ_DAILY_LIMIT_SANDBOX`, `TCQ_USER_DAILY_LIMIT` per account; spent: 429 `DAILY_LIMIT` until midnight UTC. Anyone can make an account, so these are what
  keep one user from spending the month for everyone. Raise them with the plan.
- calls The Clear Quran API (`https://api.theclearquran.org/verses?surah=&from_verse=&to_verse=&limit=`,
  one request per block; `/verses/<key>` for single verses if the range query is refused, then for
  10 minutes; `Authorization: Bearer
  <key>`) with `TCQ_API_KEY_LIVE` when the app sends `X-Revisely-Channel: production` or `preview`
  (the App Store app, TestFlight). Development builds use `TCQ_API_KEY_SANDBOX` only if
  `TCQ_API_BASE_SANDBOX` names a sandbox host; it is empty, so they use the live key too
  (`tcqEnvironment()` in `worker/tcq.ts`).
- **Sandbox keys don't work with the documented API.** The Clear Quran's docs
  (theclearquran.org/developers/docs) give one base URL, `https://api.theclearquran.org`, and it
  refuses `tcq_eng_sbx_` keys: 403 "This is a sandbox API key; it cannot be used against the
  production API" (Oct 27 2026). No sandbox host is documented or resolvable, and the API answers 401
  on every path without a key, so it can't be found by probing. If they publish one, set
  `TCQ_API_BASE_SANDBOX` to it (a PR into `main`) and dev builds move to the sandbox key.
- keeps a block in the data centre's cache: fresh for `TCQ_EDGE_CACHE_SECONDS`, then served stale
  for `TCQ_EDGE_STALE_SECONDS` while refreshed in the background (`X-Cache: HIT`, `STALE`, `MISS`).
  Keys include `TCQ_CACHE_VERSION` (see "Keeping its text" above). It answers the app with
  `Cache-Control: no-store`; logs never include a key (`redactKeys`).
- `GET /api/tcq/policy` (no sign-in) gives the app its device cache times and the cache version.
- says where the time went in `Server-Timing`: `auth`, `cache`, `budget`, `tcq-window` or
  `tcq-verse` (the request to The Clear Quran) and `tcq-server` (their own `X-Response-Time`).
  `wrangler tail` also logs each request to them with its time.
- maps their 429 to 429 (Retry-After), 404 to 404, anything else to 502; no key configured is 503;
  anything unexpected is a JSON 500 (`worker/index.ts`).
- `observability` is off: no stored request logs (they would say who read which verse). Watch live with
  `npx wrangler@4.153.0 tail revisely`.

**Deploying:** Cloudflare Workers Builds deploys `main` on every push (and runs `wrangler preview` for
other branches, which is why `wrangler.jsonc` has a `previews` block: previews get no keys and answer
503). So worker changes reach revisely.app through a PR into `main`: they are outside the app hash, so
they don't hold up promotion, and the same files come back through develop unchanged. Never deploy the
worker from a laptop except to recover. Secrets: `npx wrangler@4.153.0 login`, then `npx
wrangler@4.153.0 secret put TCQ_API_KEY_LIVE` (and `…_SANDBOX`) from the repo root; they persist across
deploys and never go in files. Workers Builds' non-production branch builds should stay off
(Workers & Pages → revisely → Settings → Build → Branch control). With them on, every push to another
branch uploads a newer version that isn't deployed, and both the dashboard's Variables and Secrets
and `wrangler secret put` act on the newest version, so they refuse ("latest version … is not
deployed"; Oct 27, while develop still lacked the worker, the dashboard said the Worker "only has
static assets"). If they refuse anyway, redeploy main (merge to it, or Retry the last main build)
and add the secret before anything else is pushed. The worker is its own TypeScript project (`npx tsc --noEmit -p worker`,
in CI) and its tests run with the app's (`worker/__tests__`). Changes to it publish no app update, and
`claude-fix` refuses patches that touch it.

### The Clear Quran API keys (secrets, and rotating them)

Two keys, issued in The Clear Quran developer portal (theclearquran.org/developers → API Keys), live
only as secrets of the Cloudflare Worker `revisely` (dashboard: Workers & Pages → revisely →
Settings → Variables and Secrets): `TCQ_API_KEY_LIVE` (prefix `tcq_eng_liv_`, used by the App Store
app, TestFlight and, for now, dev builds) and `TCQ_API_KEY_SANDBOX` (prefix `tcq_eng_sbx_`, unused
until a sandbox host exists; see above). Never in the repo, `.env`,
CI, PR text, Sentry or chat; Worker Previews get neither.

To rotate one (or after a leak: revoke the old key in the portal first):
1. In the portal, create a new key: product English, the same environment (Production or Sandbox).
2. From the repo root, after `npx wrangler@4.153.0 login` if `npx wrangler@4.153.0 whoami` says so:
   ```bash
   npx wrangler@4.153.0 secret put TCQ_API_KEY_LIVE
   ```
   (or `TCQ_API_KEY_SANDBOX`), and paste the key at the hidden prompt; typed there, it never reaches
   shell history. It takes effect at once: Wrangler deploys the current code with the new secret.
3. Check: `npx wrangler@4.153.0 secret list` lists the names (never values); run
   `npx wrangler@4.153.0 tail revisely` while opening a verse in The Clear Quran on a build of that
   channel (App Store or TestFlight for live) and look for no `answered 401/403` lines.
4. Revoke the old key in the portal.
