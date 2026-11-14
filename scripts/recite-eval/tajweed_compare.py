#!/usr/bin/env python3
"""Tajweed with thresholds set on the professionals (2% and 5% false flags there), then the learners' slips caught on
qdat_bench, for each model named on the command line (pros_tajweed.py and qdat_tajweed.py must have run for it)."""
import json, os, pathlib, sys
import numpy as np
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
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
    # the model's margin and the nasal's held time together, each scaled on the professionals' (clean) places
    for k, kind in (('noon_moshaddadah_len', 'Ghunnah'), ('noon_mokhfah_len', 'Ikhfa')):
        P = [(r[3], r[8]) for r in pros if r[2] == kind and r[1] == 'clean' and len(r) > 8 and r[8] is not None]
        P10 = [(r[3], r[8]) for r in pros if r[2] == kind and r[1] == 'babble10' and len(r) > 8 and r[8] is not None]
        Q = [(r['truth'][k] != GOOD[k], r['j'][k]['margin'], r['j'][k].get('nasal_v')) for r in q]
        if len(P) < 50 or any(t is None for _, _, t in Q):
            continue
        pm, pt = np.array(P).T
        sc = lambda m_, t_: (np.asarray(m_) - pm.mean()) / pm.std() + (pt.mean() - np.asarray(t_)) / pt.std()
        base = sc(pm, pt); b10 = sc(*np.array(P10).T)
        y = np.array([a for a, _, _ in Q]); s_ = sc([b for _, b, _ in Q], [c for _, _, c in Q])
        for fr in (0.02, 0.05):
            th = np.quantile(base, 1 - fr)
            print(f'{kind} with timing: at {int(fr*100)}% false flags on professionals (loud noise {100*(b10 > th).mean():.1f}%): '
                  f"learners' slips caught {100*(s_[y] > th).mean():.0f}%, learners who did it right flagged {100*(s_[~y] > th).mean():.0f}%")
    for kind, g in (('Normal Madd', 2), ('Lazem Madd', 6)):
        e = np.array([r[4] for r in pros if r[2] == kind and r[1] == 'clean'])
        t = np.array([r[6] for r in pros if r[2] == kind and r[1] == 'clean' and len(r) > 6 and r[6] is not None])
        if len(e):
            print(f'{kind} on professionals: model count median {np.median(e):.2f}, off by 1.5+ counts {100*(abs(e - g) >= 1.5).mean():.1f}%'
                  + (f'; with timing median {np.median(t):.2f}, off by 1.5+ {100*(abs(t - g) >= 1.5).mean():.1f}%' if len(t) else '') + f' (n={len(e)})')
    # ikhfa and ghunnah by who is reciting (qdat: 120 women, 39 men, 12 children under 14)
    from qdat_curves import curve
    meta = {m['id']: m for m in json.load(open(LAB / 'data/qdat/index.json'))}
    for k in ('noon_mokhfah_len', 'noon_moshaddadah_len'):
        line = f'{KIND[k]} AUC by reciter:'
        for grp in ('man', 'woman', 'child'):
            sel = [r for r in q if (meta[r['id']]['age'] < 14) == (grp == 'child') and (grp == 'child' or meta[r['id']]['gender'] == {'man': 'male', 'woman': 'female'}[grp])]
            y = np.array([r['truth'][k] != GOOD[k] for r in sel]); s_ = np.array([r['j'][k]['margin'] for r in sel])
            line += f' {grp} ' + (f'{curve(s_, y)[1]:.2f}' if y.sum() >= 2 and (~y).sum() >= 2 else '-') + f' (n={len(sel)})'
        print(line)
