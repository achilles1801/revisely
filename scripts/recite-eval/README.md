# Recitation evaluation harness

Measures recitation following and mistake detection on recordings whose words, mistakes and
non-mistakes are known, so that "better" is a number. It runs the app's own code (the segmenter and
the tracker in `src/lib/recite`) under Node, with speech recognition done on the Mac by the same
engine the phone uses (whisper.cpp v1.9.3 = whisper.rn 0.7.4, same decoding settings).

Nothing large lives in the repo. Audio, models and results go to `~/revisely-mistake-lab/` (or
wherever `--out`, `--run` point). The recordings are for evaluation only and are never committed.

## Pieces

| Step | Script | What it does |
| --- | --- | --- |
| 1 | `bench.py` | Builds the benchmark from quran.com's per-ayah audio and per-word timings: clean recordings, recordings with planted mistakes (word left out, said as another word, extra word, two words swapped, ayah left out, ayah carried on as a similar ayah elsewhere) and non-mistakes (going back a few words, repeating an ayah), each also with babble noise at 10 dB SNR. |
| 1a | `bench.py --short 2 --out …/bench-v0-short` | Short ayah ranges (1–3 ayat, starting mid-passage), as someone who memorized only those ayat recites them: the replay listens from the first memorized word and ends after the last (`start_at`, `stop_at`). |
| 1b | `learners.py` | Held-out learner recordings (RetaSy, non-Arabic speakers, labelled correct / in_correct per recording). |
| 2 | `segment.ts` | Streams each recording through the app's segmenter in 100 ms buffers and saves every clip it would decode (partials and finals), named by hash. `--lib` points at another checkout's `src/lib/recite` to measure that version. |
| 3 | `decode_whisper.py` | Decodes the clips with a whisper.cpp model through `whisper-server` and caches text and decode time per clip. |
| 3b | `oracle.py` | "Perfect hearing": the words truly in each clip, to separate the tracker's own errors from the model's. |
| 4 | `replay.ts` | Feeds the texts to the app's tracker the way `ReciteSession` and `StreamingRecognizer` do, simulating the one-clip-at-a-time queue with measured decode times (`--speed` scales them for a phone). |
| 5 | `score.py` | Compares with the ground truth. |

`run.sh` does steps 2 to 5 for one engine.

`checker.py` is the other engine: phase 3's first checker, which replaces steps 2 to 4 (below).

## Metrics

- **False alarms per 100 words**: correct words flagged wrong or missed (still flagged at the end).
  The number that matters most: false alarms are what make users stop trusting the feature. Words
  within one word of a planted mistake are not counted (a flag there is the mistake found a word off).
- **Clean passes**: clean recordings with no false alarm at all.
- **Recall**: planted mistakes caught. *Strict* is the mistaken word itself flagged (at least half
  the words for a skipped ayah or a wrong continuation); *near* allows a flag one word away. Extra
  words (`ins`) are reported separately: the tracker has no way to report them.
- **Follow**: coverage (words reached), lag (word first shown minus the end of the word), early
  reveals (a word shown before the reciter began it: bad in hidden mode).
- **Latency**: when a mistake was flagged minus when it happened.
- **Learners**: share of recordings labelled correct that got any flag (false alarm), and of those
  labelled in_correct that got one.

## Setup (once)

```bash
scripts/recite-eval/setup.sh   # ~/revisely-mistake-lab: Python 3.12 venv (uv), whisper.cpp v1.9.3 with Metal
curl -o ~/revisely-mistake-lab/models/ggml-tarteel-whisper-base-q5_1.bin \
  https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/models/ggml-tarteel-whisper-base-q5_1.bin
```

The model is the app's own (sha256 acc1f03c…6536).

Node needs the repo's `node_modules` (sucrase). In a worktree under `.claude/`, Jest ignores tests
by path; these scripts don't use Jest.

## Run

```bash
PY=~/revisely-mistake-lab/.venv/bin/python
$PY scripts/recite-eval/bench.py                       # ~1.2 GB, 240 items, 10.9 h
$PY scripts/recite-eval/learners.py                    # needs the RetaSy parquet files
scripts/recite-eval/run.sh develop tarteel-base-q5_1 ~/revisely-mistake-lab/models/ggml-tarteel-whisper-base-q5_1.bin
```

Clips (`<run>/clips`) are a cache: once a run is decoded and replayed they can be deleted (16 h of bench
audio makes ~14 GB of clips, partials included). `segment.ts` rewrites them in seconds when another engine
needs to decode them.

## The checker (phase 3, v0)

`checker.py` listens for sounds instead of writing words. A small CTC phoneme model (HisnLabs tajweed-v2,
int8 ONNX, 23 MB, in `~/revisely-mistake-lab/models/`) gives 50 frames a second of sound probabilities.
quran_transcript's phonetizer writes what each word should sound like, in four forms: joined to both
neighbours, started after a pause, stopped on, and alone. One Viterbi pass over a graph of the passage's
words then decides: next word, a skip (missed), a jump back (a repeat, not a mistake), or a filler that
hears anything (an extra word, or a word replaced). Each word reached is then checked sound by sound
against what the model heard: a different sound heard with confidence, most sounds not heard, or a poor
fit overall marks it wrong.

```bash
PY=~/revisely-mistake-lab/.venv/bin/python; LAB=~/revisely-mistake-lab
$PY -I scripts/recite-eval/checker.py --bench $LAB/data/bench-v0 --run $LAB/runs/v0 --name checker.v0 --jobs 10
$PY scripts/recite-eval/score.py --bench $LAB/data/bench-v0 --run $LAB/runs/v0 --results checker.v0 --by condition
```

- Look-alike words: each word also has up to 4 near-identical words of the Qur'an as alternatives (وَمَا for
  وَمَن), from `cache/lexicon.json` (every distinct word and how it sounds alone; `checker.py --lexicon` builds
  it once, ~40 s). Hearing one instead of the word marks it wrong, with the word heard. `alts: 0` turns it off.
- `--params '{"sound_rule": "off"}'`: words only (said, skipped, extra, out of order).
- `--params '{"sub_p": 1.01}'`: words, plus words that clearly don't match (no single-letter judgements).
- The model's output is cached per recording (`<run>/logprobs/hisn/`), so a rerun with other settings takes
  about a minute for the whole bench.
- `--live`: as the app would. The model runs every `hop` (0.5 s) on the last `win` seconds (4 s) and keeps
  the frames with `look` seconds (1 s) of audio after them; the checker takes each step's new frames and
  decides a word once it is `commit` seconds (0.5 s) behind the newest frame. Flags are timed when they
  would show, and a flag later taken back still counts (score.py's fa-ever). Without `--live`, decisions
  are made on the whole recording and the times are estimates (word end + `delay`).
- `record_bench.py` turns volunteers' recordings from revisely.app/record (downloaded from the owner's
  private Drive folder) into a bench, with each item's truth from the page's own script.
- Settings were tuned on four reciters (Abdul Basit mujawwad, Shuraym, Alafasy, Husary) and checked on the
  other four. The model was trained on EveryAyah and RetaSy, which overlap both test sets, so every number
  here is optimistic until recordings it has never heard (revisely.app/record) are in.

## The three modes (Nov 10)

Write-up: `~/Documents/revisely-mistake-detection/three-modes-nov10.md`.

- **Words** (`checker.py`): `alt_rule: "skeleton"` drops look-alikes with the same consonants as the word (ٱلدِّينِ
  heard as دِينِ, مَـٰلِكِ as مَلِك differ only in shadda or madd: that is for the letters check). With `del_frac: 0.67`
  this is the recommended words + wrong words setting: `{"sub_p": 1.01, "alt_rule": "skeleton", "del_frac": 0.67}`.
- **Follow along**: `follow_madd.py` (part a: first-shown lag by the word's longest madd, from saved results; part b:
  where the highlight is at every step vs the word being said) and `follow_live.py` (the highlight from final frames
  vs one that also uses the newest window's provisional frames).
- **Letters and harakat** (`letters.py`): each word against versions with one named slip (a confusable letter,
  another haraka, a shadda or madd dropped, a vowel lengthened), scored by CTC on the word's frames; a slip is
  flagged when it beats the correct word by a margin. `letters_eval.py` sets thresholds on professionals and reports
  learners and qdat.
- **Tajweed** (`tajweed.py`): slots from the phonetizer's own tags (every madd with its length, every qalqalah) and
  its sounds (ikhfa ں/۾, a doubled ن or م held), each judged by scoring its versions on a window around it, plus the
  held time against the reciter's count.
- **qdat_bench** (obadx/qdat_bench, Apache-2.0: 159 learners reciting 5:109 from قَالُوا۟, experts' madd lengths,
  ghunnah, ikhfa and qalqalah labels): put `train.parquet` in `$LAB/data/raw/qdat_bench/`, then
  `qdat_eval.py --prepare`; `qdat_eval.py --ear hisn|muaalem` (the slots of that ayah written by hand, decided
  together), `qdat_curves.py` (catch rate at fixed false flags), `qdat_tajweed.py hisn ecount 0` (the same through
  `tajweed.py`; writes the thresholds `pros_tajweed.py` uses on the professionals).
- `learner_flags.py NAME`: which rule flags the learners' recordings in a run.

## Fine-tuning the small model on planted mistakes (Nov 10, free, on the Mac)

Write-up: `~/Documents/revisely-mistake-detection/free-finetune-v1.md`.

- `hisn_torch.py`: HisnLabs tajweed-v2 in PyTorch (`model.safetensors`, Apache-2.0) with the same interface as
  `checker.Hisn`; pads 0.4 s of silence either side as HisnLabs' own inference does.
- `train_prep.py`: training clips from Muaalem's dataset (obadx/muaalem-annotated-v3, MIT). Download shards to
  `$LAB/data/raw/muaalem/` (`fetch.sh` there takes one shard from each of 12 moshafs whose reciters are not in our
  tests), then this lines each clip's labels up with the model's output.
- `augment.py`: planted slips with labels changed to match (madd 0–6 counts by WSOLA stretch, ghunnah cut, ikhfa →
  a clear ن from the same clip, qalqalah muted, confusable letter or haraka swapped, plus edits that change nothing).
- `train.py --steps 5000 --out $LAB/models/ft-v1`: CTC on the phoneme head, on MPS, about 25 minutes.
- `eval_ft.sh NAME [CHECKPOINT]`: every test for one model (`hisn` = the current one) into `$LAB/runs/eval.NAME.txt`;
  `slip_check.py base CKPT`: planted slips on held-back clips (a sanity check, not a real test).
- `checker.py --ear NAME [--ckpt PATH]` reads (or makes) that model's outputs.

## Free v2 and v3 (Nov 10, evening)

- **Madd by timing** (`madd_timing.py`, `tajweed.madd_count`): a madd's length is the time from its haraka to the
  next letter, measured in the reciter's short syllables. It goes through a curve, `count = 2·(t/2)^0.6`, because
  professionals hold a 6-count madd about 6 times as long as a 2-count one. The curve is fitted on professionals
  (`pros_tajweed.py`) and averaged with the model's count. Nothing is fitted on qdat. An ayah too short to measure
  the pace (يسٓ) takes the pace from the rest of the recording.
- **Clear mistakes and consistency** (`tajweed.madd_dropped`, `tajweed.taswiyah`): a natural madd dropped (timing
  and model agree), and a madd far from the reciter's own length for its kind.
- **Voices** (`voices.py`): women's and children's voices made from the training clips with WORLD (pyworld). Pitch
  moves to qdat learners' range and formants go up; timing is unchanged, so labels and slips stay valid.
- **A phone in a room** (`augment.channel`): reverb, a phone microphone's band, babble or noise, gain.
  `train.py --voice_p --chan_p --fmask --init --data`.
- **Letters v2** (`letters_v2.py`): keeps every slip's margin. A shadda counts as missing only when it was held
  short. Per-pair thresholds were tried and were worse; one bar stays.
- **Tadabur** (`tadabur_fetch.py`, `tadabur_label.py`): a slice of FaisaI/tadabur (600+ reciters, one ayah per
  file), with bench-v0's reciters dropped. Its `surah_id` counts from 0. Pass 1 measures each reciter's madd lengths;
  pass 2 labels their ayat with them. Sources are listed in `$LAB/data/SOURCES.md`.
- `eval_v2.sh NAME [CKPT]`: tajweed, madd timing, the professionals and letters for one model, into
  `runs/eval2.NAME.txt`.
