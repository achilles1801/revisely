#!/usr/bin/env python3
"""Tajweed with thresholds set on the professionals (2% and 5% false flags there), then the learners' slips caught on
qdat_bench, for each model named on the command line (pros_tajweed.py and qdat_tajweed.py must have run for it)."""
import json, os, pathlib, sys
import numpy as np
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
GOOD = {'noon_moshaddadah_len': 1, 'noon_mokhfah_len': 2, 'qalqalah': 1}
KIND = {'noon_moshaddadah_len': 'Ghunnah', 'noon_mokhfah_len': 'Ikhfa', 'qalqalah': 'Qalqalah'}
for name in sys.argv[1:] or ['hisn']:
    pros = json.load(open(LAB / f"runs/v0/pros_tajweed{'' if name == 'hisn' else '.' + name}.json"))
    q = json.load(open(LAB / f'runs/qdat/generic.rows.{name}.json'))
    print(f'## {name}')
    for k, kind in KIND.items():
        m = np.array([r[3] for r in pros if r[2] == kind and r[1] == 'clean'])
        m10 = np.array([r[3] for r in pros if r[2] == kind and r[1] == 'babble10'])
        y = np.array([r['truth'][k] != GOOD[k] for r in q]); s = np.array([r['j'][k]['margin'] for r in q])
        for fr in (0.02, 0.05):
            th = np.quantile(m, 1 - fr)
            print(f'{kind}: at {int(fr*100)}% false flags on professionals (clean; loud noise {100*(m10 > th).mean():.1f}%): '
                  f'learners\' slips caught {100*(s[y] > th).mean():.0f}%, learners who did it right flagged {100*(s[~y] > th).mean():.0f}%')
    for kind, g in (('Normal Madd', 2), ('Lazem Madd', 6)):
        e = np.array([r[4] for r in pros if r[2] == kind and r[1] == 'clean'])
        if len(e):
            print(f'{kind} on professionals: estimated count median {np.median(e):.2f}, off by 1.5+ counts {100*(abs(e - g) >= 1.5).mean():.1f}% (n={len(e)})')
