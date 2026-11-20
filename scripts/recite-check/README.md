# Recitation check (Revisely Dev only)

The lab's mistake detection (`scripts/recite-eval` on `claude/mistake-eval`), served from Cloud Run in the
**revisely-dev** project for the Revisely Dev app. The store app never calls it: the app shows the check only in the
Dev app (`isDevVariant()`) and only to `previewTester` accounts (`src/lib/reciteCheck`), and the service refuses
every other account.

> **AI notice** (Quran Muaalem License 1.0, section 2.1: the model here is distilled from Muaalem's)
>
> This tool is an artificial-intelligence model that may make mistakes. It is intended for assistance only and
> must not be relied upon. It is not a replacement for a proficient, authorized teacher, because the Quran is only
> received through oral transmission (mushafahah).
>
> هذه الأداة نموذج ذكاء اصطناعي قد يخطئ؛ فهي للإعانة فقط ولا يُعتمد عليها، وليست بديلاً عن معلّمٍ مُتقِنٍ
> مُجاز؛ لأنّ القرآن لا يُؤخذ إلا بالمشافهة.
>
> The app shows the same notice in English and Arabic before the first check, and from the check's sheet and
> Settings → About afterwards.

## Two levels (Majd, Nov 14 2026)

- **Words and harakat:** `letters=1&tajweed=0`. Wrong, skipped and extra words, and letter and haraka slips:
  what Tarteel checks.
- **Strict:** `letters=1&tajweed=1`. The same, plus tajweed: madd lengths against the reciter's settings,
  qalqalah, ghunnah, ikhfa, idgham, iqlab.

`tajweed` is on unless `tajweed=0`, so the build that sends neither keeps today's answers.

**Strict uses two models.** Words, letters, ghunnah, ikhfa and the madd lengths are judged on the released model.
Qalqalah, a lazim madd and the nasal places (idgham, idgham without ghunnah, iqlab) are judged on v5, the lab's
fine-tune, with its own bars (`bars.v5.json`). In the lab, v5 caught idgham, idgham without ghunnah and iqlab 97%,
85% and 98% of the time (the released model 85%, 47% and 66%); it flagged 1% of correct learners' qalqalah (7%) and
judged no lazim madd short in loud babble (14%). It's worse at words, letters, ghunnah and ikhfa, which stay on the
released model. `stage.sh` adds v5 from the lab (`models/ft-v5-onnx`, written by `export_onnx.py`); without it, every
rule is judged on the released model. v5 runs on each judged ayah's audio only: +0.6 s for 112 s of audio. On Majd's head-to-head
take (2:38–43): words and harakat gave his five slips and nothing else; strict added one idgham note.

**Recite and Words and harakat run on v6** (Nov 16 2026), the lab's small model fine-tuned again with women's and
children's voices drawn three times as often and distilled from the large teacher; Strict stays on the released model
and v5, since v6 narrowly fails the women's check on one tajweed rule (noon mushaddadah's length). Each take runs one
model (`Engine.level`), so the CPU per take stays the same apart from the padding v6 is run with (+20% a hop). v6 has
its own bars (`bars.v6.json`, the same rule as the released model's: 0.3% of professionals' correct words) and its own
word settings (`engine.WORDS_P_V6`). `stage.sh` adds it from the lab (`models/ft-v6-onnx`); without it, or with
`RECITE_WORDS_EAR=0` in the service's environment, every level runs on the released model. The word table is the same.
In the lab (same checker; the released model in brackets): learners' correct clips with any mark at this level 25%
(34%), with a mark that counts 12% (20%); their clips with mistakes marked 57% (68%). Professionals' planted slips
caught 97.1% (97.4%), false alarms 0.45 per 100 words (0.40; in quiet 0.19, 0.20). The page scorecard, live: correct
quiet pages with a mark 20% (23%), in mild babble 20% (37%), in loud babble 57% (73%); planted slips caught 95% (99%).
/record: 5 of 6 slips, no false alarm (6 of 6, 5 false alarms). Quieter on correct recitation; it catches about as
many word slips, and fewer of learners' small harakat and letter slips.

**v7, v6 without Tadabur** (Nov 18 2026; `~/Documents/revisely-release/retrain-no-tadabur.md`): v6's recipe without
Tadabur's recordings (CC BY-NC 4.0), on Muaalem's shards, Tarteel users' copy and tlog. `stage.sh` puts it beside v6
(`models/words-v7`, `bars.v7.json`), and `RECITE_WORDS_EAR=v7` in the service's environment runs Recite and Words and
harakat on it (Dev). Without the variable they stay on v6 (an image without v7, or a name it doesn't know, does too).
Its settings (`engine.WORDS_EARS`): v6's words settings with `mean_gop` −5.0, and a letters bar at 0.35% of
professionals' correct words (`make_bars.LETTERS_SHARE`). In the lab (v6 in brackets): professionals' planted slips
caught 96.9% (97.1%), false alarms 0.50 per 100 words (0.45); learners' correct clips with any mark 20.0% (25.2%),
their clips with mistakes 54.1% (57.3%); /record 6 of 6 slips, 1 false alarm (5 of 6, none); the page scorecard, live,
20 / 20 / 60% (20 / 20 / 57%), slips caught 93% (95%); the women's check passes; slips named live 174 of 275, 1 wrong,
none false (171).

**The words ears' fixed exports** (Nov 18 2026). The gates measure v6 and v7 on their checkpoints, but the service runs
their int8 exports, and those heard a little worse:
- **The riwaya input.** The students are trained without it (`train.py` calls the model with no riwaya), but the
  export adds the released model's Hafs embedding to every frame. That cost v7 half a point. Zeroing it costs nothing.
- **int8 rounding** costs 0.3 more, per channel too.

On bench-v0, professionals' planted slips caught at false alarms per 100 words:

| Model | Shipped int8 | Fixed export (`model-fp32.onnx`, 82 MB) | The gates (checkpoint) |
| --- | --- | --- | --- |
| v6 | 96.4% at 0.50 | 97.1% at 0.45 | 97.1% at 0.45 |
| v7 | 96.1% at 0.50 | 96.9% at 0.50 | 96.9% at 0.50 |

The fixed export (riwaya zeroed, full precision) matches the gates exactly, learners' clips included. It runs at the
same speed on the Mac (6.9 ms per second of audio), but not on Cloud Run's x86 (dev, Nov 19 2026; v7, Shuraym's 85 s take,
cold and warm, against the int8 revision just before):

| Per second of audio | int8 | fixed export |
| --- | --- | --- |
| Words & harakat alone: model / CPU | 0.17-0.18 / 0.34-0.35 s | 0.30-0.31 / 0.50-0.53 s |
| Words & harakat: `at` after a word starts (median, p90); done after Stop | 0.47, 0.78 s; 0.54-0.64 s | 0.52, 0.84 s; 0.71-0.73 s |
| Recite alone: model / CPU | 0.15 / 0.25-0.26 s | 0.26-0.27 / 0.37-0.38 s |
| Two Recite takes on one pair instance: `at` (median, p90) | 0.50-0.55, 0.83-0.98 s | 0.67-0.72, 1.07-1.11 s |

Two fixed-export takes saturate the pair's one vCPU (the instance's CPU 1.25 s a second while both ran; lag p90 0.45 s).

How it's switched:
- `stage.sh` copies `model-fp32.onnx` beside each words ear's int8 file when the lab has it.
- `RECITE_EAR_EXPORT=fp32` runs it (`engine.ear_file`; `/health`'s `ears.words_file` says which file runs). The env
  files set it on recite-check only (`ENV_CHECK`), where Mark mistakes runs, one take an instance. The pair (Recite,
  which marks and keeps nothing) stays on int8, so two takes still fit its one vCPU. `dev.env` runs v7's; `prod.env`
  runs v6's from production's next deploy, on Majd's word (his yes, Nov 18 2026: once it was checked on Dev). Rollback:
  drop it from the env file and deploy the same image again, or move traffic back.

**Naming a v6 take's slips on the released model's frames** (Nov 16 2026). Naming (`into`) was measured on the released
model's frames, and on v6's it named far fewer: 139 of bench-v0's 275 planted slips and swapped endings, live (the
released model 188). So a v6 take works out the released model's frames as it goes (`engine.SideFrames`): 8 s chunks
with 2 s of audio either side, each handed to one background thread once its audio is in (`live._side_submit`, at
SCHED_IDLE on Linux, below the hops and the ayah thread), and the runs of marks are decoded again and named on those
with the released model's settings. Live on the Mac: 171 named, 1 wrong (the released model's own), none false, nothing
named on learners' clips; `done` waits only for chunks the thread hasn't reached (the last one: at most 12 s of audio,
and only when a run reaches it), 0 ms median and 81 ms at most on the Mac, so the slowest take's wait after Stop doesn't
move. The thread costs about a fifth of the hops' model time. `done.ms` has `side` (all of it) and `side_wait` (what
`done` waited); health lines `side_per_s`. `RECITE_SIDE_FRAMES=0` names on v6's own frames (`engine.SIMILAR_P_V6`,
134), with no new image.

## What it judges

One recording against a passage (from an ayah to the end of its surah, or to a given ayah), with the lab's
recommended settings. Every bar was set on professional reciters so that about 2% of their correct places are
flagged (`make_bars.py`).

- **Words:** said, skipped, said wrong (a look-alike word, or a sound heard as another), extra words, and speech after
  the passage's last word that isn't the next ayah or a closing.
- **Tajweed**, in each ayah said in full, never next to a word said wrong: madd munfasil, muttasil and aared against
  the reciter's settings (`mon` 2/4/5, `mot` 4/5/6, `aar` 0 = any, 2/4/6), a lazim madd held short, a natural madd
  dropped, qalqalah, ghunnah and ikhfa (with their held time), idgham (with and without ghunnah) and iqlab.
- **Letters and harakat** (`letters=1`, experimental): a letter or haraka heard as another. Off by default: on
  learners it flags too many correct words.

## Record, then check: `POST /check`

`POST /check?s=2&a=6[&s2=2&a2=16][&mon=4&mot=4&aar=0][&letters=1][&tajweed=0][&keep=1][&v=2]`, body a WAV (16 kHz, mono, 16-bit,
at most 4 minutes), `Authorization: Bearer <Firebase ID token>` from revisely-dev. `keep=1` keeps the recording and
the result as test data (below). Refusals: 401 `sign_in`, 403 `testers_only`, 429 `limit` (40 an hour, live sessions
included), 400 `bad_request`.

The answer (`v: 1`): `words` (app word numbers with `status` correct, corrected, wrong or missed, and `kind`:
skipped, replaced, lookalike with `heard`, sound, order), `extras` (`after` a word; `trail` when after the passage's
end), `tajweed` (`w`, `rule`, `got` and `expected` counts for madds), `letters` (`w`, `slip`, or null when not
asked), `ms` (time spent) and `engine` (the checker's commit).

**v2** (`/check?…&v=2`, `engine.check(…, v=2)`, the contract the model, server and UI sessions agreed, Nov 14
2026) keeps every v1 field and adds:

- `marks`: every mark in one list, each with:
  - `id`, `w`, `ayah`;
  - `kind`: word, skipped, added, harakat, letter or tajweed;
  - `detail`: lookalike, sound, replaced, order, trail or shadda;
  - `heard` and `heardExact`: a look-alike is a real word; otherwise the heard sounds spelt in Arabic letters;
  - `slip`: the expected and heard letter or haraka;
  - `rule`, `got`, `expected`: tajweed;
  - `t`;
  - `sure`: `clear` or `likely`;
  - `into` (Nov 15 2026), on the first mark of a run of words skipped or said wrong when they were a similar
    passage's words: `w`, the place's first word said; its `ayah`; and `also`, other ayat with the same words as far
    as heard. With `ending: true`, an ayah's last word said as the last word of an ayah near it in the same surah.
    From the lab's `similar.py` (`Engine.name_slips`, within `similar.P['budget']`); only in the final answer, and the
    app doesn't show it yet.
- `score`: `reached`, `mistakes` (word, skipped, added, harakat and letter marks), `tajweed`, and
  `accuracy` = 1 − mistakes ÷ reached.

How `sure` is decided:
- **Tajweed and letters:** `clear` past a strict bar, set where about 0.5% of professional reciters' correct places
  are flagged (1 in 1,000 words for letters; `strict` in bars.json, from `make_bars.py`). Past the 2% bar alone it's
  `likely`.
- **Madds:** `clear` when 2.5 counts or more off the setting, or a lazim held under 3.5.
- **Words:** a skipped word is `clear` (98% right on bench-v0). The other word kinds stay `likely` until they have a
  measured strict bar.

When kept, the v2 answer also has `take`, the take's name.

`POST /dismiss {"take": "...", "id": "<mark id>", "when": <ms>}` (same sign-in): the person's "Not a mistake", kept
next to the take (`<take>.dismiss-<time>.json`) as a label for the lab. `POST /undismiss` (the same body) undoes it
(Undo, or the summary's Removed list; `<take>.undismiss-<time>.json`, with `"undo": true`). `when` (optional) is the
phone's time of the tap in ms: two labels sent close together, or a retry, can be stored out of order, and the lab
orders them by it. Read a take's labels with `fetch_takes.dismissed_now`: the live `dismissed` list, then these files
in the order they were tapped, the latest for a mark winning, so an undone "Not a mistake" never stays a label. Any id
`engine.marks` makes is taken (before Nov 15 2026 skipped, added and harakat marks were refused).

## Live: `/live` (a WebSocket on the same service)

1. The phone opens `wss://…/live` and sends a start frame first (within 10 s):
   `{"type":"start","token":"<ID token>","s":27,"a":23,"s2":null,"a2":null,"mon":4,"mot":4,"aar":0,"letters":false,"keep":true}`.
   With no `s2`/`a2` the take follows the reciter to the end of the Qur'an (into the next surah too) until `end`; an
   end given is kept (`/check` without one stops at the end of the surah). `done.result.to` is then the end of the
   last ayah reached.
   The token can be in the handshake's `Authorization: Bearer` header instead. `"tajweed": false` turns tajweed off
   (the app's "words and harakat" level; letters as asked). `"follow": true` (or `"mode": "recite"`) is Recite:
   only `ready`, `at`, `said`, `ayah` and `done` come back, words are decided but no mark is made, and `done.result`
   has the words and their statuses only. Sign-in and `previewTester` are checked
   on every socket. A session counts against the 40 an hour; resuming doesn't.
2. The server answers `{"type":"ready","v":2,"engine":"…","server":"…","protocol":6,"take":"<take>","from":0}`.
   `GET /health` says the same `engine` (the checker's commit), `server` (this service's commit) and `protocol` (the
   contract it speaks: 5 = follow, hint, tajweed, premium_required; 6 = start anywhere on the page), and `words`:
   whether the image has the word table for its checker. Never move traffic to a revision whose `words` is false (see
   "The word table").
3. The phone sends PCM (16-bit little-endian, mono, 16 kHz) as binary frames of any size, and as text frames
   `{"type":"seek","w":…}`, `{"type":"dismiss","id":"…"}`, `{"type":"undismiss","id":"…"}` (that dismissal undone:
   the score counts the mark again, and the kept take's `dismissed` leaves it out),
   `{"type":"hint","w":…,"what":"word"|"ayah"}` (the hidden view showed a word, or the rest of its ayah: those
   words, if not yet decided, are `helped`, counted in `score.helped` and flagged in `done.result.words`; a helped word
   said wrong is still a mistake) and finally `{"type":"end"}`. Any other frame is ignored.
4. The server sends `at` (the cursor), `said` (decided up to), `mark`, `unmark`, `ayah` (an ayah's tajweed has all
   come), `score`, and after `end`, `done` with the whole take checked once more (the v2 answer, with `take` and
   `why`; Recite's has the words only, with `marks: []` and `score: null`). `done` goes at once; with keep on, the
   take is then stored and `{"type":"kept","take":…,"ok":true|false}` follows before the server closes the socket
   (the phone needn't wait for it). Every event has `t`, the seconds of the take it was decided at. `error`
   (`sign_in`, `testers_only`, `limit`, `idle`, `bad_request`, `server`, `premium_required`) closes the socket.
5. **`"namesAfter": true`** in the start frame (Nov 16 2026): `done` comes without `into`, and right after it
   `{"type":"into","names":[{"id":<mark id>,"into":{…}}],"t":…}` with where each named slip went (`names: []` when
   nothing is named, Recite's included), before `kept`. Naming is most of the wait after Stop on a long take with
   slips: on the Mac, Stop to `done` went from 356 to 41 ms (alafasy.p8.m1), 421 to 107 (alafasy.p4.m1), 540 to 289
   (husary.p1.m1), with `into` 110–312 ms after it (about five times that on Cloud Run). The kept result has the names.
   Without `namesAfter`, one `done` with the names, as before.

**Start anywhere on the page** (Majd, Nov 14 2026; protocol 6; recite-contract.md has the agreed shape). The start
frame's `s`/`a` stay the page's first ayah, and `"startBy":[sura,ayah]` is its last: the reciter begins at some word
from the first word of `s:a` through the end of `startBy`.
- **The search.** The follower searches that range, plus an ayah either side.
  - Once sure, it sends `{"type":"locked","w":…,"s":…,"a":…,"t":…}`, and nothing (`at`, `said`, marks, `score`) comes
    before it.
  - Words before `w` aren't part of the take: never skipped, not in `done.result.words` or the score.
  - A lock one to three words into its ayah takes back the ayah's words said just before it (`TAKE_BACK`, Nov 20
    2026): those words decoded alone up to the lock word, each heard right, move `w` to the ayah's first word. A word
    not said is never taken back. Lock benchmark: 10 of the 41 starts a word off now right (50:1 ق, 27:1 طس, 56:1 إذا
    among them), none worse.
  - No lock means silence (Majd): nothing is sent, the search goes on, and `done.result.start` is null. Otherwise
    it's the locked `w`.
  - The take's log line says when it locked and how many times, or that it didn't, in numbers only (`start_note`).
- **A hand page-turn:** `{"type":"seek","w":<the page's first word>,"startBy":[sura,ayah]}` searches again, before
  the lock or after it (another `locked`). A `seek` with `w` alone is as before.
- **What the server checks** (server.py): `startBy` must be an ayah from `s:a` to the passage's end, at most
  `START_BY_WORDS` (400) words from `s:a`'s first word (a foldable's two pages), or the socket closes with
  `bad_request`. A seek whose `startBy` isn't `[sura, ayah]` is ignored.
- **Older versions.** A start frame without `startBy` is protocol 5's, unchanged. An older server ignores `startBy`
  and starts at `s:a`, so the phone waits for `locked` only when `ready.protocol` is 6 or more.
  - The server says 6 only when `live.LiveSession` takes `start_by` (`protocol()`). Until the follower has it, the
    server says 5 and ignores `startBy`, whichever of the two is deployed first.
- **Kept takes.** The kept take's request records `startBy`.

**Anywhere in the Qur'an** (Majd approved step 2, Nov 16 2026; protocol 7; recite-contract.md, draft 7).
- `"startIn":"quran"` beside `startBy`: the page is searched first, as above. If it hasn't locked, the follower also
  searches the whole Qur'an, and locks only on a place that is unique and held. `locked` then carries
  `"where":"quran"` (else `"page"`).
- The server passes it on only with `startBy`, and `startBy` keeps its 400-word check (it limits the page, never the
  Qur'an-wide search). The kept take's request records `startIn`.
- The server says 7 only when `live.LiveSession` takes `start_in`. With `start_by` alone it says 6 and ignores
  `startIn`.
- **The cost** is `ms.search_quran`, and the health line has `search_quran_per_s`, `start: "quran"` and `where`. The
  search runs at most every 2 s, in the first 10 s of speech, and stops at 30 s (live.py `QURAN_*`). The index is in
  the word table (`make_words.py --merge`, `table['quran']`, about 4 MB), so it comes with the image.
- **The search is the model session's** (`live.py`, `start_by=(sura, ayah)`).
- **Measuring it:** `cut_take.py` cuts a public bench take to begin at an ayah mid-page, and `live_e2e.py --page
  S:A-S:A` sends it with the page's range and reports where and how soon it locked.
- **The lock benchmark** (Nov 20 2026, after Majd's "it should always find where i am there's no exception"; scripts in
  recite-server's scratchpad `long/lockcases`, results in `long-takes.md` in the shared notes). 3,618 public takes
  through `live.LiveSession`:
  - bench-v0 (8 reciters) from every ayah's start, clean and in babble, and mid-ayah;
  - a 4 s pause before, a false start, 1.25× fast, quiet;
  - every muqatta'at surah's opening and 11 others (Husary and Alafasy from EveryAyah), plain, after the basmala, and
    after the isti'adha and the basmala;
  - refrains the page repeats, starts off the page shown, and Majd's kept takes (no truth: where and when they lock).
- **What it found and fixed:**
  - Before: 142 misses and 33 wrong locks. 70 of 174 muqatta'at openings never locked, 20 locked wrong.
  - After: no miss on the page shown except a take that is only a refrain the page repeats (55:28 alone; with the next
    ayah all 22 refrain takes lock right), and 3 locks two words or an ayah off.
  - Openings lock in 2.5 s (p90 5.8 s). Mid-page starts lock after 5 words (p90 6).
  - The fixes:
    - the longest run heard in order starts the search, and a surah's opening on the page wins as soon as it's heard;
    - a short page-top word needs the next word;
    - the basmala doesn't count in the Qur'an-wide search;
    - the Qur'an-wide fit grows to 35 s, and a long run with one wrong word locks.
  - A timed best-guess lock was tried and dropped: it added 2 wrong locks off the page for one slow take found sooner.

**Check is a Premium feature** (apply-support.md draft 2; Premium is free through "Apply for support"): with
`CHECK_GATE=on`, `/check` and `/live` without `follow` need `entitlements/{uid}.premium` (present, and `until` null or
later; any `source`; the `grants` map beside it is ignored), read like `previewTester` and cached a minute; without it,
403 / `error` `premium_required`. Recite stays free. `previewTester` still gates everything. The gate is off until a
dev account has Premium (`devGrantPremium`); `--update-env-vars CHECK_GATE=on` turns it on. The field read is the
`ENTITLEMENT` setting (default `premium`), the reason `LOCKED` in server.py.

**Limits.** A take is at most 15 minutes (then `done`, `why: "too_long"`). 30 s without a frame from the phone closes
the socket (`idle`). uvicorn pings every 10 s, so a phone gone without closing is noticed within 20 s.

**Beats and piles** (contract draft 9, Nov 20 2026, after Majd's 3-minute take dropped twice and never got an answer):
- `ready` says `"beat": 2`, and every 2 s from then on, from a task of its own, the server sends
  `{"type":"beat","t":…,"rx":…}`: the seconds of audio checked and received. They go out during long work too, so a
  silent socket really is dead (the phone's watchdog resumes), and `sent − t` is the checker's lag. Beats are never
  kept with the take and stop at `done`.
- Audio that piles up (a resume's catch-up, a phone that sent a burst) is checked one second at a time, with its events
  sent between the slices. Before, the pile was one piece of work with nothing sent meanwhile: the 38 s Majd's phone
  resent took the cursor nowhere for its whole length.
- A socket that is gone, or replaced by the phone's next one, stops the work within a slice. What wasn't checked comes
  again with the resume, from `from`. Before, the instance went on through the pile after the socket had closed, and
  Cloud Run gives an instance with no open request almost no CPU: Majd's 38 s took 5 minutes, holding the session.
- Each socket's end is a `socket` health line (below).

**Marks that stay** (contract draft 10, protocol 8; Majd, Nov 20 2026: a mistake's highlight should come at once "and
should stay that way"). `done.result.marks` keeps every mark shown live and not taken back (`live: true` on the ones
the final pass didn't make itself), so a live mark has to be one worth keeping:
- An extra word is shown once it has held 6 hops (`EXTRA_STABLE`).
- A word heard right once isn't marked from a later pass over it: read worse on the way back, jumped once its right
  reading is out of the live window (30 s), or with an extra word after it (`REVISIT_KEEP`). A restart, or a slip into a
  similar ayah that reads as one, used to mark words said right half a minute before, and `done` kept them.
- A word marked skipped, then heard after the word that followed it (a swap), keeps its mark; the final pass names it
  out of order. A word said again in its place after going back over it is `corrected` and taken back, as before.
- Measured on 60 bench-v0 takes with planted mistakes (Words & harakat with letters, recite-server's `markbench2.py`):
  marks the final pass wouldn't have made, kept only because shown, 24 → 1; marks taken back live 36 → 17; planted
  mistakes shown live and kept 502 → 510; no change in how soon marks come.
- `done`'s letters and tajweed for an ayah the closed segments hold whole are worked out before the end (live.py
  `_prejudge`), on the ayah thread while it has nothing live to judge. A 10-minute take's `done` judged 9 ayat again
  at the end: 5.6 s of its 5.7 s on Cloud Run. The answer is the same.

**Resume.** A dropped socket: open a new one and send the start frame again with `"resume":"<take>"` (and a fresh
token). `ready.from` says how many samples the server holds: send the take's PCM from there (and any seek, dismiss or
undismiss at the point of the audio where it was first sent), then carry on. On the same instance (within 2 minutes)
`from` is where the socket dropped. On the other instance it is 0: the server runs the take again, faster than real
time, and since every event depends only on the audio and where each seek, dismissal and undismissal came in it, it
sends the same events again. The phone applies events idempotently (marks by id; `at`, `said` and `score` are snapshots), so a repeat
changes nothing on screen. Right after `ready`, a resume on the same instance also sends what the phone should be
showing (every mark shown, every `unmark`, the `ayah` events, `at`, `said`, `score`): the dropped socket may have
swallowed events of the last audio it was checking, and that audio isn't sent again. The phone keeps the take's PCM for this (it needs it for "play this word" too).
A resume of a take that already ended on this instance (the phone missed `done`) gets `ready` (`from` = every sample)
and the same `done` again, for 2 minutes (with `namesAfter`, then its `into`, waited for if it's still being worked
out); on the other instance it runs again, and the copy already stored stays.

**How it decides** (`live.py`): the lab's live checker (`checker.run_item_live`): every 0.5 s of audio the model runs
on the last 4 s; frames with 1 s of audio after them are final and go to the Viterbi decoder; a word is decided once
it is 0.5 s behind the newest final frame, on the best path over the last 30 s. The cursor also uses the newest
window's provisional frames. Long passages are read in 96-word segments, re-based near each segment's end, from the
last decided word; the next segment's words are built in a helper process. `done` is the final decision of each
segment's whole path, as run_item_live's; its marks and score come from `Engine.marks` and `score`, as /check's. The
model session owns the decision rules (and the constants at the top of `live.py` that are about what gets marked); the
server session owns the streaming around them.

**Testing it.** `python -m unittest discover -s tests` in the staged folder (the build runs it too): the protocol with
the checker stood in, and the live checker on the model (with the lab's bench-v0 take of Al-Fatiha with a planted
wrong word and skip, when it is there). Against the service: `live_e2e.py` streams a bench take at real time and
reports the events and the latencies (an ID token from the notes folder's `recite-server-handover/dev-token.js`).

## Test data

With the app's switch on ("Keep my recitations as test data", on by default for testers), the service writes the WAV
and its result to `recite-tests/<uid>/` in revisely-dev Storage, which no client can read or write
(`storage.rules`). `fetch_takes.py` copies them to the lab on the Mac. **Nobody listens to them**, Majd included:
only the lab's scripts judge them. They never leave the Mac, never go into git and are held out of training. With
the switch off, a recording is checked in memory and nothing is kept.

The logs carry numbers only (seconds of audio, words reached, marks, timings), never a uid, audio or words said.
Firestore's and Storage's URLs hold the uid and requests names the URL in its errors, so their failures are raised as
`auth.Unreachable` (a status, or the kind of error) and `store.Exists` (nothing): until Nov 14 2026 a failed upload
logged the object's name.

## Health (Majd approved Nov 15 2026)

`health.py` prints one JSON line for each of these, which Cloud Run's logging keeps as `jsonPayload` (`health` names
the kind). Cloud Run adds the revision and the instance itself. A line holds no uid, take name, passage, word or audio:
only counts, seconds, levels and reasons (the server tests check it).
- **`take`:** a finished live take or a /check. It holds:
  - `kind`, `level` (`recite`, `harakat`, `strict`, `+letters`), `protocol`, `start` and `locked_s`;
  - `app` (the app's own version tag, only in that shape);
  - `audio_s`, `open_s` (first connect to the end), and `ready_s` (connect → `ready`);
  - `cold` (the instance's first take) and `age_s`;
  - `lag_p50`, `lag_p90`, `lag_max` (seconds from audio arriving to its events going out);
  - `cpu_s` and `cpu_per_s` (the process's CPU, the take's own at one take per instance);
  - `<part>_per_s` from the checker's `ms`. `model_per_s` is also the instance's speed, 0.12–0.27 on Cloud Run's CPUs;
  - `sockets`, `restarted` (a resume this instance didn't have, run again from the first sample), `why`, `marks`, `kept`;
  - `appcheck` (`ok`, `missing`, `bad`, `unreachable`) when `APP_CHECK` is log or on.
- **`instance`:** where a cold start's seconds go. `imports_s` (process start → the server imported), `engine_s` (the
  checker, the model and the word table), `ready_s` (process start → the port opens), `words`, and `bench_ms` (a
  fixed bit of Python, timed: the CPU apart from any take).
- **`refused`** (`route`, `reason`: `sign_in`, `testers_only`, `premium_required`, `app_check`, `paused`, `limit`,
  `bad_request`), **`error`**
  (`route`), **`label`** (a dismiss or an undismiss), and **`dropped`**: a session whose phone went and didn't come
  back here (`at`: `timeout` after RESUME_TTL, or `shutdown`).
- **`socket`:** how each live socket ended: `why` (`done`, `gone`: the phone or the network closed it, `replaced`: the
  phone came back on another socket, `idle`, `ended`), the close `code` (1011 with uvicorn's keepalive timeout, 1006
  when the connection just went), `open_s`, `rx_s` and `checked_s` (audio received and checked on the take by then),
  `behind_s` (received but never checked here), and that socket's `lag_*`.

**The digest** (`digest.py`): the last 7 days of those lines from both services (`recite-check` and
`recite-check-pair`, its rows marked "(pair)"), as Markdown. It covers:
- takes and hours by level;
- cold starts and their wait;
- the lag, and the instance speed;
- resumes, drops, refusals, errors and labels;
- the instance time held, against the free tier (Cloud Run bills an instance while it holds a request and while it
  starts). Per instance, it is the union of the takes' spans, so two takes at once on the pair service count once.

`python digest.py` prints it (gcloud signed in, logging.viewer on revisely-dev); `--post` adds it as a comment on the
issue "Recitation checker health (weekly digest)" (label `recite-health`, made if missing). The workflow
`recite-digest.yml` runs it on Mondays. Schedules run from `main`, and dev's deploy provider takes develop only, so it
signs in with its own read-only provider and account (`RECITE_DIGEST_WIF_PROVIDER`, `RECITE_DIGEST_SA`). Until both
variables exist, it skips with a notice.

## Deploying (revisely-dev only)

`deploy/deploy.sh dev --source DIR` does what follows for both services, with their settings in `deploy/dev.env`
(`--migrate` then moves the traffic and tags the image `serving`). Without `--yes` it prints the commands and calls
nothing. The commands by hand:

The image holds the checker (pinned in `stage.sh`), the app's word list and, from the lab, the model, the lexicon
and the bars. None of those go into git.

```bash
scripts/recite-check/stage.sh /tmp/recite-stage
gcloud run deploy recite-check --project revisely-dev --region us-east1 --source /tmp/recite-stage \
  --service-account recite-check@revisely-dev.iam.gserviceaccount.com \
  --cpu 1 --memory 2Gi --concurrency 1 --min-instances 0 --max-instances 2 --timeout 1200 --cpu-boost \
  --session-affinity --set-env-vars PROJECT=revisely-dev,BUCKET=revisely-dev.firebasestorage.app,THREADS=1,OMP_NUM_THREADS=1 \
  --no-traffic --tag live
# test the tagged revision (https://live---recite-check-fljbshu7ma-ue.a.run.app), then:
gcloud run services update-traffic recite-check --project revisely-dev --region us-east1 --to-latest
```

`--cpu 1` (Nov 14 2026): measured on the e2e set against 2 vCPU, the cursor and the marks move by under 0.1 s
(word start → `at` median 0.67–0.72 s; word end → mark 2.0–4.2 s) and a /check of 118 s takes the same 10–11 s; a live
take uses 25–42% of the one vCPU. It doubles the free tier's hours of live use (about 50 a month).
`THREADS=1` (the model's threads; also the image's and `server.py`'s default, Nov 15 2026): the same image at 2
threads, 15 public takes side by side on Cloud Run, locked within 0.1 s, the cursor and `said` were no sooner, and end →
done was slower on every take (up to 4.1 against 8.1 s): on one vCPU a second thread only competes. With one thread a
replay of a kept take also gives what the phone saw; with two, a borderline take can lock in one run and not the next.
A test revision with other env vars (`--update-env-vars`) changes the service's template too: the next deploy without
`--set-env-vars` inherits it.
`--timeout 1200`: a WebSocket is one request to Cloud Run, so the timeout is a live session's longest (15 minutes of
audio and pauses). With `--concurrency 1` an open socket holds an instance, so two live takes at once at most.
Leave out `--[no-]allow-unauthenticated`: the service is already open (below), and the flag would change that.

A deploy keeps who may call the service. The app signs in with Firebase, not Google IAM, so the service is opened
to the internet once, by Majd (the service checks the ID token and `previewTester` itself):

```bash
gcloud run services add-iam-policy-binding recite-check --project revisely-dev --region us-east1 \
  --member allUsers --role roles/run.invoker
```

It was opened on Nov 13 2026, so later deploys need nothing more. gcloud needs Python 3.10 or later: on Python 3.9 it
crashes loading `gcloud run` (set `CLOUDSDK_PYTHON` to a newer Python, or `gcloud components reinstall`).

Before that (or to test a new revision), call it with a Google identity token in `X-Serverless-Authorization` and
the Firebase ID token in `Authorization`: Cloud Run checks the first and passes the second on.

Its own account (`recite-check@`) may read Firestore (`roles/datastore.viewer`) and create objects in the dev bucket
(`roles/storage.objectCreator` on the bucket), nothing else. Free tier: it scales to zero, at most two instances,
and a check of a minute's recitation takes a few seconds of CPU. The image is about 120 MB of Artifact Registry's
free 0.5 GB; each deploy adds one, so delete old images in `cloud-run-source-deploy` after a few.

## Production (built dark: nothing exists there yet)

The plan is `~/Documents/revisely-release/checker-prod.md`, outside the repository. It covers where the checker runs,
cost, alerts, the kill switches and older app versions. Nothing in it is created or deployed without Majd's word.
What's here for it:
- **Switches on the same image** (`server.py`). Each defaults to what dev's services have always done:

  | Variable | Dev | Production | What it does |
  | --- | --- | --- | --- |
  | `PROJECT` | `revisely-dev` | `revision-buddy-3a398` | whose ID tokens and `entitlements` |
  | `TESTERS_ONLY` | on (unset) | `0` | `previewTester` accounts only |
  | `CHECK_GATE` | off | `on` | Mark mistakes needs `entitlements/{uid}.premium`; Recite needs only a sign-in |
  | `APP_CHECK` | `log` | `log`, then `on` | the app's App Check token (`appCheck` in the start frame, `X-Firebase-AppCheck` on HTTP): counted, then refused without (`app_check`). Needs `PROJECT_NUMBER`. |
  | `BUCKET` | dev's bucket | empty | where kept takes go. Empty: nothing is kept and labels do nothing (`{"ok": true, "kept": false}`). |
  | `PAUSED` | `0` | `0` | `1` refuses new takes with `paused` (503); a take under way finishes, and `/health` says `paused` |

  A wrong `APP_CHECK` (or log or on without a numeric `PROJECT_NUMBER`) stops the service at start, so the deploy
  fails instead of checking nothing. `auth.app_check` verifies the token against App Check's published keys
  (RS256), its issuer and its audience (the project's number). It keeps the keys 6 hours, fetches them again for an
  unknown key at most once a minute, and keeps using them through a short outage at Google.
- **`deploy/`:**
  - `dev.env` and `prod.env`: everything that differs.
  - `deploy.sh`: production takes only an image dev has run, by digest. It is copied into production's repository by
    a Cloud Build in production (`copy-image.yaml`, `gcloud container images add-tag`, which keeps the digest; tried
    between two dev repositories on Nov 16: 16 s, same digest).
  - `setup-prod.sh`: the one-time setup, steps 1–8. It covers the service accounts, the repository and its cleanup,
    the first deploy, opening the services, the budget on label `app=recite-check`, and the error metric with three
    alerts (`alerts/`).
  - All of them only print without `--yes`.
- **The phones' switch:** `config/app.reciteCheckOff` (`functions/scripts/set-app-config.js --recite-check off|on`).
  The app reads it once the release has the code (the release owner's).
- **The digest:** `digest.py --project revision-buddy-3a398` reads production's lines and posts on its own issue (label
  `recite-health-prod`).

## Two takes per instance: `recite-check-pair` (Majd approved Nov 15 2026)

A take holds a whole instance for as long as its socket is open, while Recite and Words & Harakat use about 0.3 of its
vCPU. A second service from the same image takes two of those at once, which halves what their hours cost
(`recite-checker-cost.md` in the shared notes). Strict (about 0.55 of a vCPU, and 20–26 s to its summary when paired)
stays on `recite-check`, one take per instance.
- **The setting:** `LEVELS=recite,harakat`. The service refuses any other level with `level_elsewhere` (409 on /check, an
  error frame on /live), on every socket and every check, and `/health` lists the levels it takes. Unset (as on
  `recite-check`), it takes every level.
- **The app** picks the address by level: Recite and Words & Harakat to the pair service, Strict and anything with
  letters to `recite-check`. After `level_elsewhere`, or if the pair service can't be reached, it uses `recite-check`.
- **Deploy** with `--concurrency 2 --max-instances 2`, the other flags as `recite-check`, and
  `--set-env-vars "^@^PROJECT=revisely-dev@BUCKET=revisely-dev.firebasestorage.app@THREADS=1@OMP_NUM_THREADS=1@LEVELS=recite,harakat"`.
  The `^@^` prefix makes `@` the separator, because `LEVELS` holds a comma. It takes the same image (`--image`, the one
  `recite-check` runs), so it needs no build of its own.
- **Measured on a slow instance** (Nov 15, rev pair-00002, max one instance, so both takes shared one vCPU; the model at
  0.25 vCPU-s per second of audio, near the slowest seen). Two public takes, the second starting 7 s after the first,
  at real time:

  | Level | Cursor p90, alone → paired | `said` p90 | Summary after Stop |
  | --- | --- | --- | --- |
  | Words & Harakat | 1.03 → 1.08 / 1.04 s | 2.52 → 2.56 / 2.34 s | 0.46 → 0.38 / 0.36 s |
  | Recite | 1.03 → 1.05 / 1.00 s | 2.51 → 2.52 / 2.32 s | 0.38 → 0.36 / 0.35 s |

  The same take marked the same alone and paired. The worst hop went from 400 to about 580 ms. Before ayah judging
  moved off the hop, a Words & Harakat pair took 3 s to its summary on a fast instance (Nov 15 morning); now 0.4 s.
- **Words & Harakat with letters doesn't pair.** The app's Words & Harakat sends `letters: true` (level
  `harakat+letters`), so only Recite reaches the pair service today. Measured paired on a slow instance (0.21, Nov 16):
  - the CPU for the pair came to 1.06 of the one vCPU (from the takes' health lines), 3.2× one take's 0.34 instead of
    2×. Without letters, the pair used 0.77, and Recite pairs 0.66;
  - the cursor's p90 went from 1.01 s to 1.30 and 1.36 s, and the worst lag was 2.7 s.

  So `LEVELS` stays `recite,harakat`. The extra cost of letters under contention is open.
- `live_e2e.py --iam-token-file` (`gcloud auth print-identity-token`) reaches it while it isn't open to the internet.

## The word table

The checker works out each word's sounds and look-alikes (`checker.Key.passage`) in pure Python: about 100 ms a word
on Cloud Run, paid by every cold instance for every word a check or a live segment needs. `make_words.py` works them
out once for the whole Quran; `stage.sh` puts the table (`lab/words.bin`, 41 MB) into the image when the dev bucket has
it for the current words key (`engine.words_key()`: a hash of `checker.py`, `bench.py`, the word list, the lexicon and
the phonetizer's version, so a checker change that touches none of them keeps its table). Engine reads words from it
and works out any word itself when there is no table: the same entries either way (a test checks it).

To make it for a new key, deploy first (the job runs the service's image), then:

```bash
IMG=$(gcloud run services describe recite-check --project revisely-dev --region us-east1 --format='value(spec.template.spec.containers[0].image)')
gcloud run jobs deploy recite-words --project revisely-dev --region us-east1 --image "$IMG" \
  --tasks 10 --parallelism 10 --cpu 1 --memory 1Gi --task-timeout 3600 --max-retries 1 \
  --service-account recite-check@revisely-dev.iam.gserviceaccount.com --command python --args make_words.py,--gcs \
  --set-env-vars PROJECT=revisely-dev,BUCKET=revisely-dev.firebasestorage.app,OMP_NUM_THREADS=1
gcloud run jobs execute recite-words --project revisely-dev --region us-east1 --wait
```

About 15 minutes and 8,000 vCPU-seconds (under 5% of a month's free tier). It writes ten slices to
`recite-cache/<key>/` in the dev bucket (no client can reach them); the next `stage.sh` merges them, and the next
deploy carries the table.

So a checker change that moves the words key takes two deploys, both with `--no-traffic`: one for the job's image, then
one with the table. Move traffic only once the tag's `/health` says `"words": true`. Without the table, finding where
a take starts (protocol 6) needs every word of the page at once: on rev 00043 (Nov 15 2026) the worst hops were
27–38 s and the start was found 35 and 61 s after the first word.
