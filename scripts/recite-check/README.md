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

## The request

`POST /check?s=2&a=6[&s2=2&a2=16][&mon=4&mot=4&aar=0][&letters=1][&keep=1]`, body a WAV (16 kHz, mono, 16-bit,
at most 4 minutes), `Authorization: Bearer <Firebase ID token>` from revisely-dev. `keep=1` keeps the recording and
the result as test data (below). Refusals: 401 `sign_in`, 403 `testers_only`, 429 `limit` (40 an hour), 400
`bad_request`.

The answer (`v: 1`): `words` (app word numbers with `status` correct, corrected, wrong or missed, and `kind`:
skipped, replaced, lookalike with `heard`, sound, order), `extras` (`after` a word; `trail` when after the passage's
end), `tajweed` (`w`, `rule`, `got` and `expected` counts for madds), `letters` (`w`, `slip`, or null when not
asked), `ms` (time spent) and `engine` (the checker's commit).

**v2** (`engine.check(…, v=2)`, the contract the model, server and UI sessions agreed, Nov 14 2026) keeps every v1
field and adds:

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

## Live (`engine.LiveSession`)

The model side of `/live`. The server wraps it in the WebSocket.

```python
L = engine.LiveSession(engine, s, a, s2=None, a2=None, raw_settings={'mon': 4, 'letters': '0'})
events = L.feed(int16_pcm)   # any chunk size; at, said, mark, unmark, ayah, score
L.seek(w)                    # the reader turned the page or went back an ayah
events = L.dismiss(mark_id)  # Not a mistake: a new score
done = L.end()               # the whole take checked once more: the v2 answer (marks replace the live ones)
```

How it runs: the lab's live checker (`checker.run_item_live`), fed as audio arrives.
- Every 0.5 s the model runs on the last 4 s. A frame is final once it has 1 s of audio after it, and a word is
  decided once it's 0.5 s behind the newest final frame.
- The cursor also uses the newest window's provisional frames.
- An ayah said in full gets its tajweed and letter marks when its last word is decided.
- **The moving window.** It reads against 80 words at a time (`LIVE_WORDS`), and moves the window on to the next
  ayah once 40 words are decided and an ayah has ended. Each window gets a new decoder, which stores a row per
  frame for every state of its window: 300 words over 15 minutes would take 1.2 GB.
- `end()` judges each window once more on the frames it streamed (`Engine.judge`), with no second model run.

Measured on bench-v0 and the smoke take (Mac, 2 threads):
- the cursor 0.6 s after a word starts (median);
- word marks about 3.5 s after the word;
- every planted mistake on three recordings caught;
- compute about 6% of real time, with no 100 ms chunk over 0.1 s;
- `end()` 0.5–1.7 s for 37–104 s of audio, 3.5 s for 6 minutes;
- 6 minutes of Ya-Sin ran in three windows and peaked at 590 MB for the whole process. The step that moves the
  window takes about 1 s, because it builds the next window's graph.

A take is at most 15 minutes (`LIVE_MAX_SECS`; `feed` raises `BadRequest('too long')` past it). `try_live.py` streams
a WAV through it.

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
  --service-account recite-check@revisely-dev.iam.gserviceaccount.com --no-allow-unauthenticated \
  --cpu 2 --memory 2Gi --concurrency 1 --min-instances 0 --max-instances 2 --timeout 120 --cpu-boost \
  --set-env-vars PROJECT=revisely-dev,BUCKET=revisely-dev.firebasestorage.app,THREADS=2
```

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
