"""The recitation check: the lab's checker (scripts/recite-eval, pinned in deploy.sh) on one recording.

Words: which word was said, skipped, said wrong or added (the checker's word graph, the lab's recommended settings).
Tajweed, per ayah said in full: madd lengths against the reciter's settings, a lazim madd held short, a natural madd
dropped, qalqalah, ghunnah and ikhfa (with their held time), idgham and iqlab. Letters and harakat (experimental,
off unless asked). Every bar was set on professional reciters so that about 2% of correct places are flagged
(bars.json, from make_bars.py in the lab).

Each take runs one model, chosen by its level (Engine.level): v6 for Recite and Words & harakat, the released model
for Strict (with v5 for qalqalah, lazim madd and the nasal places). Each model has its own bars and word settings.
"""
import hashlib
import json
import os
import pathlib
import pickle
import sys
import threading
import time

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
os.environ.setdefault('LAB', str(HERE / 'lab'))
HARNESS = pathlib.Path(os.environ.get('RECITE_HARNESS', HERE / 'harness/scripts/recite-eval'))
sys.path.insert(0, str(HARNESS))

import checker  # noqa: E402
import letters_v2  # noqa: E402
import nasal_rules  # noqa: E402
import similar  # noqa: E402
import tajweed  # noqa: E402

FPS = checker.FPS
# order_again (harness aba03414; an older harness ignores it): a word is out of order only if the later word isn't
# heard again after it. Going on into a like ayah and coming back (2:6 said as 3:91, whose "لهم عذاب" pulls the path to
# 2:7's "ولهم عذاب") marked the right ayah after it wrong as a swap. bench-v0: v7 0.50 -> 0.43 false alarms per 100
# words, v6 0.45 -> 0.39, every catch the same (swaps 97.0%); learners, hesitations, corrections and /record the same
# back_prev / back_far (harness 3909c4e6; Majd, Nov 20 2026: after a breath a reciter goes back "the last few words I
# recited, and then that verse in general, and then the previous verse"): a repeat into the ayah before the one being
# recited costs 1 more, two or more ayat back 6 more. With a flat cost, going back 17 words into 2:11 («وَإِذَا قِيلَ
# لَهُمْ», «قَالُوا») tied with going back 2 in 2:13: restart bench p1, jumps away 4 -> 0; bench-v0 and learners' marks
# the same in all 360 takes. back_max 30 -> 60: a restart from Ayat al-Kursi's 47th word to its start is followed in 7
# of 8 (5 before), marks on those takes 3 -> 1, catches the same (models session, recite-feedback-nov20.md, 5).
WORDS_P = dict(checker.DEFAULTS, sub_p=1.01, alt_rule='skeleton', del_frac=0.67, order_again=True,
               back_prev=-1.0, back_far=-6.0, back_max=60)
MAX_WORDS = 300  # a passage longer than this is cut at the end of an ayah
PAD = 15  # frames either side of an ayah's words when judging its tajweed
SAID = ('correct', 'corrected', 'wrong')
MADD_RULES = {'Monfasel Madd': 'madd_munfasil', 'Mottasel Madd': 'madd_muttasil', 'Aared Madd': 'madd_aared'}
NASAL_RULES = {'idgham': 'idgham', 'idgham, no ghunnah': 'idgham_no_ghunnah', 'iqlab': 'iqlab'}
CHOICES = {'mon': (2, 4, 5), 'mot': (4, 5, 6), 'aar': (0, 2, 4, 6)}  # aar 0: any length (the reciter's choice)
DEFAULT = {'mon': 4, 'mot': 4, 'aar': 0}
# v2 marks (recite-contract.md): the kinds that count against accuracy; tajweed is counted apart
MISTAKE_KINDS = ('word', 'skipped', 'added', 'harakat', 'letter')
# `sure` until each kind has a measured strict bar: on bench-v0's professional reciters a skipped word flagged is
# right 98% of the time; a look-alike, a sound said wrong or a word out of order 57–67% (planted mistakes vs correct
# words flagged), so those stay `likely`
CLEAR_WORD_KINDS = ('skipped',)
MADD_CLEAR_OFF = 2.5  # a madd this many counts from its setting is `clear` (flagged from 1.5)
LAZIM_CLEAR_UNDER = 3.5  # a lazim madd held under this is `clear` (flagged under 4.5)
HEARD_REACH = 20  # frames (0.4 s) either side of a word read for what was heard instead
NAME_MAX = 0.1  # a word said instead is named only when at most this share of its sounds differs from what was heard
# spelling the model's sounds in Arabic letters, for `heard` when what was said isn't a word
SOUND_SIGNS = set('ڇۜـؙ۪۾')  # the model's own tajweed signs: not letters
SOUND_LETTER = {'ں': 'ن', 'ٲ': 'ا'}
LONG_VOWEL = {'ا': 'ا', 'ۥ': 'و', 'ۦ': 'ي'}
HARAKAT = 'َُِ'
SHADDA = 'ّ'
CUT_MARGIN = 5  # frames kept either side of a cut in an ayah's frames (ayah_pieces)


def ayah_pieces(ws, spans, readings, n_frames):
    """The frame ranges an ayah (its words ws, in order) is judged on, joined in order. Without readings, or with no
    word said more than once, one range: the first word's start to the last word's end, PAD either side. With a word
    said again (spans cover every reading of a word, readings only its last), the ranges follow each word's last
    reading and cut out the gap before each word that had an earlier reading: the first go of a restart and its
    pause, which lined up with sounds said once read as mistakes (12 professional takes with 24 restarts spliced in:
    14 marks at words and harakat, 26 in Strict, Nov 14 2026)."""
    one = [(max(0, spans[ws[0]][0] - PAD), min(n_frames, spans[ws[-1]][1] + PAD))]
    if not readings or any(w not in readings for w in ws):
        return one
    again = [w for w in ws if spans[w][0] < readings[w][0]]  # said before its last reading
    if not again or any(readings[b][0] < readings[a][1] - 2 for a, b in zip(ws, ws[1:])):
        return one  # nothing said again, or last readings out of order (a jump the window can't follow)
    pieces, start = [], readings[ws[0]][0] - PAD
    for a, b in zip(ws, ws[1:]):
        # the gap before b holds b's earlier reading (it began after a's last one ended): cut it. A word said again
        # straight after the restart (its earlier reading is before a's) needs no cut of its own.
        if b in again and spans[b][0] >= readings[a][1] - 2:
            pieces.append((start, readings[a][1] + CUT_MARGIN))
            start = readings[b][0] - CUT_MARGIN
    pieces.append((start, readings[ws[-1]][1] + PAD))
    return [(max(0, x), min(n_frames, y)) for x, y in pieces if min(n_frames, y) > max(0, x)]


def spell(sounds):
    """The model's sounds written in Arabic letters, close to how they'd be spelt: a doubled consonant once with a
    shadda, a long vowel as one letter, the model's own signs left out. Approximate (`heardExact: false`)."""
    out, i, n = [], 0, len(sounds)
    while i < n:
        c = SOUND_LETTER.get(sounds[i], sounds[i])
        if c in SOUND_SIGNS:
            i += 1
            continue
        j = i + 1
        while j < n and SOUND_LETTER.get(sounds[j], sounds[j]) == c:
            j += 1
        if c in LONG_VOWEL:
            out.append(LONG_VOWEL[c])
        elif c in HARAKAT:
            out.append(c)
        else:
            out.append(c + (SHADDA if j - i >= 2 else ''))
        i = j
    return ''.join(out)


def plain_word(text):
    """A word without harakat, marks or alef forms: for telling whether two spellings are the same word."""
    import re
    text = re.sub(r'[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]', '', text or '')
    return text.translate(str.maketrans({'ٱ': 'ا', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ى': 'ي', 'ة': 'ه'})).replace(' ', '')


def slip_of(why):
    """'ص→س' -> {'expected': 'ص', 'heard': 'س'}; 'no shadda on ل' -> {'expected': 'لّ', 'heard': 'ل'}."""
    if why.startswith('no shadda on '):
        c = why[len('no shadda on '):]
        return {'expected': c + SHADDA, 'heard': c}
    if '→' in why:
        a, b = why.split('→', 1)
        return {'expected': a, 'heard': b}
    return None


UNCLEAR_KINDS = ('harakat', 'letter')  # a `likely` one is "Not clear: say it more clearly", not a mistake


def unclear(m):
    """A harakat or letter mark the ear isn't sure of (Majd, Nov 15 2026: unclear is not the same as wrong; someone
    not reciting clearly can sound wrong without being wrong)."""
    return m['kind'] in UNCLEAR_KINDS and m.get('sure') == 'likely'


def score(statuses, marks, dismissed=()):
    """reached: from the first word recited to the furthest heard, skipped words included; mistakes: word, skipped
    and added marks, and harakat and letter marks the ear is sure of, not dismissed; unclear (harakat and letter marks
    it isn't sure of) and tajweed counted apart; accuracy = 1 - mistakes / reached (recite-contract.md, The score)."""
    said = [w for w, s in statuses.items() if s in ('correct', 'corrected', 'wrong', 'missed')]
    reached = (max(said) - min(said) + 1) if said else 0
    live = [m for m in marks if m['id'] not in dismissed]
    mistakes = sum(1 for m in live if m['kind'] in MISTAKE_KINDS and not unclear(m))
    return {'reached': reached, 'mistakes': mistakes, 'tajweed': sum(1 for m in live if m['kind'] == 'tajweed'),
            'unclear': sum(1 for m in live if unclear(m)),
            'accuracy': round(max(0.0, 1 - mistakes / reached), 4) if reached else 1.0}


class BadRequest(ValueError):
    pass


def settings_of(raw):
    """Madd lengths (munfasil, muttasil, aared) from the request, each one of its allowed counts (DEFAULT if not)."""
    out = {}
    for k, allowed in CHOICES.items():
        try:
            v = int(raw.get(k, DEFAULT[k]))
        except (TypeError, ValueError):
            v = DEFAULT[k]
        out[k] = v if v in allowed else DEFAULT[k]
    out['letters'] = str(raw.get('letters', '0')) == '1'
    # tajweed (madd lengths, qalqalah, ghunnah, ikhfa, idgham, iqlab): on unless tajweed=0. The app offers two levels
    # (Majd, Nov 14 2026): words and harakat (letters=1, tajweed=0), and strict (letters=1, tajweed=1)
    out['tajweed'] = str(raw.get('tajweed', '1')) != '0'
    return out


def heard_sounds(spans, toks, vocab):
    """What was heard for each word: the sounds from the end of the word before to the start of the word after (the
    path often gives a word said wrong only a sliver of its own time), at most HEARD_REACH frames either side of the
    word. spans: word -> (first frame, last frame); toks: checker.heard_tokens on the same frames."""
    order = sorted(spans)
    heard = {}
    for k_, w in enumerate(order):
        w0, w1 = spans[w]
        a_ = spans[order[k_ - 1]][1] if k_ > 0 else w0
        b_ = spans[order[k_ + 1]][0] if k_ + 1 < len(order) else w1
        a_ = min(w0, max(a_, w0 - HEARD_REACH))
        b_ = max(w1, min(b_, w1 + HEARD_REACH))
        heard[w] = ''.join(vocab[k - 1] for k, pk, _ in toks if a_ <= pk < b_)
    return heard


# ------------------------------------------------------------ the word table (make_words.py)

def words_key():
    """What a word's checker entry (Key.passage) depends on: the checker's and the word list's code and data, the
    lexicon, the phonetizer's version and the service's look-alike settings. A table made under another key is not
    used."""
    import importlib.metadata
    h = hashlib.sha256()
    for p in (HARNESS / 'checker.py', HARNESS / 'bench.py', HARNESS.parent.parent / 'src/data/quranWords.dat',
              pathlib.Path(os.environ['LAB']) / 'cache/lexicon.json'):
        h.update(p.read_bytes() if p.exists() else b'-')
    h.update(importlib.metadata.version('quran-transcript').encode())
    h.update(json.dumps([int(WORDS_P['alts']), WORDS_P['alt_rule']]).encode())
    return h.hexdigest()[:16]


def load_table(path):
    if not path.exists():
        return None
    t = pickle.loads(path.read_bytes())
    if t.get('key') != words_key():
        print(f"{path.name} was made for other words ({t.get('key')}, not {words_key()}): not used", file=sys.stderr)
        return None
    return t


# Naming slips with gap_back on (name_slips): each run of marks is decoded again without it, over NAME_AROUND words
# before and after the run (runs closer than NAME_JOIN words together), with NAME_PAD frames of audio either side
NAME_AROUND = (3, 6)    # (bench-v0, naming through the engine: 108/111 slips into a similar ayah, 80/164 swapped
NAME_JOIN = 6           # endings, none false; with the checker before gap_back 107 and 76)
NAME_PAD = 25
# Work for re-decoding a take's runs for naming, in frames x (graph states + NAME_STATE_COST): a run's decode takes
# ~15 ns a unit on the Mac (fitted on 826 decodes of bench-v0, bench-endings and recite-server's cut takes), ~3.3x that
# on Cloud Run. A run whose decode doesn't fit what is left is skipped (a later, smaller one may still fit), so the
# answer is the same on any machine. 25 M units: ~0.4 s on the Mac at most. bench-v0's takes need 4 M (median), 16 M
# (p90), 27 M (most), and name the same as with no bound (the released model 188 of 275 slips and endings, v6 134;
# 15 M: 169 and 116); ms.similar on the Mac at most 0.5 s. Before (8,000 frames whatever the graph), recite-server's cut
# take with 41 runs joined into one 160 s run (100 M units) waited 5.4 s after Stop on Cloud Run; now it isn't decoded
# again (2 ms).
NAME_WORK = int(os.environ.get('NAME_WORK', 25e6))
NAME_STATE_COST = 2000

V5_KINDS = ('Qalqalah', 'Lazem Madd')  # tajweed.judge kinds judged on the strict ear (v5) when it is there; and the
# nasal places (idgham, idgham without ghunnah, iqlab). Lab, Nov 11 2026: v5 caught idgham / idgham without ghunnah /
# iqlab 97 / 85 / 98% (released 85 / 47 / 66), flagged 1% of correct learners' qalqalah (7%), and judged no lazim madd
# of a professional short in loud babble (14%); it is worse at ghunnah, ikhfa, words and letters, which stay on the
# released model.
STRICT_EAR = 'models/tajweed-v5/model-int8.onnx'
STRICT_BARS = 'bars.v5.json'
# Recite and Words & harakat on v6 (Nov 16 2026): the small model fine-tuned again with women's and children's voices
# drawn 3× and distilled from the large teacher (lab: models/ft-v6, export_onnx.py). Lab, same checker (7c12824d), on
# learners' clips at the released letters bar: correct clips marked 24.1 / 18.3% (men / women; released 39.8 / 30.5);
# at equal false marks (~21%) it catches ~55% of mistaken clips (released ~49%). It passes the women's check
# (default_level.py --by-gender) for words and letters, and fails it narrowly for one tajweed rule (noon mushaddadah's
# length, women's correct places 6.5%, men's 0/26), so it never judges tajweed: Strict stays on the released model and
# v5. A take runs one model, so the CPU per take doesn't grow. RECITE_WORDS_EAR=0 keeps every level on the released
# model (no new image needed to go back); RECITE_WORDS_EAR=v7 runs them on v7 (below) when the image carries it.
WORDS_EAR = 'models/words-v6/model-int8.onnx'
WORDS_BARS = 'bars.v6.json'
# v6's word settings (lab, Nov 16 2026, checker 7c12824d; the released model's results in brackets). v6 is surer of what
# it hears, and hears much of what doesn't fit as blanks, which a word takes in for free. So a look-alike word costs
# less to hear (alt_pen -2, not -5): bench-v0's professionals, substitutions caught 84 -> 93% (94%). Speech between
# words costs less (fill -0.4, not -0.5) and an extra word may be 0.3 s long (not 0.35): a word added after one that
# ends the same was taken in by the word before (inserted words 86 -> 93%, 94%). Planted slips caught 97.1% (97.4%);
# false alarms 0.45 per 100 words (0.40), 0.19 in quiet (0.20); correct takes with none 145 of 180 (140). /record 5 of 6
# slips, no false alarm (6 of 6, 5 in 3 takes); planted hesitations marked 1 of 120 (3), corrections 6 of 108 (6).
# Learners' correct clips with a word mark 9.7% (14.5%), mistaken 32.4% (38.6%). The page scorecard, live: correct
# quiet pages marked 20% (23%), mild babble 20% (37%), loud 57% (73%); planted slips caught 95% (99%). alt_pen -3 marked
# fewer (0.36 per 100 words) and caught fewer (live 92%). Not taken: the sound rule (sub_p 0.9–0.95): on learners' clips
# it catches more at the same false marks, but on professionals' correct pages it nearly doubles the false alarms
# (0.58–0.77 per 100 words), and /record's (8 in 7 takes).
WORDS_P_V6 = dict(WORDS_P, alt_pen=-2.0, extra_min=0.3, fill=-0.4)
# v6's naming thresholds (`into`), over similar.P. v6 fits a passage's words with smaller margins than the released model:
# at the released model's thresholds it named 100 of bench-v0's 275 planted slips and swapped endings (the released
# model 188). With these, 134 (79 slips into a similar ayah of 111, 55 endings of 164), none wrong, none false. Used only
# when the released model's frames aren't there (RECITE_SIDE_FRAMES=0): a v6 take names its slips on those (SideFrames).
SIMILAR_P_V6 = {'adv': 80.0, 'gain': 0.35, 'end_adv': 20.0, 'end_gain': 0.55}
# v7 (Nov 18 2026): v6's recipe without Tadabur (CC BY-NC 4.0): a teacher from Muaalem's own weights, then the small
# model distilled from it, on Muaalem's shards, Tarteel users' copy and tlog only (lab: models/ft-v7; the plan and its
# gates: ~/Documents/revisely-release/retrain-no-tadabur.md). Picked with RECITE_WORDS_EAR=v7 (Dev); without it the
# words level stays on v6. Lab, against v6 (in brackets), same checker:
# - v6's word settings missed 5 replaced words that v6 marks (v7 heard them as the expected word): planted slips 95.6%.
#   A word whose sounds fit badly on average is wrong from -5.0 (mean_gop; -6.0 on v6): professionals' planted slips
#   caught 96.9% (97.1%), false alarms 0.50 per 100 words (0.45); learners' word marks unchanged by it.
# - Letters: the bar flags 0.35% of professionals' correct words (0.3% on v6 and the released model). v7's letters
#   scores put the 0.3% bar where it marks fewer learners: 19.1% of correct clips, 53.1% of mistaken. At 0.35%: 20.0 /
#   54.1% (v6 at 0.3%: 25.2 / 57.3%). Past the bar but not the strict one (0.1%) a mark is `likely`, "Not clear" in the
#   app, never counted, so the bar sets how many "Not clear" notes show.
# - Women's check: pass. /record: 6 of 6 slips, 1 false alarm (5 of 6, none). Planted hesitations 1 of 120 (1),
#   corrections 5 of 108 (6). The page scorecard, live: correct pages marked 20 / 20 / 60% (20 / 20 / 57%), planted
#   slips caught 93% (95%).
# - Naming a take's slips on the released model's frames (SideFrames), live: 174 of 275 right, 1 wrong, none false (171).
WORDS_EARS = {'v6': (WORDS_EAR, WORDS_BARS, WORDS_P_V6),
              'v7': ('models/words-v7/model-int8.onnx', 'bars.v7.json', dict(WORDS_P_V6, mean_gop=-5.0))}
# The words ears' fixed exports (Nov 18 2026). The students are trained without the riwaya input (train.py calls the model
# without it), but export_onnx.py's int8 files add the released model's Hafs embedding to every frame, and int8 rounding
# costs a little more. On bench-v0 the shipped files caught fewer of professionals' planted slips than the gates measured
# on the checkpoints: v6 96.4% at 0.50 false alarms per 100 words (gates: 97.1% at 0.45), v7 96.1% at 0.50 (96.9% at
# 0.50); v7's substitutions 90.6% (92.8%). The fixed exports (riwaya zeroed, full precision: model-fp32.onnx beside
# model-int8.onnx, 82 MB) measure exactly what the gates did, learners' clips included, at the same speed on the Mac
# (6.9 ms a second of audio). Riwaya zeroed alone recovers v7's half point; any int8 rounding (per channel too) still costs
# 0.3. RECITE_EAR_EXPORT=fp32 runs them when the image carries them (Dev); unset, the int8 files as before.
FIXED_EXPORT = 'model-fp32.onnx'


def ear_file(lab, path):
    """The file a words ear runs (path: its int8 export under lab): the fixed export beside it with RECITE_EAR_EXPORT=fp32
    when the image carries it, else the int8 file."""
    path = pathlib.Path(path)
    if os.environ.get('RECITE_EAR_EXPORT') == 'fp32' and (lab / path.with_name(FIXED_EXPORT)).exists():
        return path.with_name(FIXED_EXPORT)
    return path


def words_ear_name(lab, which):
    """The words level's model (RECITE_WORDS_EAR is `which`): that ear when the image under `lab` carries it, else v6
    when it does (an image without it, or a name it doesn't know), so a slip in the variable never puts Recite on the
    released model; None with '0' or neither."""
    if which == '0':
        return None
    for name in dict.fromkeys([which if which in WORDS_EARS else 'v6', 'v6']):
        path, bars, _ = WORDS_EARS[name]
        if (lab / path).exists() and (lab / bars).exists():
            return name
    return None


# The released model's frames for naming a v6 take (SideFrames): chunks of SIDE_CHUNK seconds, each run with
# SIDE_CONTEXT seconds of audio either side. The model's frames are better the longer the audio it runs on (bench-v0's
# 275 slips and endings named on a v6 take, by chunk: 4 s 171, 8 s 173, 16 s 177; the whole take in 20 s windows 179;
# frames blended across the edges did worse: 4 s 158); 8 s leaves at most 12 s of audio to run when the take ends.
# Live (LiveSession, Nov 16 2026): 171 named, 1 wrong (as the released model's own), none false, against 139 on v6's
# own frames; the thread's model time 7.8 ms a second of audio on the Mac (the hops' ~40); `done` waited for the last
# chunk 0 ms (median), 38 (p90), 81 at most on the Mac, so the slowest take's wait after Stop is unchanged.
SIDE_CHUNK = 8.0
SIDE_CONTEXT = 2.0


class Level:
    """The model a take runs on (`ear`), with the settings set on it: its bars (bars.json's shape: letters, tajweed),
    its word settings (`words_p`, WORDS_P's shape) and its naming thresholds (`similar_p`, over similar.P). Engine.level
    picks one from a take's settings."""

    def __init__(self, name, ear, bars, words_p, similar_p=None):
        self.name, self.ear, self.bars, self.words_p = name, ear, bars, words_p
        self.similar_p = dict(similar_p or {})


class SideFrames:
    """The released model's frames for a take that runs on another model (v6), for naming its slips on them
    (name_slips' `frames`): naming's rules were measured on the released model's frames. They are worked out in chunks
    on a fixed grid: chunk j keeps frames [j, j + 1) x SIDE_CHUNK seconds and is run with SIDE_CONTEXT seconds of audio
    either side (less at the take's start and end). A live session hands each chunk to a background thread once its
    audio is all in (feed, with `submit`); get() works out what is still missing itself. A chunk's audio depends only on the take (a chunk not yet whole when the take ends runs to its
    end), so the names never depend on how fast the thread was. audio(s0, s1): the take's samples [s0, s1), float32."""

    def __init__(self, ear, audio, submit=None):
        self.ear, self.audio, self.submit = ear, audio, submit
        self.n = 0                # samples of the take so far
        self.rows = {}            # chunk -> (its window's first frame, the window's frames)
        self.futs = {}            # chunk -> its background job (submit)
        self.next = 0             # the next chunk to hand to the thread
        self.ms = 0.0             # milliseconds of model time spent by get() itself
        self.bg = 0.0             # ...and by the thread, on the chunks get() took
        self.waited = 0.0         # milliseconds get() waited for the thread

    @staticmethod
    def span(j, n):
        """Chunk j's audio [s0, s1) and the frames it keeps [a, b), for a take of n samples so far."""
        C, X = int(SIDE_CHUNK * 16000), int(SIDE_CONTEXT * 16000)
        s0 = max(0, j * C - X)
        s0 -= s0 % 320
        s1 = min(n, (j + 1) * C + X)
        a = j * C // 320
        b = min((j + 1) * C // 320, (1 + n // 160) // 2) if s1 == n else (j + 1) * C // 320
        return s0, s1, a, b

    @staticmethod
    def _work(ear, x):
        t0 = time.perf_counter()
        out = ear._run(x)
        return out, (time.perf_counter() - t0) * 1000

    def feed(self, n):
        """The take now has n samples: chunks whose audio is all in go to the background thread."""
        self.n = n
        if self.submit is None:
            return
        C, X = int(SIDE_CHUNK * 16000), int(SIDE_CONTEXT * 16000)
        while (self.next + 1) * C + X <= n:
            s0, s1, _, _ = self.span(self.next, n)
            self.futs[self.next] = (s0, self.submit(self._work, self.ear, self.audio(s0, s1)))
            self.next += 1

    def _chunk(self, j):
        """Chunk j's (first frame, frames), worked out or waited for if need be."""
        if j not in self.rows:
            s0, fut = self.futs.pop(j, (None, None))
            if fut is not None and not fut.cancel():  # running or done: wait for it
                t0 = time.perf_counter()
                out, ms = fut.result()
                self.waited += (time.perf_counter() - t0) * 1000
                self.bg += ms
            else:
                s0, s1, _, _ = self.span(j, self.n)
                out, ms = self._work(self.ear, self.audio(s0, s1))
                self.ms += ms
            self.rows[j] = (s0 // 320, out)
        return self.rows[j]

    def _at(self, j, lo, hi):
        """Chunk j's frames [lo, hi) of the take (its last frame repeated past its end: the model can give a frame or
        two fewer than expected)."""
        f, out = self._chunk(j)
        r = out[max(0, lo - f):max(0, hi - f)]
        if len(r) < hi - lo:
            return np.concatenate([r, np.repeat(out[-1:], hi - lo - len(r), 0)])
        return r

    def get(self, f0, f1):
        """The released model's frames [f0, f1) of the take (n samples: feed's last)."""
        CF = int(SIDE_CHUNK * 16000) // 320
        T = (1 + self.n // 160) // 2
        parts = []
        for j in range(f0 // CF, (max(f0 + 1, min(f1, T)) - 1) // CF + 1):
            lo, hi = max(j * CF, f0), min((j + 1) * CF, T, f1)
            if lo < hi:
                parts.append(self._at(j, lo, hi))
        rows = np.concatenate(parts) if parts else np.zeros((0, len(self.ear.vocab) + 1), np.float32)
        if len(rows) < f1 - f0:  # past the take's last frame (another model's count can be a frame longer)
            rows = np.concatenate([rows, np.repeat(rows[-1:], f1 - f0 - len(rows), 0)])
        return rows

    def close(self):
        """Stops what the thread hasn't started; returns the milliseconds of model time it spent (chunks get() took
        included)."""
        for _, fut in self.futs.values():
            fut.cancel()
        bg = self.bg
        for _, fut in self.futs.values():
            if fut.done() and not fut.cancelled():
                bg += fut.result()[1]
        self.futs.clear()
        self.bg = 0.0
        return bg


class PaddedEar(checker.Hisn):
    """A fine-tuned copy of the model, exported as the released one (export_onnx.py), run as the lab ran it
    (hisn_torch: 0.4 s of silence either side, frames cropped back)."""
    name = 'v5'

    def __init__(self, path, threads=2, name=None):
        if name:
            self.name = name
        import onnxruntime as ort
        m = pathlib.Path(os.environ['LAB']) / 'models/hisnlabs-tajweed-v2'
        self.vocab = json.loads((m / 'config.json').read_text())['phonemes']
        self.index = {p: i + 1 for i, p in enumerate(self.vocab)}
        o = ort.SessionOptions()
        o.intra_op_num_threads = threads
        o.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(str(path), o, providers=['CPUExecutionProvider'])
        self.riwaya = 0

    def _run(self, x):
        z = np.zeros(int(16000 * 0.4), np.float32)
        mel = checker.log_mel(np.concatenate([z, x.astype(np.float32), z]))
        mel = mel[:, : mel.shape[1] // 2 * 2]
        out = self.sess.run(None, {'mel': mel[None], 'riwaya': np.array([self.riwaya], np.int64)})[0][0]
        k, n = 20, (1 + len(x) // 160) // 2
        return out[k:k + n].astype(np.float32)


class Engine:
    def __init__(self, threads=2):
        checker._init(threads)
        self.ear, self.key = checker.EAR, checker.KEY
        letters_v2.EAR, letters_v2.KEY = self.ear, self.key
        self.words = self.key.words
        self.bars = json.loads((pathlib.Path(os.environ['LAB']) / 'bars.json').read_text())
        self._slots = {}
        self._kw = {}  # app word -> its Key.passage entry, worked out on this instance (no table, or not in it)
        self._kw_lock = threading.Lock()
        self.slip_index = similar.Index(self.words)  # where a slip into a similar passage went (name_slips); 0.1 s
        self._labels = {}
        self.table = load_table(pathlib.Path(os.environ['LAB']) / 'words.bin')
        lab = pathlib.Path(os.environ['LAB'])
        self.ear2, self.bars2 = None, None  # the strict level's second ear (v5), when the image carries it
        if (lab / STRICT_EAR).exists() and (lab / STRICT_BARS).exists():
            self.ear2 = PaddedEar(lab / STRICT_EAR, threads)
            self.bars2 = json.loads((lab / STRICT_BARS).read_text())
        self.released = Level('released', self.ear, self.bars, WORDS_P)
        self.words_level = None  # v6 (or v7), for takes that judge no tajweed, when the image carries it
        self.words_export = None  # which of its files runs: 'int8' (as shipped first) or 'fp32' (the fixed export)
        name = words_ear_name(lab, os.environ.get('RECITE_WORDS_EAR', 'v6'))
        if name is not None:
            path, bars, words_p = WORDS_EARS[name]
            f = ear_file(lab, path)
            ear = PaddedEar(lab / f, threads, name=name)
            if ear.vocab == self.ear.vocab:  # the word table and the word graphs are in the released model's sounds
                self.words_level = Level(name, ear, json.loads((lab / bars).read_text()), words_p, SIMILAR_P_V6)
                self.words_export = 'fp32' if f.name == FIXED_EXPORT else 'int8'

    def level(self, st):
        """The model and settings for a take with settings st (settings_of): v6 when no tajweed is judged (Recite,
        Words & harakat) and the image has it; else the released model (Strict, with v5 for some rules)."""
        if self.words_level is not None and not st.get('tajweed', True):
            return self.words_level
        return self.released

    def ears(self):
        """Each level's model, for /health: {'recite': 'v6', 'harakat': 'v6', 'strict': 'released+v5'}, and with a words
        level the file it runs ('words_file': 'int8', or 'fp32' for the fixed export, ear_file)."""
        strict = 'released' + ('+v5' if self.ear2 is not None else '')
        w = self.level({'tajweed': False}).name
        return {'recite': w, 'harakat': w, 'strict': strict} | ({'words_file': self.words_export} if self.words_export else {})

    # ------------------------------------------------------------ words

    @staticmethod
    def word_count(key):
        return key.words.first[-1] + key.words.counts[-1]

    def passage_words(self, lo, hi):
        """key.passage(lo, hi) with the service's look-alikes: from the word table when the image has one for these
        words (make_words.py: Key.passage costs ~100 ms a word on Cloud Run), else worked out and kept here. Same
        entries either way."""
        P = WORDS_P
        if self.table is not None:
            off, blob = self.table['offsets'], self.table['blob']
            out = [pickle.loads(blob[off[w]:off[w + 1]]) for w in range(lo, hi)]
            for k in out:
                if isinstance(k, tuple):  # ('refused', why): a word key.passage refuses, refused the same way
                    raise ValueError(k[1])
            return out
        missing = [w for w in range(lo, hi) if w not in self._kw]
        if missing:
            self.remember(self.key.passage(missing[0], missing[-1] + 1, int(P['alts']), P['alt_rule']))
        with self._kw_lock:
            return [self._kw[w] for w in range(lo, hi)]

    def remember(self, kws):
        """Keep words worked out elsewhere (the live session's helper process)."""
        with self._kw_lock:
            if len(self._kw) > 30000:
                self._kw.clear()
            for k in kws:
                self._kw[k['word']] = k

    # ------------------------------------------------------------ the passage

    def passage(self, s, a, s2=None, a2=None, max_words=MAX_WORDS):
        """App word numbers [lo, hi) from ayah s:a to s2:a2 (the end of surah s if not given), cut at the end of an
        ayah once max_words is reached."""
        if (s, a) not in self.words.vindex:
            raise BadRequest(f'no ayah {s}:{a}')
        if s2 is not None and (s2, a2) not in self.words.vindex:
            raise BadRequest(f'no ayah {s2}:{a2}')
        v0 = self.words.vindex[(s, a)]
        v1 = self.words.vindex[(s2, a2)] if s2 is not None else v0
        if s2 is None:
            while v1 + 1 < len(self.words.counts) and self.key.ayah_of_index[v1 + 1][0] == s:
                v1 += 1
        if v1 < v0:
            raise BadRequest('the passage ends before it starts')
        lo = self.words.first[v0]
        hi = lo
        for v in range(v0, v1 + 1):
            n = self.words.counts[v]
            if hi + n - lo > max_words and hi > lo:
                break
            hi += n
        return lo, hi

    # ------------------------------------------------------------ settings

    def moshaf(self, st):
        from quran_transcript import MoshafAttributes
        aar = st['aar'] or 4  # any length: written as 4, and not judged
        return MoshafAttributes(rewaya='hafs', madd_monfasel_len=st['mon'], madd_mottasel_len=st['mot'],
                                madd_mottasel_waqf=st['mot'], madd_aared_len=aar, madd_alleen_len=aar)

    def slots(self, st):
        k = (st['mon'], st['mot'], st['aar'])
        if k not in self._slots:
            self._slots[k] = (tajweed.Slots(self.ear, self.moshaf(st)), self.moshaf(st))
        return self._slots[k]

    # ------------------------------------------------------------ the check

    def check(self, x, s, a, s2=None, a2=None, raw_settings=None, v=1):
        """x: 16 kHz mono float32 audio. Returns the result the app shows (see README.md); v=2 adds `marks` and
        `score` (recite-contract.md)."""
        st = settings_of(raw_settings or {})
        if len(x) < 16000:
            raise BadRequest('too short')
        t0 = time.perf_counter()
        lp = self.level(st).ear.logprobs(x)
        t_model = time.perf_counter() - t0
        # no one says more than about 4 words a second: a longer passage only slows the check
        lo, hi = self.passage(s, a, s2, a2, min(MAX_WORDS, int(4 * len(x) / 16000) + 20))
        return self.judge(lp, lo, hi, st, v, t_model, x=x)

    def judge(self, lp, lo, hi, st, v=1, t_model=0.0, x=None):
        """The check on the model's frames (50 a second) for app words [lo, hi): the words, then tajweed and letters
        per ayah said in full. check() runs the model first; a live session judges its streamed frames."""
        t0 = time.perf_counter() - t_model
        lv = self.level(st)  # lp is this level's model's frames
        P, vocab = lv.words_p, lv.ear.vocab
        kws = self.passage_words(lo, hi)
        g = checker.Graph(kws)
        path, _ = checker.viterbi(lp, g, P)
        refs = checker.trail_refs(hi) if P.get('trail_extra') else None
        toks = checker.heard_tokens(lp)
        statuses, flagged, _, _, extras, visits, _ = checker.decide(kws, g, lp, path, P, vocab, toks=toks, refs=refs)
        t_words = time.perf_counter() - t0 - t_model

        spans = {}
        words = []
        for i, kw in enumerate(kws):
            w = kw['word']
            stt = statuses.get(w, 'pending')
            if visits[i]:
                spans[w] = (min(v['start'] for v in visits[i]), max(v['end'] for v in visits[i]))
            if stt == 'pending':
                continue
            row = {'w': w, 'status': stt}
            f = flagged.get(w)
            if f:
                row['kind'] = f.get('kind')
                if f.get('heard'):
                    row['heard'] = f['heard']
            if w in spans:
                row['t'] = [round(spans[w][0] / FPS, 2), round(spans[w][1] / FPS, 2)]
            words.append(row)

        tj, letters = self.ayat(lp, lo, hi, statuses, spans, st, audio=x)
        t_tajweed = time.perf_counter() - t0 - t_model - t_words
        out = {
            'v': 1,
            'from': lo, 'to': hi,
            'secs': round(lp.shape[0] / FPS, 1),
            'words': words,
            'extras': [{'after': e['after'], 't': round(e['t'], 2), 'trail': bool(e.get('trail'))} for e in extras],
            'tajweed': [{k: r[k] for k in r if not k.startswith('_')} for r in tj],
            'letters': [{k: r[k] for k in r if not k.startswith('_')} for r in letters] if st['letters'] else None,
            'settings': {k: st[k] for k in ('mon', 'mot', 'aar', 'letters', 'tajweed')},
            'ms': {'model': int(t_model * 1000), 'words': int(t_words * 1000), 'tajweed': int(t_tajweed * 1000)},
        }
        if v == 2:
            heard = heard_sounds(spans, toks, vocab)
            for w_, sp in spans.items():  # a word judged wrong: its own span when it holds a word's worth of sounds
                if statuses.get(w_) == 'wrong':
                    own = ''.join(vocab[k - 1] for k, pk, _ in toks if sp[0] <= pk < sp[1])
                    if len(checker.norm_sounds(own)) >= 3:
                        heard[w_] = own
            out['marks'] = self.marks(words, flagged, heard, out['extras'], tj, letters if st['letters'] else [])
            frames = None
            if lv is not self.released and x is not None:  # named on the released model's frames (SideFrames)
                frames = SideFrames(self.released.ear, lambda s0, s1: np.asarray(x[s0:s1], np.float32))
                frames.feed(len(x))
            out['ms']['similar'] = self.name_slips(out['marks'], lp, [k['word'] for k in kws], statuses, spans,
                                                   out['extras'], lv, frames)
            out['score'] = score(statuses, out['marks'])
            out['v'] = 2
        return out

    # ------------------------------------------------------------ v2: marks

    def ayah_of(self, w):
        s, a, _ = self.key.where(w)
        return [int(s), int(a)]

    def name_heard(self, w, sounds):
        """The Qur'an word that sounds like what was heard in place of word w, when one matches closely (NAME_MAX of
        its sounds may differ); else None, and the caller spells the sounds. On bench-v0's planted substitutions the
        look-alike the decoder picked was the word said 2 times in 23: a name is given only when the sounds say so."""
        import Levenshtein
        hn = checker.norm_sounds(sounds or '')
        if len(hn) < 3:
            return None
        lex = self.key._lexicon()
        best = None
        for ln in range(max(2, len(hn) - 3), len(hn) + 4):
            for x in lex.get(ln, ()):
                d = Levenshtein.distance(hn, x['norm'])
                key = (d / len(x['norm']), d, -x['n'])
                if best is None or key < best[0]:
                    best = (key, x)
        if best is None or best[0][0] > NAME_MAX:
            return None
        s, a, p = self.key.where(w)
        if plain_word(best[1]['text']) == plain_word(self.key.uthmani(s, a)[p]):
            return None  # it sounds like the word itself: a sound said wrong, not another word
        return best[1]['text']

    def marks(self, words, flagged, heard, extras, tajweed_rows, letter_rows):
        """Every mark of a check (recite-contract.md): words, extra words, tajweed, letters."""
        out, ids = [], {}

        def add(w, kind, sure, detail=None, rule=None, **more):
            mid = f"{w}:{kind}:{detail or rule or ''}"
            ids[mid] = ids.get(mid, 0) + 1
            if ids[mid] > 1:  # two extra words after one word
                mid += f'#{ids[mid]}'
            m = {'id': mid, 'w': int(w), 'ayah': self.ayah_of(w), 'kind': kind}
            if detail:
                m['detail'] = detail
            if rule:
                m['rule'] = rule
            m.update({k: v for k, v in more.items() if v is not None})
            m['sure'] = sure
            out.append(m)

        for row in words:
            w, st = row['w'], row['status']
            t = row.get('t')
            if st == 'missed':
                add(w, 'skipped', 'clear', t=t)
            elif st == 'wrong':
                detail = (flagged.get(w) or {}).get('kind') or 'sound'
                h, exact = None, None
                named = self.name_heard(w, heard.get(w)) if heard.get(w) else None
                if named:
                    h, exact = named, True
                elif heard.get(w):
                    h, exact = spell(heard[w]), False
                elif detail == 'lookalike' and row.get('heard'):
                    h, exact = row['heard'], True
                add(w, 'word', 'clear' if detail in CLEAR_WORD_KINDS else 'likely', detail=detail, heard=h,
                    heardExact=exact, t=t)
        for e in extras:
            add(e['after'], 'added', 'likely', detail='trail' if e.get('trail') else None)
        for r in tajweed_rows:
            add(r['w'], 'tajweed', r.get('_sure', 'likely'), rule=r['rule'], got=r.get('got'),
                expected=r.get('expected'))
        for r in letter_rows:
            kind = letters_v2.kind_of(r['slip'])
            detail = 'shadda' if kind == 'shadda' else None
            add(r['w'], 'harakat' if kind in ('haraka', 'shadda') else 'letter', r.get('_sure', 'likely'),
                detail=detail, slip=slip_of(r['slip']), heard=spell(r['_heard']) if r.get('_heard') else None,
                heardExact=False if r.get('_heard') else None)
        return out

    def name_slips(self, marks, lp, order, statuses, spans, extras, lv=None, frames=None):
        """Where the reciter went, on the mark of a slip (recite-contract.md, `into`): {w, ayah, also?, ending?}.
        - A run of words skipped or said wrong that is a similar passage's words: `into` on the run's first word mark,
          w being the place's first word said (lab, Nov 15 2026: of bench-v0's 111 planted slips into a similar ayah,
          107 named with the right place, none with a wrong one).
        - An ayah's last word said as another nearby ayah's last word (`ending: true`; 78 of 164 swapped endings named,
          none wrongly; /record w4's «إذا وقب» for «إذا حسد»).
        `also`: other ayat with the same words as far as heard. Nothing was named on any other run of the bench, the
        learners', /record's or the Dev takes. The lab's similar.py. Not shown by the app yet (Majd: "show nothing
        until the numbers are good").
        Returns the milliseconds it took: 0–20 ms a take on the Mac, 74–104 on Cloud Run. Both passes share
        similar.P['budget'], a measure of work, not time (about 0.5 s on Cloud Run), so a take full of mistakes can't
        hold up the answer and a take names the same on any machine. Without the word table each place's sounds would
        be worked out here (~100 ms a word), so nothing is named.
        lv: the take's level (the released model's if not given): its word settings, and its naming thresholds over
        similar.P (Level.similar_p), set on its own frames.
        frames: on another level's take, the released model's frames (SideFrames): each run is decoded again and named
        on those, with the released model's settings, as on a released take (bench-v0's 275 slips and endings, live:
        171 named on a v6 take this way, 139 on v6's own frames; 188 on a released take).
        """
        if self.table is None:
            return 0
        lv = lv or self.released
        if frames is not None and lv is not self.released:
            lv = self.released
        else:
            frames = None
        P, sp = lv.words_p, lv.similar_p
        t0 = time.perf_counter()
        work = {'left': similar.P['budget'], 'decode': NAME_WORK}
        names = []
        try:
            if P.get('gap_back') is None:
                names = self._slips_in(lp, order, statuses, spans, extras, work, sp)
            else:
                # each run of marks that could be a slip (a similar passage forks off near its start, or it ends an
                # ayah) is decoded again without going back from a filler, and named from that alone: named from the
                # take's own decode, bench-v0's correct takes got 3 false names
                for lo, hi, ends_heard, first, last in self._mark_runs(order, statuses, extras, spans):
                    if not self._could_name(first, last):
                        continue
                    plain = self._decode_plain(lp, lo, hi, spans, work, ends_heard, P, frames)
                    if plain is not None:
                        named = {n['mark'] for n in names}
                        names += [n for n in self._slips_in(*plain, work, sp) if n['mark'] not in named]
        except Exception as e:  # naming is extra: it never costs the answer
            print(f'similar: {type(e).__name__}: {e}', file=sys.stderr)
        word_marks = sorted((m for m in marks if m['kind'] in ('skipped', 'word')), key=lambda m: m['w'])
        for n in names:
            hi = n['upto'] if n['upto'] is not None else 10 ** 9
            m = next((m for m in word_marks if n['mark'] <= m['w'] < hi and 'into' not in m), None)
            if m is None:
                continue
            ayah = self.slip_index.ayah(n['w'])
            also = []
            for x in n['also']:
                a = self.slip_index.ayah(x)
                if a != ayah and a not in also:
                    also.append(a)
            m['into'] = ({'w': int(n['w']), 'ayah': ayah} | ({'also': also[:5]} if also else {})
                         | ({'ending': True} if n.get('kind') == 'ending' else {}))
        return int((time.perf_counter() - t0) * 1000)

    def _slips_in(self, lp, order, statuses, spans, extras, work, sp=None):
        """similar.find, then similar.endings on the runs it didn't name; sp: thresholds over similar.P."""
        names = similar.find(lp, order, statuses, spans, extras, self._labels_of, self.slip_index, p=sp, work=work)
        marked = {n['mark'] for n in names}
        return names + [n for n in similar.endings(lp, order, statuses, spans, self._forms_of, self.slip_index,
                                                   p=sp, work=work) if n['mark'] not in marked]

    @staticmethod
    def _mark_runs(order, statuses, extras, spans):
        """App word ranges [lo, hi) around each run of words skipped or said wrong (or an extra word), runs closer than
        NAME_JOIN words taken together: from the first word heard up to NAME_AROUND[0] before the run to the last word
        heard up to NAME_AROUND[1] after it (the decode again ends on a word the take's own decode heard)."""
        at = {w: i for i, w in enumerate(order)}
        bad = sorted({at[w] for w, st in statuses.items() if st in ('wrong', 'missed') and w in at}
                     | {at[e['after']] for e in extras if not e.get('trail') and e['after'] in at})
        runs = []
        for i in bad:
            if runs and i - runs[-1][1] <= NAME_JOIN:
                runs[-1][1] = i
            else:
                runs.append([i, i])
        before, after = NAME_AROUND
        out = []
        for a, b in runs:
            lo = next((i for i in range(max(0, a - before), a + 1) if order[i] in spans), a)
            hi = next((i for i in range(min(len(order) - 1, b + after), b, -1) if order[i] in spans), None)
            out.append((order[lo], order[hi] + 1 if hi is not None else order[min(len(order) - 1, b + after)] + 1,
                        hi is not None, order[a], order[b]))
        return out

    def _could_name(self, first, last):
        """App words first..last (a run of marks) could be named: a similar passage forks off within two words of its
        start, or one of them ends an ayah (similar.endings)."""
        idx = self.slip_index
        return any(idx.places(f) for f in range(max(2, first - 2), first + 3) if f < len(idx.norm)) \
            or any(w in idx.is_last for w in range(first, last + 1))

    def _decode_plain(self, lp, lo, hi, spans, work, ends_heard=True, P0=None, frames=None):
        """App words [lo, hi) decoded again over their own audio without going back from a filler (gap_back off, the
        decoder similar.py was measured on): (frames, order, statuses, spans, extras), the run's own frames (the take's
        lp, or `frames`' over the same audio: SideFrames) and the rest as decide() gives them, spans in those frames;
        None when its words weren't heard or the naming's work is spent. Named on the run's own frames alone, a slip's
        place is fitted on the run's audio, never past it. With gap_back, a slip into a
        similar passage is often heard as words tried and taken back (a short word visited again and again between
        fillers), which leaves no run to name: bench-v0's 111 planted slips named 107 -> 72 without this, 107 with.
        ends_heard: [lo, hi) ends on a word the take's decode heard, and this decode must end there too: over a short
        window, free speech is cheaper than the jumps across a long run of skipped words that the whole take's decode
        has to make (2:255 slipping into 20:8 for 45 words). P0: the take's word settings (WORDS_P if not given)."""
        import live  # noqa: E402  (its Decoder: the checker's step, vectorized; live imports this module first)
        heard = [spans[w] for w in range(lo, hi) if w in spans]
        if not heard:
            return None
        f0 = max(0, min(a for a, _ in heard) - NAME_PAD)
        f1 = min(len(lp), max(b for _, b in heard) + NAME_PAD)
        if f1 <= f0:
            return None
        kws = self.passage_words(lo, hi)
        g = checker.Graph(kws)
        units = (f1 - f0) * (g.S + NAME_STATE_COST)
        if units > work['decode']:
            return None
        work['decode'] -= units
        P = dict(P0 or WORDS_P, gap_back=None, revisit_keep=False)
        if ends_heard:
            P['stop'] = -1e6
        run = frames.get(f0, f1) if frames is not None else lp[f0:f1]
        dec = live.Decoder(g, P, cap=f1 - f0 + 10)
        dec.feed(run)
        path, _ = dec.traceback(final=True)
        st, _, _, _, extras, visits, _ = checker.decide(kws, g, run, path, P, self.ear.vocab)
        sp = {kws[i]['word']: (min(v['start'] for v in visits[i]), max(v['end'] for v in visits[i]))
              for i in range(len(kws)) if visits[i]}
        return run, [k['word'] for k in kws], st, sp, extras

    def _forms_of(self, w):
        """Word w's forms (joined, started on, stopped on), for similar.endings."""
        try:
            return self.passage_words(w, w + 1)[0]['forms']
        except ValueError:
            return []

    def _labels_of(self, lo, hi):
        """The sounds of app words [lo, hi) as the checker hears them joined, and where each word ends (similar.py)."""
        got = self._labels.get((lo, hi))
        if got is None:
            try:
                kws = self.passage_words(lo, hi)
            except ValueError:  # a word the checker refuses: that place isn't tried
                kws = []
            lab, ends = [], []
            for k in kws:
                lab += k['forms'][0]['labels']
                ends.append(len(lab))
            got = (lab, ends)
            with self._kw_lock:
                if len(self._labels) > 20000:
                    self._labels.clear()
                self._labels[(lo, hi)] = got
        return got

    def ayat(self, lp, lo, hi, statuses, spans, st, audio=None):
        """Tajweed (and letters) for each ayah of the passage said in full, on its own frames."""
        out, letters = [], []
        w = lo
        while w < hi:
            s, a, _ = self.key.where(w)
            first = self.words.first[self.words.vindex[(s, a)]]
            n = self.words.counts[self.words.vindex[(s, a)]]
            w = first + n
            if first < lo or first + n > hi:
                continue
            o, l_ = self.ayah_notes(lp, s, a, statuses, spans, st, audio=audio)
            out += o
            letters += l_
        return out, letters

    def ayah_notes(self, lp, s, a, statuses, spans, st, audio=None, readings=None):
        """Tajweed (and letters) for ayah s:a, on its own frames; nothing unless it was said in full. audio: the take's
        samples (16 kHz float32, lp's frame grid), for the strict ear (V5_KINDS and the nasal places) when there is one.
        readings: each word's last reading (start, end), when the caller knows them: an ayah with a word said again
        (going back to restart, which is no mistake: Majd, Nov 14 2026) is judged on each word's last reading in
        order, the earlier reading and the pause cut out (ayah_pieces)."""
        SL, ms = self.slots(st)
        lv = self.level(st)  # lp is this level's model's frames, judged against its own bars
        ear, B = lv.ear, lv.bars
        S = B.get('strict', {})  # strict bars: past one, a mark is `clear` (bars.json from before them: all `likely`)
        first = self.words.first[self.words.vindex[(s, a)]]
        n = self.words.counts[self.words.vindex[(s, a)]]
        ws = list(range(first, first + n))
        out, letters = [], []
        if not st.get('tajweed', True) and not st['letters']:
            return out, letters  # words only: nothing to judge per ayah
        sts = [statuses.get(x) for x in ws]
        if any(x not in SAID for x in sts) or ws[0] not in spans or ws[-1] not in spans:
            return out, letters  # not said in full: its sounds can't be lined up
        pieces = ayah_pieces(ws, spans, readings, lp.shape[0])
        nf = sum(b - a_ for a_, b in pieces)
        if nf < 10:
            return out, letters
        win = np.concatenate([lp[a_:b] for a_, b in pieces]) if len(pieces) > 1 else lp[pieces[0][0]:pieces[0][1]]
        win2 = None  # the strict ear's frames for the same window
        if st.get('tajweed', True) and self.ear2 is not None and audio is not None:
            seg = np.concatenate([np.asarray(audio[a_ * 320:b * 320], np.float32) for a_, b in pieces])
            if len(seg) >= 3200:
                w2 = self.ear2.logprobs(seg)
                if w2.shape[0] >= nf - 2:
                    win2 = w2[:nf]
        B2 = self.bars2 if win2 is not None else None
        S2 = (B2 or {}).get('strict', {})
        bad = {i for i, x in enumerate(sts) if x == 'wrong'}
        near = bad | {i - 1 for i in bad} | {i + 1 for i in bad}

        def flag(i, rule, got=None, expected=None, clear=False):
            if i is None or i in near or not 0 <= i < n:
                return
            row = {'w': first + i, 'rule': rule}
            if got is not None:
                row['got'] = round(float(got), 1)
            if expected is not None:
                row['expected'] = int(expected)
            row['_sure'] = 'clear' if clear else 'likely'
            out.append(row)

        try:
            judged = tajweed.judge(win, ear, SL.ayah(s, a)) if st.get('tajweed', True) else []
        except Exception:
            judged = []
        if win2 is not None:  # qalqalah and lazim madd from the strict ear, the rest from the released one
            try:
                judged2 = tajweed.judge(win2, self.ear2, SL.ayah(s, a))
            except Exception:
                judged2 = None
            if judged2 is not None:
                judged = [j for j in judged if j['kind'] not in V5_KINDS] + \
                    [dict(j, _v5=True) for j in judged2 if j['kind'] in V5_KINDS]
        # tajweed and nasal places count quran_transcript's words; the app joins two pairs into one word (بَعْدَ مَا,
        # إِلْ يَاسِينَ), so map them onto the app's
        qa = self.key.app_index(s, a)
        to_app = lambda i: qa[i] if i is not None and 0 <= i < len(qa) else i  # noqa: E731
        for j in judged:
            kind, i = j['kind'], to_app(j.get('word'))
            tc = j.get('tcount')
            if kind == 'Normal Madd' and tajweed.madd_dropped(j):
                flag(i, 'madd_dropped', expected=2)
            elif kind == 'Lazem Madd' and tc is not None and tc < 4.5 and j.get('timing_v') is not None:
                # judged on time only. An ayah too short to measure the reciter's pace in (الٓمٓ alone: under 3 short
                # syllables) leaves its count to the model, which reads long madds short: Majd's الٓمٓ of 4.8-6.5 s
                # read 2.2-2.9 counts in all three of his takes, so it isn't judged (Nov 14 2026)
                flag(i, 'madd_lazim', tc, 6, clear=tc < LAZIM_CLEAR_UNDER)
            elif kind in MADD_RULES and tc is not None and abs(tc - j['golden']) >= 1.5 \
                    and not (kind == 'Aared Madd' and not st['aar']):
                flag(i, MADD_RULES[kind], tc, j['golden'], clear=abs(tc - j['golden']) >= MADD_CLEAR_OFF)
            elif kind == 'Qalqalah' and j.get('_v5'):
                if j['margin'] > B2['margin']['Qalqalah']:
                    flag(i, 'qalqalah', clear=j['margin'] > S2.get('margin', {}).get('Qalqalah', float('inf')))
            elif kind == 'Qalqalah' and j['margin'] > B['margin']['Qalqalah']:
                flag(i, 'qalqalah', clear=j['margin'] > S.get('margin', {}).get('Qalqalah', float('inf')))
            elif kind in ('Ghunnah', 'Ikhfa'):
                T = B['timing'][kind]
                if j.get('nasal_v') is not None:
                    sc = (j['margin'] - T['m_mean']) / T['m_std'] + (T['t_mean'] - j['nasal_v']) / T['t_std']
                    hit = sc > T['bar']
                    clear = sc > S.get('timing', {}).get(kind, float('inf'))
                else:
                    hit = j['margin'] > B['margin'][kind]
                    clear = j['margin'] > S.get('margin', {}).get(kind, float('inf'))
                if hit:
                    flag(i, kind.lower(), clear=clear)

        text = ' '.join(self.key.uthmani(s, a))
        try:
            stops = nasal_rules.stops_after(s, a, n)
            ph, pls = nasal_rules.places(text, ms, stops) if st.get('tajweed', True) else ('', [])
            if pls and win2 is not None:
                margins = nasal_rules.judge(win2, self.ear2, ph, pls)
            else:
                margins = nasal_rules.judge(win, ear, ph, pls) if pls else []
        except Exception:
            pls, margins = [], []
        NB = (B2 or B)['nasal']
        for p, m in zip(pls, margins):
            if m > NB[p['kind']]:
                flag(to_app(text[:p['char']].count(' ')), NASAL_RULES[p['kind']])

        if st['letters']:
            try:
                lj = letters_v2.words_judge(win, self.key.phonetize(self.key.uthmani(s, a)))
            except Exception:
                lj = []
            L = B['letters']
            for i, rows in enumerate(lj):
                if rows is None or i in bad:
                    continue
                ok = [r for r in rows if letters_v2.kind_of(r[1]) != 'length'
                      and not (r[1].startswith('no shadda') and (r[2] is None or r[2] > L['shadda_max']))]
                if ok:
                    top = max(ok, key=lambda r: r[0])
                    if top[0] > L['bar']:
                        letters.append({'w': first + i, 'slip': top[1],
                                        '_heard': top[3] if len(top) > 3 else None,
                                        '_sure': 'clear' if top[0] > S.get('letters', float('inf')) else 'likely'})
        return out, letters
