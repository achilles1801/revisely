#!/usr/bin/env python3
"""bench_slips.py's takes against a checker run: none of their events is a mistake, so every mark at one is wrong.
  hes / pause: a mark on the word after it or the one before, or an extra word there;
  corr: a mark on the words said again or the one replaced (a `corrected` status is right), or an extra word there;
  hadr: marks per 100 words at 1.0x (processed), 1.3x and 1.6x, against bench-v0's same takes as recorded.

  python slips_score.py --run runs/slips --results slips.hisn.wp [--clean-results ft.hisn.wp.glide]
"""
import argparse
import collections
import json
import os
import pathlib

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
MARKED = ('wrong', 'missed')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bench', default=str(LAB / 'data/bench-slips'))
    ap.add_argument('--run', default=str(LAB / 'runs/slips'))
    ap.add_argument('--results', required=True)
    ap.add_argument('--clean-results', default='ft.hisn.wp.glide', help='bench-v0 run of the same takes as recorded')
    a = ap.parse_args()
    R = pathlib.Path(a.run) / 'results' / a.results
    ev_n, ev_marked, examples = collections.Counter(), collections.Counter(), collections.defaultdict(list)
    rate = collections.defaultdict(lambda: [0, 0])  # variant -> [marks, words]
    for ip in sorted(pathlib.Path(a.bench, 'items').glob('*.json')):
        t = json.loads(ip.read_text())
        rp = R / ip.name
        if not rp.exists():
            continue
        res = json.loads(rp.read_text())
        st = {int(k): v for k, v in res['statuses'].items()}
        extras_after = {e['after'] for e in res.get('extras', [])}
        lo, hi = t['range']
        n_marks = sum(1 for w in range(lo, hi) if st.get(w) in MARKED) + len(res.get('extras', []))
        rate[t['variant']][0] += n_marks
        rate[t['variant']][1] += hi - lo
        for e in t.get('events', []):
            at = e['at']
            if e['type'] == 'corr':
                near = range(at - e['back'] + 1, at + 1)
                ex = range(at - e['back'], at + 1)
            else:
                near = range(at - 1, at + 1)
                ex = range(at - 2, at + 1)
            bad = [w for w in near if st.get(w) in MARKED] + [f'+{w}' for w in ex if w in extras_after]
            ev_n[e['type']] += 1
            if bad:
                ev_marked[e['type']] += 1
                examples[e['type']].append((t['id'], at, bad))
    print('| planted (not a mistake) | takes | marked there |')
    print('| --- | --- | --- |')
    for k in ('hes', 'pause', 'corr'):
        print(f'| {k} | {ev_n[k]} | {ev_marked[k]} ({100 * ev_marked[k] / max(1, ev_n[k]):.0f}%) |')
    print()
    clean = [0, 0]
    C = LAB / 'runs/v0/results' / a.clean_results
    for ip in sorted((LAB / 'data/bench-v0/items').glob('*.clean.clean.json')):
        rp = C / ip.name
        if rp.exists():
            res = json.loads(rp.read_text())
            lo, hi = json.loads(ip.read_text())['range']
            clean[0] += sum(1 for w in range(lo, hi) if res['statuses'].get(str(w)) in MARKED) + len(res.get('extras', []))
            clean[1] += hi - lo
    print('| correct passage | marks per 100 words |')
    print('| --- | --- |')
    print(f'| as recorded (bench-v0) | {100 * clean[0] / max(1, clean[1]):.2f} |')
    for k, lab in (('hadr10', '1.0x through the same processing'), ('hadr13', '1.3x'), ('hadr16', '1.6x')):
        m, n = rate[k]
        print(f'| {lab} | {100 * m / max(1, n):.2f} |')
    for k in ('hes', 'pause', 'corr'):
        for x in examples[k][:3]:
            print('  e.g.', k, x)


if __name__ == '__main__':
    main()
