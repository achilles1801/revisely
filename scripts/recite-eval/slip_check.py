#!/usr/bin/env python3
"""Does a model hear planted slips? Held-back training clips (never trained on), one slip each, of every kind:
the share where the model's greedy output is closer to the slipped labels than to the original ones. A sanity check
of the training, not a real test (the slips are made the same way as in training): qdat, the professionals and
the learners are the real tests."""
import json, os, pathlib, sys, collections
import numpy as np
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import augment, checker, hisn_torch, train  # noqa: E402
import Levenshtein

def main():
    models = sys.argv[1:] or ['base']
    data = train.Data()
    V = json.loads((hisn_torch.MODEL / 'config.json').read_text())['phonemes']
    ears = {m: hisn_torch.Ear(None if m == 'base' else m, device='mps') for m in models}
    rng = np.random.default_rng(7)
    res = collections.defaultdict(lambda: collections.Counter())
    for si, mi in data.val[:400]:
        x, lab, emit = data.clip(si, mi)
        by = collections.defaultdict(list)
        for c in augment.candidates(lab, V):
            by[c[0]].append(c)
        for kind, cs in by.items():
            slip = cs[int(rng.integers(len(cs)))]
            r = augment.apply(x, lab, emit, V, slip, rng)
            if not r:
                continue
            y, nl, what = r
            old, new = ''.join(V[l - 1] for l in lab), ''.join(V[l - 1] for l in nl)
            for m, ear in ears.items():
                h = ''.join(V[k - 1] for k, _, _ in checker.heard_tokens(ear._run(y)))
                res[(m, kind)]['n'] += 1
                res[(m, kind)]['heard'] += Levenshtein.distance(h, new) < Levenshtein.distance(h, old)
                res[(m, kind)]['exact'] += h == new
    kinds = sorted({k for _, k in res})
    print('slip | ' + ' | '.join(models))
    for k in kinds:
        print(k + ' | ' + ' | '.join(f"{100*res[(m,k)]['heard']/max(1,res[(m,k)]['n']):.0f}% (n={res[(m,k)]['n']})" for m in models))

if __name__ == '__main__':
    main()
