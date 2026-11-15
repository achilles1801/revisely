#!/usr/bin/env python3
"""qdat's tajweed results (qdat_tajweed.py's saved rows) for men's and women's clips apart: the share of correct
places flagged and of wrong places caught, at the thresholds the report sets (5% false flags over everyone), with
intervals resampling learners (one clip each). The same check as default_level.py --by-gender: a rule fails when
women's correct places are flagged more than 5 points more often than men's, past 1.64 standard errors (a smoothed
binomial error: 0 of 18 isn't certainly 0%); with under 15 correct places in a group it says too few.

  python qdat_by_gender.py hisn teacher8k
"""
import json
import os
import pathlib
import sys

import numpy as np

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
GOOD = {'noon_moshaddadah_len': 1, 'noon_mokhfah_len': 2, 'qalqalah': 1}
MADDS = (('separate_madd', (2, 4, 5)), ('madd_aared_len', (2, 4, 6)), ('qalo_waw_len', (2,)), ('qalo_alif_len', (2,)))
MIX = 0.5
GATE_POINTS, GATE_Z = 5.0, 1.64
MIN_N = 15  # correct places a group needs before the check says anything (setting 6's aared madd has 3 in all)


def smoothed_se(flags):
    """Standard error of a share in points, with half a flag and half a miss added (0 of 18 isn't certainly 0%)."""
    n = len(flags)
    p = (np.sum(flags) + 0.5) / (n + 1)
    return 100 * float(np.sqrt(p * (1 - p) / max(n, 1)))


def rate(flags, n_boot=2000, seed=0):
    flags = np.asarray(flags, float)
    if not len(flags):
        return float('nan'), float('nan'), np.full(n_boot, np.nan)
    rng = np.random.default_rng(seed)
    boots = flags[rng.integers(0, len(flags), (n_boot, len(flags)))].mean(axis=1) * 100
    return 100 * flags.mean(), float(boots.std()), boots


def main(ear):
    rows = json.loads((LAB / f'runs/qdat/generic.rows.{ear}.json').read_text())
    gender = {m['id']: m.get('gender') for m in json.loads((LAB / 'data/qdat/index.json').read_text())}
    scale = json.loads((LAB / f'runs/qdat/generic.{ear}.json').read_text())['thresholds']['madd_scale']
    g = np.array([gender[r['id']] for r in rows])
    cases = []
    for k, good in GOOD.items():
        wrong = np.array([r['truth'][k] != good for r in rows])
        score = np.array([r['j'][k]['margin'] for r in rows])
        cases.append((k, wrong, score))
    for k, sets in MADDS:
        t = np.array([r['truth'][k] for r in rows], float)
        model = np.array([r['j'][k]['count'] for r in rows], float)
        timing = np.array([r['j'][k]['timing'] if r['j'][k]['timing'] is not None else np.nan for r in rows])
        est = (1 - MIX) * model + MIX * np.where(np.isnan(timing), model, timing * scale)
        for s in sets:
            cases.append((f'{k} (setting {s})', abs(t - s) >= 2, abs(est - s)))
    print(f'### {ear}: {int((g == "male").sum())} men, {int((g == "female").sum())} women (one clip each)')
    print('| rule | correct flagged: men | women | wrong caught: men | women | check |')
    print('| --- | --- | --- | --- | --- | --- |')
    fails = []
    for i, (name, wrong, score) in enumerate(cases):
        th = np.quantile(score[~wrong], 0.95)  # 5% false flags over everyone, as the report
        flag = score > th
        cells, boots = [], {}
        for want in (False, True):
            for sex in ('male', 'female'):
                sel = (wrong == want) & (g == sex)
                pt, se, bs = rate(flag[sel], seed=1000 * i + 10 * want + (sex == 'female'))
                cells.append(f'{pt:.1f}% ± {se:.1f} ({int(sel.sum())})')
                boots[(want, sex)] = (pt, bs)
        (m, _), (w, _) = boots[(False, 'male')], boots[(False, 'female')]
        fm, fw = flag[~wrong & (g == 'male')], flag[~wrong & (g == 'female')]
        se = float(np.hypot(smoothed_se(fm), smoothed_se(fw)))
        if min(len(fm), len(fw)) < MIN_N:
            verdict = f'too few ({len(fm)} / {len(fw)})'
        else:
            fail = (w - m) > GATE_POINTS and (w - m) > GATE_Z * se
            fails += [name] if fail else []
            verdict = f'{"FAIL" if fail else "pass"} ({w - m:+.1f} ± {se:.1f})'
        print(f'| {name} | ' + ' | '.join(cells) + f' | {verdict} |')
    print(f'{ear}: {"FAIL on " + ", ".join(fails) if fails else "pass"}\n')


if __name__ == '__main__':
    for e in sys.argv[1:] or ['hisn']:
        main(e)
