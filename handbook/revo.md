# Revo (the assistant)

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## Revo (the assistant)

Revo is the in-app AI assistant (Nov 6 2026; mocks and notes `~/Documents/revisely-today-mocks/revo/`,
privacy draft `~/Documents/revisely-stats/coach-privacy-draft.md` § R). It supersedes the Ask coach in the
app; `askCoach`/`setCoachOptIn` stay as they were until Insights links to Revo. Rules: BEHAVIOUR.md REVO-*.
- **Who:** previewTester accounts only (`revoAvailable`), off until the opt-in. Revo's switch is its own,
  `coachSettings.revoOn` (the callables call it `optIn`); the Ask coach's `optIn` doesn't turn Revo on (it
  did until Nov 7 2026, which skipped Revo's opt-in and sent a Day in review before it). For the changeover
  the server still serves an account with `revoOn` unset and the coach's `optIn` on (apps from before #310
  read that), and only `revoOn: false` turns it off (`functions/src/revo/settings.ts`); drop that fallback
  once every tester has the new app. A tap before the switch is read waits for it (up to 2 s). E2E builds
  run the real `revo*` functions in the functions emulator (only the model answers from a recording);
  `09-revo` marks its account a tester, sets the model's text, the day's count and Revo off through the
  emulators (`.maestro/scripts/server-revo.js`), and calls the `revo*` functions once as its account
  before anything waits on them (a function's first signed-in call there takes 17–22 s on a CI runner).
- **App:** `components/revo/RevoHost` is mounted once in `MainNavigator`: the button (a 44pt disc,
  bottom-right, 14 above the tab bar and the mini player) on the routes in `REVO_BUTTON_ROUTES` (never the
  reader, a session or an editor; hidden with the keyboard and while the sheet is up), and the sheet
  (`RevoSheetFrame`: about 55%, a drag up or a conversation takes it to full height). The views: `RevoChat`,
  `RevoPages` (History, Memory, the opt-in), `RevoPicker` (+), inside `RevoBoundary` (an error in Revo says so
  in the sheet: on build 32 an uncaught JS error can end as a native crash, REACT-NATIVE-10).
  - **Lists clear the button** with `useRevoFootprint()` (`lib/revo/presence`): its room on the screens it
    shows on, 0 elsewhere, added to the scroll view's bottom padding beside `useTabBarFootprint()` (which no
    longer includes it). Home, Read, Activity (and its Day and All views) and Insights use it.
  - **The keyboard:** the sheet sits on it and gets shorter (`lib/revo/sheetFit`), so the header and the
    conversation stay; there is no KeyboardAvoidingView (it pushed the whole sheet up and off the top).
  - **Colours** follow the theme and the accent: `palette.revo` (`theme/v2`) for the R, its disc, the glows
    and the shadow; everything else is the palette's (`revoColours.test` checks the contrast).
  - **Answers:** `callFunction` returns the callable's `{ result }`; `lib/revo/backend` reads it, checks the
    answer's shape (`askResultOf`) and names a failure (`refusalOf`: offline, the server's reason, the limits).
  Another screen opens Revo with `openRevo({ attach })` (e.g.
  `insightAttachment('weakSpots')` for an Insights section's "Ask Revo"); Settings → Revo AI turns it on and off.
- **What it is told** (`lib/revo/context`): built when a question is sent, from `lib/todaySnapshot`, the same
  snapshot Home's Today post is built from (today, the week, the streak with its grace), so it can't disagree
  with Home (REVO-26). Parts of the Qur'an go worded surah and juz first (`lib/revo/words` over
  `lib/passages`), with the page numbers. The server writes the context out in plain words for the model
  (weekdays, never dates, field names or JSON). Attachments (`lib/revo/attachments`) go only with the question they were
  picked for; a recording is its length and pages, never audio. The greeting and chips are written on the
  phone (`lib/revo/greeting`), no call. Every open is a new conversation on a greeting written then (REVO-34;
  an old chat only from History, today's Day in review from a row under the greeting, never opened on). It
  doesn't repeat itself (REVO-35): `RevoHost` counts the day's opens per state (`@revo_greeting_opens:<uid>`),
  so "Today's N pages are done" comes once, then tomorrow's start, a weak part, the week, the share memorized in
  turn (Majd, Nov 7 2026: the same done line on every open was "irrelevant now"). Charts are named by the model and drawn from the phone's own data
  (`lib/revo/charts`); an action ("Add to my plan": tomorrow's carry, `carryForTomorrow`) waits for a tap.
- **Attachments** (+; REVO-32, REVO-33, Nov 7 2026): a surah, a juz, pages or a day go with their facts, worked out
  on the phone by `lib/revo/facts` from the sources Insights, Activity and the streak read, the way they read them
  (the credits: the Activity items with the phone's sessions over them, else the logs as the streak reads them; the
  plan: `snapshot.streak.scheduled`; strength: Insights' rule; a day: Activity's minutes, the timer, the daily log,
  this phone's recordings). `prepare(sources)` reads them once for many rows (the picker's previews). A day goes
  with its notes, and the picker and the chip say so ("includes 2 notes"); there is no separate Notes option. The
  server checks the facts strictly (`validate.ts`: they must add up, a surah's or juz's pages are its own,
  `quranIndex.ts`; a day's place matches the question's day) and writes them out as sentences (`attachText.ts`).
  A question takes one (`attach`, every app) or up to six (`attachments`, stored as `attachList`); the older kinds
  (day, page, note) are still accepted from older apps.
- **Tone** (REVO-27, Majd's choice, Nov 7 2026): a warm coach; the answer first, about 35 words; one next step
  (today's while today isn't done); surahs and juz, a page number only when asked. Check a prompt change with
  `functions/scripts/revo-tone-samples.js` (real replies, before and after, for the owner) before deploying it.
- **Server** (`functions/src/revo/`): `revoAsk`, `revoDayInReview`, `revoSetOptions`, `revoClear`, with the
  coach's key (`ANTHROPIC_COACH_KEY`), cached system prompt, retries and ledger, on `claude-sonnet-5-5`
  (`REVO_MODEL`; the Ask coach stays on Haiku 5.5; prices per model in `coach/pricing.ts`, Sonnet 5.5's
  caching minimum is 512 tokens). **Thinking is off** (`thinking: {type: "between_tools"}`; Sonnet 5.5 thinks
  by default and its thinking counts against `max_tokens`: at 700, every reply was cut off, Nov 7 2026) with
  `REVO_MAX_TOKENS` 800; the log says `stop: max_tokens` when a reply is cut off anyway. Every `revo` log
  line carries the account's `uid` (Nov 2026, for the metrics dashboard's per-account use and cost; the
  privacy policy's #revo says so); never the question, answer or notes. 20 new questions a revision day (`revoUsage/{uid}`; an earlier day than counted is refused), a first
  question without an attachment kept for the day (free), the last 10 messages sent with a follow-up, up to
  30 memory items (`users/{uid}/revoMemory`), conversations in `users/{uid}/revoChats/{id}/messages`. The
  owner reads them and may only rate a reply, mark an action, mark a chat "plan added" and delete a memory
  item (firestore.rules, tests in `tests/firestore-rules/revo.test.ts`). Off deletes conversations, memory and
  kept answers; account deletion and Reset my data delete them too.
- **The monthly cap** (shared with the Ask coach, one ledger) is `config/coach.monthlyCapUsd`: **$150** since
  Nov 7 2026 (the plan's $200 a month of API credit, used only by Revisely, less a buffer); $10 when unset,
  at most $1,000, read again within a minute: `cd functions && GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-coach-cap.js 200`
  (`--show` prints it and the month's spend). No code change or deploy.
- **Day in review:** from 19:00 local on a day with something done, the app asks once (`revoDayInReview`,
  idempotent per day, `review-{day}`); it never counts toward the 20 and is skipped when capped. The
  button's dot shows until it is opened (AsyncStorage, per account).
- **Deploy order:** `firestore.rules` and the functions (`revoAsk,revoDayInReview,revoSetOptions,revoClear`,
  and `askCoach,deleteUserAccount,resetMyData`, which changed with it) must be live before the app reaches
  `develop` (it publishes to preview at once).
- **Dictation:** the mic opens the field with the keyboard up (the keyboard's own dictation). A mic that
  dictates by itself needs a speech module: a native build.
- **E2E:** `.maestro/flows/09-revo.yaml` takes a screenshot of each mocked screen (`r1`…`r10`), the sheet
  with the keyboard up (`r5k-keyboard`, asserting the header stays), then the main ones again in dark
  (`…-dark`); `~/Documents/revisely-today-mocks/revo/scripts/boards.py <screens folder>` puts them beside the
  mocks (light or dark) in `revo/verify/`. On iOS a control's accessibility label stands for its text (a chip
  is "Ask: …"): match by id, and an id is a regex (no bare `?`).
- **Scenarios:** `harness/revoServer.js` serves the callables from the functions' own code against the
  emulators (only the model is a stand-in), so `[REVO-23]` runs the app's real requests.
- **The guide** (`functions/src/revo/guide.ts`, REVO-30): how Revisely works, for Revo, in the cached part of its
  prompt: each rule in user words, where every screen and setting is, the steps for common tasks, what is for testers,
  and what the app can't do with the closest way.
  - **Every change a user can see updates the guide in the same PR** (Majd, Nov 16 2026: "whatever app changes we make,
    revo should get that update too"): a rule, a screen, a route, a label, a setting, an Undo, a mode. Features in the
    store app (and its testers') go in `GUIDE_SECTIONS`; features only Revisely Dev has go in `DEV_GUIDE_SECTIONS`.
    When a Dev feature reaches the store app, move its lines to the main guide.
  - **The Dev guide** is a system block of its own (`DEV_GUIDE_SYSTEM`), sent after the main prompt only when the
    context says `app: 'dev'` (Revisely Dev, `isDevVariant()`). Store requests never carry it, so they, their prompt
    cache and the recorded replies stay byte-identical; a change to the Dev guide needs no re-record. A day in review
    doesn't carry it.
  - **`guide.test.ts` fails** when:
    - BEHAVIOUR.md has a rule no section covers and `GUIDE_INTERNAL` doesn't list;
    - a `GUIDE_INTERNAL` reason doesn't start with one of `GUIDE_INTERNAL_KINDS` (`timing:`, `server:`, `layout:`,
      `owner tool:`, `signed out:`, `superseded:`, `prompt:`), or mentions Dev. Nothing a user sees may sit there;
    - a Dev-only rule isn't in the Dev guide, or is in the main one. A rule is Dev-only when it sits under a
      BEHAVIOUR.md heading marked "(Revisely Dev)", or carries "(Revisely Dev)" right after its id
      (`- **ACT-28.** (Revisely Dev) …`). The Dev guide covers only such rules: when a feature reaches the store app,
      drop the mark and move its lines to the main guide;
    - the guide names a route or a “label” the app no longer has (curly quotes mean the app's exact text; plain quotes
      are examples).
  - `functions/scripts/revo-guide-samples.js` asks the real model ~40 how-to questions (Revisely Dev's marked `dev`)
    and checks each answer's facts (`--dry` checks the requests; live needs the coach key).
  - A changed main guide is a changed system prompt: deploy `revoAsk,revoDayInReview` and re-record
    (`scripts/record-anthropic.js`, needs the coach key). On develop, `dev-backend.yml` deploys them to revisely-dev
    on merge; production's are deployed by hand with a release.
- **Recitation** (Revisely Dev, RINS-1; Majd, Nov 16 2026; plan `recite-insights-revo.md` in the orchestrator's notes):
  for an account that recites with Mark mistakes (`reciteLiveForAccount`), each question carries `context.recitation`.
  `lib/revo/recitation` builds it from `lib/reciteInsights` over Recite memory's takes: the last 4 weeks' takes and score,
  mistakes by kind, Not clear and tajweed apart, words still marked and cleared, passages that keep slipping, similar
  ayahs gone on with, and the latest take. A take attached (`reciteTake`, `takeAttachment`) adds its marks: the expected
  word, and the heard word only for a real word or a harakat/letter slip, never a `sound`. Text only, no audio or ids.
  The server (`functions/src/revo/recitation.ts`) checks it adds up and writes it out. Its rules (only marks that exist;
  Not clear is never wrong; words and similar ayahs before harakat; restarts aren't mistakes; surahs, never pages) are a
  second system block sent only with a recitation, so every other request, its cache and the recorded replies are
  unchanged. Before this could reach production, the privacy policy's Revo part and the store answers need the Recite
  results (Majd's call).
  Activity → Insights shows the same for the user (RINS-2, `components/activity/RecitationInsights`, `useRecitation`):
  a Recitation section after Weak spots, over Insights' range, with the score and its weeks, Keeps slipping (a row opens
  the reader at its ayahs, highlighted), Similar ayahs and one quiet line; Weak spots say how many words Recite still
  marks on a page. Smart Tracking off: nothing about strength (rows say when the passage was last recited).
- **Opening a screen** (`openScreen`, REVO-31): Revo's card can open Jump to…, Edit schedule, the memorized pages,
  Activity, the daily log, Settings at a section, prayer times, the Qibla or the reader at a surah or juz
  (`REVO_SCREENS`, the same list in `functions/src/revo/types.ts` and `src/lib/revo/types.ts`; `src/lib/revo/screens`
  maps each to its route). A new screen goes in both lists, `screenTarget` and the guide's `SCREEN_HINTS`.
- **Answers from the tafsir** (Revisely Dev; Majd, Nov 26 2026: "all answers MUST stem from those tafseer books"; plan,
  boards and measurements in `~/Documents/revisely-revo-mocks/tafsir/NOTE.md`). Revo answers questions about the Qur'an
  only from Tafsir al-Tabari, Ibn Kathir, al-Qurtubi and al-Sa'di, and shows each book's words.
  - **The texts:** QUL's (Tarteel's Quranic Universal Library), from spa5k/tafsir_api's per-surah JSON.
    `functions/scripts/tafsir/build-tafsir.js --raw <dir> --out <dir>` writes one file per Madani 1405 page (the passages
    that touch it, from the four and Ibn Kathir's abridged English; harakat kept, the editors' `[[...]]` notes removed;
    pieces of about a sentence as offsets), 604 files, 109 MB; uploaded to dev Storage `tafsir/v1/` (`gcloud storage cp
    -r <out>/v1 gs://revisely-dev.firebasestorage.app/tafsir/`). Production's Storage gets them with the release.
  - **Retrieval** (`functions/src/revo/tafsir/select.ts`): the ayat asked about are the index (page → passages); al-Sa'di's
    passages whole, then up to 6 pieces from each of the other three, focused by keyword search (BM25) over Ibn Kathir's
    English. Measured with count_tokens on seven pages: 8,500–11,000 tokens a question, against 27,000–29,000 for a
    whole page (Arabic is ~1.3 characters a token; the model gets it without harakat, ~20% fewer).
  - **The request** (`request.ts`): its own small system prompt, the books as documents with Anthropic's Citations on
    (each quote comes back as exact words and their place, guaranteed real; quoted words cost no output tokens), no
    structured output (Citations can't be combined with it), the rules and al-Sa'di cached. `reply.ts` maps each
    citation back to the book's own text, harakat and all; an answer with no source is shown only when short (the
    books don't say). A question asked elsewhere in Revo first goes to Haiku 5.5 (`locate.ts`) for its ayat. The answer
    is Haiku 5.5's too (`TAFSIR_MODEL`; Majd, Nov 26 2026: "haiku", from the 60-question test: the same passes as Sonnet
    5.5 at about a twentieth of the cost), thinking off (Haiku refuses `between_tools`). The answers written ahead stay
    Sonnet 5.5's (already paid for).
  - **Streaming** (Nov 26 2026, Revisely Dev; measured from a laptop: the first words after 0.6 s, the whole answer
    after 3.1 s): Revo’s chat in Dev asks `revoAsk` for its answer as it is written (`callFunctionStreaming` in
    `services/firestoreService`: the callable protocol with `Accept: text/event-stream`, read with `expo/fetch`,
    whose body arrives as it comes; React Native's own fetch reads it whole). The server streams only answers from
    the tafsir: `callCoach` with `onStream` asks Anthropic for `stream: true` and reads the events
    (`coach/stream.ts`) into the same reply, and `tafsir/stream.ts` passes the text to the callable's `sendChunk`
    (`{ text }`), holding anything past `UNCITED_MAX_WORDS` until the first citation. Every other answer, and the
    store app, comes whole. A stream is retried only before any text went on. The emulator plays a recorded reply
    back as the API streams it (`sseOf`), and the scenario harness hands `expo/fetch`'s body over as it arrives
    (`harness/functions.ts`, `streams`). `coach/stream.test.ts` reads a real stream (`revo-tafsir.stream.txt`, made by
    `scripts/tafsir/record-stream.js`).
  - **The answer** (`handleRevoAsk` → `answerFromTafsir`, REVO-44): in Revisely Dev, a question with `quran` (the app's
    ayat: the mushaf's page or a held ayah), in a chat that has one, or that the Haiku step places, is answered from the
    tafsir and counts in the 20 a day; the reply keeps `sources` (each the book's words, the passage around them, Revo's
    sentence) and the chat its `quran`, so follow-ups use the same ayat. The app draws them under the answer
    (`components/revo/TafsirSources`: "From the tafsir", a tap shows the passage). The emulator answers the two new
    requests from `revo-locate.json` and `revo-tafsir.json` (real replies, `scripts/tafsir/record-replies.js`; record
    them again when the request's model, thinking or system prompt changes); `replies.<kind>` on an account sets one
    kind's reply.
  - **In the mushaf** (REVO-45; Majd, Nov 26 2026, reversing REVO-25's "no revo in the mushaf tab at all" for Dev):
    `RevoHost` sets `useRevoInMushaf()` (Dev, Revo on, `mushafOn` not false). The reader then puts a 30pt R
    (44pt to tap) in `ReaderFrame`'s `quietEnd`, the quiet footer's empty end slot beside the page number, in the room
    kept under the page; hidden while a take runs. It opens Revo with `openRevo({ quran })` (`lib/revo/open`:
    `pageScope`, `ayahScope`); the chat starts on the page's or ayah's chip and starters and sends `quran`. The held
    ayah's menu gets "Ask Revo" through `useVerseActions({ onAskRevo })`, which only the reader passes (never a
    session). Settings → Revo AI → "In the mushaf" saves `mushafOn` through `revoSetOptions`; the section's footer is
    the one quiet line naming the four tafsirs (Majd: "more subtle").
  - **The greeting** (REVO-46): in Revisely Dev, opened from Home while today isn't done, `RevoChat` adds one sentence
    offering the next page's tafsir (`context.today.nextPages[0]`) and puts "What does the tafsir say?" first among the
    starters; that starter sends the page's `quran`. A one-line summary of each page from the tafsir, written ahead in a
    batch, would let the greeting say the meaning itself; it waits on Majd's yes for the spend (~$7 with the chips).
  - **The spend Majd OK'd** (Nov 26 2026, $13; ledger `~/Documents/revisely-revo-mocks/tafsir/spend.md`), each script with
    a `--max-usd` guard: `scripts/tafsir/lines-batch.js` (an English line on every piece of al-Tabari, Ibn Kathir and
    al-Qurtubi, Haiku 5.5 Batch, ~$2.40; `collect` writes `lines` into the page files, re-upload them; `select.ts` then
    ranks those pieces by their lines), `scripts/tafsir/answers-batch.js` ("What's happening here?" for all 604 pages,
    Sonnet 5.5 Batch, ~$6; served by `tafsir/ahead.ts` from Storage `tafsir/answers/v1/`, free and at once, only for a
    whole Madani 1405 page) and `scripts/tafsir/eval.js` (60 questions on Sonnet and Haiku, judged; ~$2).
