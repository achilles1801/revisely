#!/usr/bin/env python3
"""bars.json for the service: each rule's bar, set on professional reciters (bench-v0) so that about 2% of their
correct places are flagged (3 in 1,000 words for letters). Run in the lab, from its own results:

  LAB=~/revisely-mistake-lab python make_bars.py OUT/bars.json [EAR_NAME]

Reads runs/v0/pros_tajweed.json, runs/v0/nasal_bars.<ear>.json and runs/v0/letters_v2.<ear>.json, the same files
record_check.py and tajweed_compare.py set their bars from. Writes nothing but the bars (no audio, no data).
"""
import json
import os
import pathlib
import sys

import numpy as np

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
HARNESS = pathlib.Path(os.environ.get('RECITE_HARNESS', LAB / 'code/harness/scripts/recite-eval'))
sys.path.insert(0, str(HARNESS))


def main():
    out = pathlib.Path(sys.argv[1])
    ear = sys.argv[2] if len(sys.argv) > 2 else 'hisn'
    tag = '' if ear == 'hisn' else '.' + ear
    pros = json.load(open(LAB / f'runs/v0/pros_tajweed{tag}.json'))
    # rows: reciter, condition, kind, margin, ecount, golden, tcount, timing, nasal_v
    margin = {k: float(np.quantile([r[3] for r in pros if r[2] == k and r[1] == 'clean'], 0.98))
              for k in ('Ghunnah', 'Ikhfa', 'Ikhfa meem', 'Qalqalah')}
    timing = {}
    for k in ('Ghunnah', 'Ikhfa'):  # the model's margin and the nasal's held time together (tajweed_compare.py)
        P = np.array([(r[3], r[8]) for r in pros if r[2] == k and r[1] == 'clean' and len(r) > 8 and r[8] is not None])
        pm, pt = P.T
        sc = (pm - pm.mean()) / pm.std() + (pt.mean() - pt) / pt.std()
        timing[k] = {'m_mean': float(pm.mean()), 'm_std': float(pm.std()), 't_mean': float(pt.mean()),
                     't_std': float(pt.std()), 'bar': float(np.quantile(sc, 0.98)), 'n': int(len(P))}
    nasal = json.load(open(LAB / f'runs/v0/nasal_bars.{ear}.json'))
    import letters_v2  # the letters bar, as record_check.py: one bar, a shadda judged by its held time
    rows = json.load(open(LAB / f'runs/v0/letters_v2.{ear}.json'))
    pro_words = [r[2][0] for r in rows if r[0] == 'pro']
    held = [h for w in pro_words for m, why, h in w if why.startswith('no shadda') and h is not None]
    smax = float(np.percentile(held, 5))
    best = lambda w: max([m for m, why, h in w if letters_v2.kind_of(why) != 'length'
                          and not (why.startswith('no shadda') and (h is None or h > smax))] or [-1e9])
    lbar = float(np.quantile([best(w) for w in pro_words], 1 - 0.003))
    bars = {'ear': ear, 'margin': margin, 'timing': timing, 'nasal': nasal,
            'letters': {'bar': lbar, 'shadda_max': smax}}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bars, indent=1))
    print(json.dumps(bars, indent=1))


if __name__ == '__main__':
    main()
