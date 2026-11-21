#!/usr/bin/env python3
"""Do v5's new training clips say what their labels say? The released model listens (nobody does):
- mosaic clips: its phoneme errors against the stitched labels, beside its errors on whole clips;
- swap slips: its errors against the new labels and against the old ones (it should hear the new letter).

  python aug_check.py [--n 80]
"""
import argparse, os, pathlib, random, sys
import numpy as np
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import Levenshtein
import augment, checker
from train import Data


def heard(ear, x):
    lp = ear.logprobs(x)
    return ''.join(ear.vocab[k - 1] for k, _, _ in checker.heard_tokens(lp))


def err(ear, x, lab):
    ref = ''.join(ear.vocab[l - 1] for l in lab)
    return Levenshtein.distance(ref, heard(ear, x)), len(ref)


def side(ear, x, new, old):
    """Which labels the model's hearing is nearer: 'new', 'old' or 'same'."""
    en, _ = err(ear, x, new); eo, _ = err(ear, x, old)
    return 'new' if en < eo else 'old' if eo < en else 'same'


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--n', type=int, default=60); a = ap.parse_args()
    ear = checker.Hisn(threads=2)
    V = ear.vocab
    rng = np.random.default_rng(1)
    for d in ('data/train', 'data/train2'):
        data = Data(dirs=[d], max_per=0.06 if d == 'data/train2' else None, held=0.0)
        by = {}
        for si, mi in data.train:
            by.setdefault(si, []).append(mi)
        shards = random.Random(0).sample(sorted(by), min(8, len(by)))
        tot = {k: [0, 0] for k in ('whole', 'pieces alone', 'mosaic', 'long pieces alone', 'long mosaic')}
        sides = {k: {'new': 0, 'old': 0, 'same': 0} for k in ('letter', 'swap', 'haraka', 'ikhfa', 'ghunnah', 'madd', 'qalqalah')}
        for t in range(a.n):
            si = shards[t % len(shards)]
            mis = rng.choice(by[si], size=5, replace=False)
            clips = [data.clip(si, int(mi)) for mi in mis]
            def add(k, x, lab):
                e, n = err(ear, x, lab); tot[k][0] += e; tot[k][1] += n
            add('whole', clips[0][0], clips[0][1])
            for tag, kw in (('', {}), ('long ', {'min_len': 12, 'max_len': 40})):
                ps = augment.mosaic_pieces(clips[:3], V, rng, **kw)
                if len(ps) >= 2:
                    for x, lab in ps:
                        add(tag + 'pieces alone', x, lab)
                    add(tag + 'mosaic', augment.join([x for x, _ in ps]), [l for _, ls in ps for l in ls])
            x, lab, emit = clips[3]
            for kind in ('letter', 'swap', 'haraka', 'ikhfa', 'ghunnah', 'madd', 'qalqalah'):
                cands = [c for c in augment.candidates(lab, V) if c[0] == kind]
                if cands:
                    out = augment.apply(x.copy(), lab, emit, V, cands[int(rng.integers(len(cands)))], rng)
                    if out is not None:
                        sides[kind][side(ear, out[0], out[1], lab)] += 1
        f = lambda p: f'{100 * p[0] / max(p[1], 1):.2f}%'
        print(d, '; '.join(f'{k} {f(v)}' for k, v in tot.items()))
        print('   heard as (new letter / old letter / neither):', {k: (v['new'], v['old'], v['same']) for k, v in sides.items()}, flush=True)


if __name__ == '__main__':
    main()
