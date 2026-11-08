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
| 1b | `learners.py` | Held-out learner recordings (RetaSy, non-Arabic speakers, labelled correct / in_correct per recording). |
| 2 | `segment.ts` | Streams each recording through the app's segmenter in 100 ms buffers and saves every clip it would decode (partials and finals), named by hash. `--lib` points at another checkout's `src/lib/recite` to measure that version. |
| 3 | `decode_whisper.py` | Decodes the clips with a whisper.cpp model through `whisper-server` and caches text and decode time per clip. |
| 3b | `oracle.py` | "Perfect hearing": the words truly in each clip, to separate the tracker's own errors from the model's. |
| 4 | `replay.ts` | Feeds the texts to the app's tracker the way `ReciteSession` and `StreamingRecognizer` do, simulating the one-clip-at-a-time queue with measured decode times (`--speed` scales them for a phone). |
| 5 | `score.py` | Compares with the ground truth. |

`run.sh` does steps 2 to 5 for one engine.

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
