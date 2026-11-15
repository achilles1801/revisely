#!/usr/bin/env python3
"""similar.py on a checker run's results (cached ear outputs, no model run): planted slips into a similar ayah (bench
`mut`) named right, named with a wrong place, or not named; and names given anywhere else (false).

  python similar_eval.py --bench DIR --run DIR --results NAME [--slips ID:WORD,...] [--params JSON]

--slips lists runs known to be slips in sets without planted `mut` events (/record's scripted items), as item id and
the first word of the run: they count as slips found, not false names. Prints one line of counts and the time per
take (the second pass, with each place's sounds already worked out)."""
import argparse
import functools
import json
import pathlib
import sys
import time

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bench  # noqa: E402
import checker  # noqa: E402
import similar  # noqa: E402

FPS = checker.FPS


class Vocab:
    """The ear's sound list, enough for Key (no model loaded)."""

    def __init__(self, lab):
        self.vocab = json.loads((lab / 'models/hisnlabs-tajweed-v2/config.json').read_text())['phonemes']
        self.index = {p: i + 1 for i, p in enumerate(self.vocab)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bench', required=True)
    ap.add_argument('--run', required=True)
    ap.add_argument('--results', required=True)
    ap.add_argument('--ear', default='hisn')
    ap.add_argument('--slips', default='')
    ap.add_argument('--params', default='{}')
    ap.add_argument('--show', action='store_true')
    a = ap.parse_args()
    p = json.loads(a.params)
    checker.EAR = Vocab(checker.LAB)
    key = checker.KEY = checker.Key(checker.EAR)
    idx = similar.Index(key.words)
    known = {tuple(x.split(':')) for x in a.slips.split(',') if x}

    @functools.lru_cache(maxsize=None)
    def labels_of(lo, hi):
        lab, ends = [], []
        for k in key.passage(lo, hi):
            lab += k['forms'][0]['labels']
            ends.append(len(lab))
        return lab, ends

    def jtrue(e):
        s2, a2 = map(int, e['into'].split(':'))
        return key.words.first_word(s2, a2) + e['from']

    def same_place(fork, j, i_true, j_true, words):
        d = fork - i_true
        n = max(2, int(words))
        return j == j_true + d or idx.norm[j:j + n] == idx.norm[j_true + d:j_true + d + n]

    run = pathlib.Path(a.run)
    items = sorted(pathlib.Path(a.bench, 'items').glob('*.json'))
    tally = {'slips': 0, 'right': 0, 'wrong': 0, 'missed': 0, 'false': 0, 'known_found': 0, 'known': len(known)}
    times = []
    for passno in (0, 1):
        for ip in items:
            truth = json.loads(ip.read_text())
            rp = run / 'results' / a.results / ip.name
            lpp = run / 'logprobs' / a.ear / f"{truth.get('sha1') or truth['id']}.npy"
            if not rp.exists() or not lpp.exists():
                continue
            res = json.loads(rp.read_text())
            lp = np.load(lpp).astype(np.float32)
            order = [w['word'] for w in res['words']]
            spans = {w['word']: (int(round(min(v['start'] for v in w['visits']) * FPS)),
                                 int(round(max(v['end'] for v in w['visits']) * FPS)))
                     for w in res['words'] if w['visits']}
            statuses = {int(k): v for k, v in res['statuses'].items()}
            t = time.perf_counter()
            names = similar.find(lp, order, statuses, spans, res.get('extras', []), labels_of, idx, p)
            if passno == 0:
                continue
            times.append((time.perf_counter() - t) * 1000)
            muts = [e for e in truth.get('events', []) if e['type'] == 'mut' and e.get('into')]
            tally['slips'] += len(muts)
            used = set()
            for e in muts:
                hit = None
                for k, n in enumerate(names):
                    lo = n['mark'] - 2
                    hi = n['upto'] if n['upto'] is not None else 10 ** 9
                    if lo <= e['words'][0] < hi:
                        hit = k
                        break
                if hit is None:
                    tally['missed'] += 1
                    if a.show:
                        print('missed', truth['id'], e['into'])
                    continue
                used.add(hit)
                n = names[hit]
                ok = same_place(n['fork'], n['w'], e['words'][0], jtrue(e), n['words'])
                tally['right' if ok else 'wrong'] += 1
                if a.show and not ok:
                    print('wrong', truth['id'], e['into'], n)
            for k, n in enumerate(names):
                if k in used:
                    continue
                if (truth['id'], str(n['mark'])) in known:
                    tally['known_found'] += 1
                    if a.show:
                        print('found', truth['id'], idx.ayah(n['w']), n)
                    continue
                tally['false'] += 1
                if a.show:
                    print('false', truth['id'], idx.ayah(n['w']), n)
    times.sort()
    q = (lambda f: round(times[min(len(times) - 1, int(f * len(times)))], 1)) if times else (lambda f: None)
    print(json.dumps(tally), f'| ms a take: median {q(.5)} p90 {q(.9)} max {q(1.0)} ({len(times)} takes)')


if __name__ == '__main__':
    main()
