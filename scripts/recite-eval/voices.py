#!/usr/bin/env python3
"""Women's and children's voices from the training reciters (all adult men), for the fine-tune.

qdat's learners are 120 women and 39 men, aged 5 to 68; the training audio is 12 adult male reciters, and the
trained model hears a missing ikhfa far better in men (AUC 0.97) than in women (0.84). Each clip is re-voiced with
the WORLD vocoder (pyworld, MIT): pitch raised and the spectral envelope stretched (formants up), timing left
exactly as it was, so the labels, the frames of each sound and the planted slips stay valid.

The reciters already recite high (median 185 Hz), so the pitch is moved to a target drawn from qdat's learners
(women median 223 Hz, 10-90% 169-268; children 280 Hz, 253-341) rather than by a fixed factor; the bigger change is
the vocal tract (formants):
  woman  pitch to 170-275 Hz, formants x1.10-1.20
  child  pitch to 250-345 Hz, formants x1.20-1.32

  python voices.py [--jobs 10] [--dir data/train2]   writes <dir>/<shard>.voice.audio.npy (+ .voice.pkl: the settings)
"""
import argparse
import os
import pathlib
import pickle
import sys
import warnings

import numpy as np

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
SR = 16000


def revoice(x, pitch, formant, sr=SR):
    """x float32 -> same length, its median pitch moved to `pitch` Hz (x0.8-2.2 at most), formants x`formant`."""
    warnings.filterwarnings('ignore')
    import pyworld as pw
    x64 = x.astype(np.float64)
    f0, t = pw.dio(x64, sr, frame_period=5.0, f0_floor=60, f0_ceil=600)
    f0 = pw.stonemask(x64, f0, t, sr)
    sp = pw.cheaptrick(x64, f0, t, sr)
    ap = pw.d4c(x64, f0, t, sr)
    voiced = f0[f0 > 0]
    ratio = float(np.clip(pitch / np.median(voiced), 0.8, 2.2)) if len(voiced) else 1.0
    nb = sp.shape[1]
    src = np.clip(np.arange(nb) / formant, 0, nb - 1)  # the new envelope at f is the old one at f / formant
    lo = np.floor(src).astype(int); hi = np.minimum(lo + 1, nb - 1); w = src - lo
    sp2 = sp[:, lo] * (1 - w) + sp[:, hi] * w
    ap2 = ap[:, lo] * (1 - w) + ap[:, hi] * w
    y = pw.synthesize(f0 * ratio, np.ascontiguousarray(sp2), np.ascontiguousarray(ap2), sr, 5.0)
    y = y[:len(x)]
    if len(y) < len(x):
        y = np.pad(y, (0, len(x) - len(y)))
    peak = np.abs(x).max() + 1e-6
    y = y * (np.sqrt((x64 ** 2).mean() + 1e-12) / np.sqrt((y ** 2).mean() + 1e-12))
    return np.clip(y, -peak * 1.2, peak * 1.2).astype(np.float32)


def draw(rng):
    if rng.random() < 0.7:
        return 'woman', float(rng.uniform(170, 275)), float(rng.uniform(1.10, 1.20))
    return 'child', float(rng.uniform(250, 345)), float(rng.uniform(1.20, 1.32))


def shard(arg):
    name, d = arg
    d = LAB / d
    out = d / f'{name}.voice.audio.npy'
    if out.exists():
        return name, 'done before'
    metas = pickle.load(open(d / f'{name}.meta.pkl', 'rb'))
    audio = np.load(d / f'{name}.audio.npy', mmap_mode='r')
    rng = np.random.default_rng(abs(hash(name)) % 2 ** 32)
    y = np.zeros(len(audio), np.int16)
    settings = []
    for m in metas:
        x = audio[m['off']:m['off'] + m['n']].astype(np.float32) / 32768.0
        kind, p, f = draw(rng)
        try:
            v = revoice(x, p, f)
        except Exception:
            v, kind = x, 'same'
        y[m['off']:m['off'] + m['n']] = np.clip(v * 32768, -32768, 32767).astype(np.int16)
        settings.append((kind, p, f))
    tmp = d / f'{name}.voice.tmp.npy'
    np.save(tmp, y)
    pickle.dump(settings, open(d / f'{name}.voice.pkl', 'wb'))
    os.replace(tmp, out)
    return name, f'{len(metas)} clips'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=10)
    ap.add_argument('--demo', action='store_true', help='write a few before/after wavs to runs/voices/')
    ap.add_argument('--dir', default='data/train', help='folder of shards (data/train2 for Tadabur)')
    a = ap.parse_args()
    names = sorted(p.name[:-len('.meta.pkl')] for p in (LAB / a.dir).glob('*.meta.pkl') if not p.name.endswith('.voice.meta.pkl'))
    if a.demo:
        import soundfile as sf, time
        d = LAB / 'data/train'; o = LAB / 'runs/voices'; o.mkdir(parents=True, exist_ok=True)
        metas = pickle.load(open(d / f'{names[0]}.meta.pkl', 'rb')); audio = np.load(d / f'{names[0]}.audio.npy', mmap_mode='r')
        rng = np.random.default_rng(0)
        for i in (0, 50, 100):
            m = metas[i]; x = audio[m['off']:m['off'] + m['n']].astype(np.float32) / 32768.0
            sf.write(o / f'{i}.orig.wav', x, SR)
            for kind, p, f in (('woman', 225, 1.15), ('child', 290, 1.26)):
                t0 = time.time(); v = revoice(x, p, f)
                sf.write(o / f'{i}.{kind}.wav', v, SR)
                print(i, kind, f'{len(x)/SR:.1f}s audio in {time.time()-t0:.2f}s')
        return
    import multiprocessing as mp
    with mp.get_context('spawn').Pool(a.jobs) as pool:
        for name, msg in pool.imap_unordered(shard, [(n, a.dir) for n in names]):
            print(name, msg, flush=True)


if __name__ == '__main__':
    main()
