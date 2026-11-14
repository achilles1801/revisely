"""Free check 4 (review, Nov 14 2026): the default level ("Words & harakat") as users get it, for each ear.

The share of learners-v0 clips with at least one mark, word or letter/harakat, correct clips / clips with mistakes:
  - word marks: a checker run's results on learners-v0 (default: learners.ft.<ear>.wp, the deployed word settings);
  - letters: the deployed rule (make_bars.py): one bar set so that a share of professionals' words is flagged, a
    missing shadda counted only if the consonant was held under the professionals' 5th percentile. 0.3% is the
    deployed `likely` bar, 0.1% `clear`.

  python default_level.py hisn v5 teacher8k            -> the table at each letters bar
  python default_level.py --frontier hisn teacher8k    -> with every word setting of runs/word_sweep.json: the
                                                               best catch at each level of correct clips marked
"""
import collections
import json
import os
import pathlib
import sys

import numpy as np

LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import letters_v2  # noqa: E402

BARS = (0.0003, 0.001, 0.002, 0.003, 0.005, 0.01)
ITEMS = sorted((LAB / 'data/learners-v0/items').glob('*.json'))
TRUTH = {}
for f in ITEMS:
    t = json.loads(f.read_text())
    TRUTH[t['id']] = t['variant'] == 'learner-correct'


def letter_scores(ear):
    """Per learner clip, its highest letters score over the deployed rule; and the professionals' scores."""
    rows = json.load(open(LAB / f'runs/v0/letters_v2.{ear}.json'))
    pro_words = [r[2][0] for r in rows if r[0] == 'pro']
    held = [h for w in pro_words for m, why, h, *_ in w if why.startswith('no shadda') and h is not None]
    smax = float(np.percentile(held, 5))

    def best(w):
        return max([m for m, why, h, *_ in w if letters_v2.kind_of(why) != 'length'
                    and not (why.startswith('no shadda') and (h is None or h > smax))] or [-1e9])
    pro = np.array([best(w) for w in pro_words])
    clip = {r[1]: max((best(w) for w in r[2]), default=-1e9) for r in rows if r[0] in ('learner-ok', 'learner-bad')}
    return pro, clip


def word_marked(tag):
    R = LAB / 'runs/v0/results' / tag
    out = {}
    for cid in TRUTH:
        p = R / f'{cid}.json'
        if p.exists():
            out[cid] = bool(json.loads(p.read_text())['flagged'])
    return out


def rates(marked):
    ok = [marked[c] for c in marked if TRUTH[c]]
    bad = [marked[c] for c in marked if not TRUTH[c]]
    return 100 * np.mean(ok), 100 * np.mean(bad), len(ok), len(bad)


def stamps(tags, mixed):
    """Each learners run's stamp; runs from different checkers aren't put side by side (run_stamp.py)."""
    import run_stamp
    run_stamp.check([LAB / 'runs/v0/results' / t for t in tags], mixed=mixed)


def table(ears, mixed=False):
    stamps([f'learners.ft.{e}.wp' for e in ears], mixed)
    print('| letters bar (share of pro words) | ' + ' | '.join(ears) + ' |')
    print('| --- |' + ' --- |' * len(ears))
    cache = {e: (letter_scores(e), word_marked(f'learners.ft.{e}.wp')) for e in ears}
    for q in BARS:
        cells = []
        for e in ears:
            (pro, clip), words = cache[e]
            bar = float(np.quantile(pro, 1 - q))
            marked = {c: words[c] or clip.get(c, -1e9) > bar for c in words}
            ok, bad, n_ok, n_bad = rates(marked)
            cells.append(f'{ok:.1f}% / {bad:.1f}%')
        print(f'| {100 * q:g}%{" (clear)" if q == 0.001 else " (deployed)" if q == 0.003 else ""} | '
              + ' | '.join(cells) + ' |')
    words_only = [rates(cache[e][1]) for e in ears]
    print('| words alone | ' + ' | '.join(f'{ok:.1f}% / {bad:.1f}%' for ok, bad, *_ in words_only) + ' |')
    print(f'(correct clips / clips with mistakes; n = {words_only[0][2]} / {words_only[0][3]})')


def frontier(ears, mixed=False):
    sweep = json.loads((LAB / 'runs/word_sweep.json').read_text())
    stamps([t for t, v in sweep.items() if v['ear'] in ears] + [f'learners.ft.{e}.wp' for e in ears], mixed)
    qs = [0.0001, 0.0003, 0.001, 0.002, 0.003, 0.005, 0.01, 0.02]
    pts = collections.defaultdict(list)
    for e in ears:
        pro, clip = letter_scores(e)
        tags = [t for t, v in sweep.items() if v['ear'] == e] + [f'learners.ft.{e}.wp']
        for tag in tags:
            words = word_marked(tag)
            for q in qs + [None]:
                bar = float('inf') if q is None else float(np.quantile(pro, 1 - q))
                marked = {c: words[c] or clip.get(c, -1e9) > bar for c in words}
                ok, bad, *_ = rates(marked)
                pts[e].append((ok, bad, tag, q))
    print('best share of clips with mistakes marked, at most this share of correct clips marked:')
    print('| correct marked at most | ' + ' | '.join(ears) + ' |')
    print('| --- |' + ' --- |' * len(ears))
    for cap in (5, 7.5, 10, 12.5, 15, 20, 25, 30, 35):
        cells = []
        for e in ears:
            ok_pts = [p for p in pts[e] if p[0] <= cap]
            if not ok_pts:
                cells.append('–')
                continue
            ok, bad, tag, q = max(ok_pts, key=lambda p: (p[1], -p[0]))
            cells.append(f'{bad:.1f}% ({ok:.1f}%; {tag.split(".", 2)[-1]}, letters {"off" if q is None else f"{100 * q:g}%"})')
        print(f'| {cap:g}% | ' + ' | '.join(cells) + ' |')


if __name__ == '__main__':
    mixed = '--mixed' in sys.argv  # allow runs from different checkers side by side
    argv = [a for a in sys.argv[1:] if a != '--mixed']
    if argv[0] == '--frontier':
        frontier(argv[1:], mixed)
    else:
        table(argv, mixed)
