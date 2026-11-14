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
  - `sure`: `clear` or `likely`.
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

`POST /dismiss {"take": "...", "id": "<mark id>"}` (same sign-in): the person's "Not a mistake", kept next to the
take (`<take>.dismiss-<time>.json`) as a label for the lab.

## Live: `/live` (a WebSocket on the same service)

1. The phone opens `wss://…/live` and sends a start frame first (within 10 s):
   `{"type":"start","token":"<ID token>","s":27,"a":23,"s2":null,"a2":null,"mon":4,"mot":4,"aar":0,"letters":false,"keep":true}`.
   The token can be in the handshake's `Authorization: Bearer` header instead. `"tajweed": false` turns tajweed off
   (the app's "words and harakat" level; letters as asked). `"follow": true` (or `"mode": "recite"`) is Recite:
   only `ready`, `at`, `said`, `ayah` and `done` come back, words are decided but no mark is made, and `done.result`
   has the words and their statuses only. Sign-in and `previewTester` are checked
   on every socket. A session counts against the 40 an hour; resuming doesn't.
2. The server answers `{"type":"ready","v":2,"engine":"…","take":"<take>","from":0}`.
3. The phone sends PCM (16-bit little-endian, mono, 16 kHz) as binary frames of any size, and as text frames
   `{"type":"seek","w":…}`, `{"type":"dismiss","id":"…"}`,
   `{"type":"hint","w":…,"what":"word"|"ayah"}` (the hidden view showed a word, or the rest of its ayah: those
   words, if not yet decided, are `helped`, counted in `score.helped` and flagged in `done.result.words`; a helped word
   said wrong is still a mistake) and finally `{"type":"end"}`. Any other frame is ignored.
4. The server sends `at` (the cursor), `said` (decided up to), `mark`, `unmark`, `ayah` (an ayah's tajweed has all
   come), `score`, and after `end`, `done` with the whole take checked once more (the v2 answer, with `take`, `kept`
   and `why`). Every event has `t`, the seconds of the take it was decided at. `error` (`sign_in`, `testers_only`,
   `limit`, `idle`, `bad_request`, `server`) closes the socket.

**Check is paid** (apply-support.md, free through "Apply for support"): with `CHECK_GATE=on`, `/check` and `/live`
without `follow` need `entitlements/{uid}.check` (present, and `until` null or later), read like `previewTester` and
cached a minute; without it, 403 / `error` `check_locked`. Recite stays free. `previewTester` still gates everything.
The gate is off until the entitlements exist on revisely-dev (`--update-env-vars CHECK_GATE=on` turns it on).

**Limits.** A take is at most 15 minutes (then `done`, `why: "too_long"`). 30 s without a frame from the phone closes
the socket (`idle`). uvicorn pings every 10 s, so a phone gone without closing is noticed within 20 s.

**Resume.** A dropped socket: open a new one and send the start frame again with `"resume":"<take>"` (and a fresh
token). `ready.from` says how many samples the server holds: send the take's PCM from there (and any seek or dismiss
at the point of the audio where it was first sent), then carry on. On the same instance (within 2 minutes) `from` is
where the socket dropped. On the other instance it is 0: the server runs the take again, faster than real time, and
since every event depends only on the audio and where each seek and dismissal came in it, it sends the same events
again. The phone applies events idempotently (marks by id; `at`, `said` and `score` are snapshots), so a repeat
changes nothing on screen. Right after `ready`, a resume on the same instance also sends what the phone should be
showing (every mark shown, every `unmark`, the `ayah` events, `at`, `said`, `score`): the dropped socket may have
swallowed events of the last audio it was checking, and that audio isn't sent again. The phone keeps the take's PCM for this (it needs it for "play this word" too).

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

## Deploying (revisely-dev only)

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
