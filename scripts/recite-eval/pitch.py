#!/usr/bin/env python3
"""A voice's typical pitch, to draw women's and children's voices more often in training (the women's check: the
teacher at step 8,000 marked women learners' correct clips 14.6% of the time against men's 4.8%; Nov 16 2026).

median_f0(x): the median fundamental frequency (Hz) of the voiced 40 ms frames of 16 kHz audio, by autocorrelation
in 70-450 Hz; 0 when too little is voiced. Adult men recite around 90-160 Hz, women and children around 180-300.

  python pitch.py DATA_DIR [...]   writes <shard>.f0.npy (one value per clip, float32) beside each <shard>.meta.pkl
  python pitch.py --check          learners-v0 by gender: how well a threshold tells them apart
"""
import json
import os
import pathlib
import pickle
import sys

import numpy as np

SR = 16000
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))


def median_f0(x, sr=SR, lo=70.0, hi=450.0, win=0.04, hop=0.02):
    x = np.asarray(x, np.float32)
    n, h = int(win * sr), int(hop * sr)
    if len(x) < n:
        return 0.0
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::h]
    frames = frames - frames.mean(axis=1, keepdims=True)
    energy = (frames ** 2).mean(axis=1)
    loud = energy > max(1e-6, 0.1 * np.percentile(energy, 90))
    frames = frames[loud]
    if len(frames) < 10:
        return 0.0
    spec = np.fft.rfft(frames * np.hanning(n), 2 * n)
    ac = np.fft.irfft(np.abs(spec) ** 2)[:, :n]
    ac = ac / np.maximum(ac[:, :1], 1e-12)
    kmin, kmax = int(sr / hi), int(sr / lo)
    k = kmin + np.argmax(ac[:, kmin:kmax], axis=1)
    voiced = ac[np.arange(len(k)), k] > 0.4
    if voiced.sum() < 10:
        return 0.0
    return float(np.median(sr / k[voiced]))


def add_f0(d):
    d = pathlib.Path(d)
    for mp in sorted(d.glob('*.meta.pkl')):
        add_f0_one(d, mp.name[:-len('.meta.pkl')])


def add_f0_one(d, name):
    d = pathlib.Path(d)
    out = d / f'{name}.f0.npy'
    if name.endswith('.voice') or out.exists():
        return
    metas = pickle.load(open(d / f'{name}.meta.pkl', 'rb'))
    audio = np.load(d / f'{name}.audio.npy', mmap_mode='r')
    f0 = np.array([median_f0(audio[m['off']:m['off'] + m['n']].astype(np.float32) / 32768.0) for m in metas],
                  np.float32)
    np.save(out, f0)
    print(f'{name}: {len(f0)} clips, median {np.median(f0[f0 > 0]) if (f0 > 0).any() else 0:.0f} Hz, '
          f'over 165 Hz {np.mean(f0 > 165):.0%}', flush=True)


def check():
    import soundfile as sf
    items = sorted((LAB / 'data/learners-v0/items').glob('*.json'))
    rows = []
    for ip in items:
        t = json.loads(ip.read_text())
        g = t.get('gender') or t.get('reciter_gender')
        if g not in ('male', 'female'):
            continue
        x, sr = sf.read(ip.with_suffix('.wav'), dtype='float32')
        rows.append((g, median_f0(x if x.ndim == 1 else x.mean(axis=1), sr)))
    for thr in (150, 165, 180):
        tp = sum(1 for g, f in rows if g == 'female' and f > thr)
        fn = sum(1 for g, f in rows if g == 'female' and f <= thr)
        fp = sum(1 for g, f in rows if g == 'male' and f > thr)
        tn = sum(1 for g, f in rows if g == 'male' and f <= thr)
        print(f'> {thr} Hz: women {tp}/{tp + fn} found, men {fp}/{fp + tn} taken for women')
    for g in ('male', 'female'):
        f = sorted(v for gg, v in rows if gg == g and v > 0)
        if f:
            print(g, len(f), 'median', round(f[len(f) // 2]), 'p10', round(f[len(f) // 10]), 'p90', round(f[9 * len(f) // 10]))


if __name__ == '__main__':
    if sys.argv[1:] == ['--check']:
        check()
    else:
        for d in sys.argv[1:]:
            add_f0(d)
