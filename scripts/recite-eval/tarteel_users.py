#!/usr/bin/env python3
"""Tarteel's user recordings for training (v5): ordinary people reciting one ayah each on their phones, the voices
and microphones our learners have. 18,419 clips, 47 h, every surah, from the copy on Hugging Face
(ashraf-ali/quran-data, data/audio/User; listed in the lab's data/SOURCES.md). Tarteel's own fuller copy,
tarteel-ai/tlog, is gated: it needs a Hugging Face account that has accepted its terms.

A user may misread, stop early or recite another ayah, so the ayah's text is not taken as the label on trust. The
released model listens to each clip; its sounds are labelled with whichever madd lengths fit the audio best (people
differ, and one person is seldom consistent), and the clip is kept only if the model's hearing and the label are
close (`per`, the share of sounds that differ; train.py --max_per drops the rest). So a mistake is never learned as
correct recitation.

  python tarteel_users.py 112 113 114     -> data/train3/u112.audio.npy + .meta.pkl
"""
import io
import os
import pathlib
import pickle
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(HERE))
OUT = LAB / 'data/train3'
BASE = 'https://huggingface.co/datasets/ashraf-ali/quran-data/resolve/main/'
# monfasil, muttasil, the madd before a stop: every combination Hafs allows (a munfasil is never longer than the
# muttasil)
STYLES = [(mon, mot, aar) for mon in (2, 4, 5) for mot in (4, 5, 6) for aar in (2, 4, 6) if mot >= mon]


def get(url, tries=5):
    import time
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'revisely-lab'}), timeout=60) as r:
                return r.read()
        except Exception:
            if k == tries - 1:
                raise
            time.sleep(2 * (k + 1))


def rows_of(surah):
    import csv
    cache = LAB / 'data/tarteel_users.csv'
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(get(BASE + 'users_ayahs.csv'))
    return [r for r in csv.DictReader(open(cache, encoding='utf-8')) if int(r['quran_id']) // 1000 == surah]


def audio(raw):
    import soundfile as sf
    from math import gcd
    from scipy.signal import resample_poly
    x, sr = sf.read(io.BytesIO(raw), dtype='float32')
    if x.ndim > 1:
        x = x.mean(1)
    if sr != 16000:
        g = gcd(int(sr), 16000)
        x = resample_poly(x, 16000 // g, int(sr) // g).astype(np.float32)
    return x


def ctc_nll(lp, labels):
    import torch
    import torch.nn.functional as F
    t = torch.from_numpy(np.ascontiguousarray(lp, np.float32))[:, None]
    return float(F.ctc_loss(t, torch.tensor([labels]), torch.tensor([lp.shape[0]]), torch.tensor([len(labels)]),
                            blank=0, reduction='sum', zero_infinity=True))


def surah(s):
    import Levenshtein
    import checker, tajweed
    from quran_transcript import Aya, MoshafAttributes, quran_phonetizer
    OUT.mkdir(parents=True, exist_ok=True)
    name = f'u{s:03d}'
    if (OUT / f'{name}.meta.pkl').exists():
        return name, 'done before'
    rows = rows_of(s)
    with ThreadPoolExecutor(8) as pool:
        raws = list(pool.map(lambda r: _try(lambda: get(BASE + r['file_name'])), rows))
    ear = checker.Hisn(threads=1)
    phon = {}
    chunks, metas, off = [], [], 0
    dropped = {}
    drop = lambda why: dropped.__setitem__(why, dropped.get(why, 0) + 1)
    for r, raw in zip(rows, raws):
        if raw is None:
            drop('download'); continue
        x = _try(lambda: audio(raw))
        if x is None or len(x) < 24000 or len(x) > 16000 * 30:
            drop('length'); continue
        ayah = int(r['quran_id']) % 1000
        lp = ear.logprobs(x)
        best = None
        for st in STYLES:
            key = (ayah,) + st
            if key not in phon:
                try:
                    m = MoshafAttributes(rewaya='hafs', madd_monfasel_len=st[0], madd_mottasel_len=st[1],
                                         madd_mottasel_waqf=st[1], madd_aared_len=st[2])
                    ph = quran_phonetizer(Aya(s, ayah).get().uthmani, m, remove_spaces=True).phonemes
                    phon[key] = [ear.index[c] for c in ph if c in ear.index]
                except Exception:
                    phon[key] = None
            lab = phon[key]
            if not lab or lp.shape[0] < 2 * len(lab) + 2:
                continue
            nll = ctc_nll(lp, lab)
            if best is None or nll < best[0]:
                best = (nll, st, lab)
        if best is None:
            drop('no label'); continue
        _, st, labels = best
        heard = ''.join(ear.vocab[k - 1] for k, _, _ in checker.heard_tokens(lp))
        ref = ''.join(ear.vocab[l - 1] for l in labels)
        per = Levenshtein.distance(ref, heard) / max(len(ref), 1)
        if per > 0.15:
            drop('model and text disagree'); continue
        spans = tajweed.ctc_align(lp, labels)
        emit = tajweed.ctc_align.emit
        if len(emit) != len(labels):
            drop('alignment'); continue
        fit = float(np.mean([lp[emit[i][0]:emit[i][1], labels[i]].max() for i in range(len(labels))]))
        a = np.clip(x * 32768, -32768, 32767).astype(np.int16)
        chunks.append(a)
        metas.append({'off': off, 'n': len(a), 'labels': np.array(labels, np.int16),
                      'emit': np.array([emit[i] for i in range(len(labels))], np.int32),
                      'span': np.array([spans[i] for i in range(len(labels))], np.int32),
                      'fit': fit, 'per': per, 'moshaf': 'tarteel-user:%d/%d/%d' % st, 'reciter': 'tarteel-user',
                      'seg': f'{s}:{ayah}', 'uthmani': None})
        off += len(a)
    np.save(OUT / f'{name}.audio.npy', np.concatenate(chunks) if chunks else np.zeros(0, np.int16))
    pickle.dump(metas, open(OUT / f'{name}.meta.pkl', 'wb'))
    return name, f'{len(rows)} clips, {len(metas)} kept ({off / 16000 / 3600:.2f} h), dropped {dropped}'


def _try(f):
    try:
        return f()
    except Exception:
        return None


if __name__ == '__main__':
    for a in sys.argv[1:]:
        print(*surah(int(a)), flush=True)
