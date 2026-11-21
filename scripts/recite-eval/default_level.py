"""Free check 4 (review, Nov 14 2026): the default level ("Words & harakat") as users get it, for each ear.

The share of learners-v0 clips with at least one mark, word or letter/harakat, correct clips / clips with mistakes:
  - word marks: a checker run's results on learners-v0 (default: learners.ft.<ear>.wp, the deployed word settings);
  - letters: the deployed rule (make_bars.py): one bar set so that a share of professionals' words is flagged, a
    missing shadda counted only if the consonant was held under the professionals' 5th percentile. 0.3% is the
    deployed `likely` bar, 0.1% `clear`.

  python default_level.py hisn v5 teacher8k            -> the table at each letters bar
  python default_level.py --frontier hisn teacher8k    -> with every word setting of runs/word_sweep.json: the
                                                               best catch at each level of correct clips marked
  python default_level.py --by-gender hisn teacher8k   -> men's and women's clips apart (intervals resample people),
                                                               and the check every model passes before it reaches the
                                                               Dev app (Majd, Nov 15 2026): women's correct clips
                                                               aren't marked noticeably more often than men's
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
TRUTH, GENDER, PERSON = {}, {}, {}
for f in ITEMS:
    t = json.loads(f.read_text())
    TRUTH[t['id']] = t['variant'] == 'learner-correct'
    GENDER[t['id']] = t.get('gender')  # RetaSy's reciter_gender; None for 318 clips
    PERSON[t['id']] = t.get('reciter')
# The check before a model reaches the Dev app: at any setting the app marks at (words alone, letters clear, letters
# deployed), it fails when women's correct clips are marked more than GATE_POINTS more often than men's and the gap is
# past GATE_Z standard errors (one-sided 95%). The teacher at letters clear, 4.8% of men's against 14.6% of women's
# (review, Nov 14 2026), fails it; the released model passes.
GATE_POINTS = 5.0
GATE_Z = 1.64


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


def person_rate(marked, clips, n_boot=2000, seed=0):
    """Share of clips marked (%), and its standard error resampling people (all of a person's clips together)."""
    people = collections.defaultdict(list)
    for c in clips:
        people[PERSON[c]].append(bool(marked[c]))
    groups = list(people.values())
    if not groups:
        return float('nan'), float('nan'), [], 0
    point = 100 * sum(map(sum, groups)) / sum(map(len, groups))
    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(n_boot):
        pick = [groups[i] for i in rng.integers(0, len(groups), len(groups))]
        boots.append(100 * sum(map(sum, pick)) / sum(map(len, pick)))
    return point, float(np.std(boots)), boots, len(groups)


def by_gender(ears, mixed=False):
    stamps([f'learners.ft.{e}.wp' for e in ears], mixed)
    settings = [('words alone', None), ('letters 0.1% (clear)', 0.001), ('letters 0.3% (deployed)', 0.003)]
    gate = {}
    for e in ears:
        (pro, clip), words = letter_scores(e), word_marked(f'learners.ft.{e}.wp')
        print(f'### {e}')
        print('| setting | correct clips marked: men | women | clips with mistakes marked: men | women |')
        print('| --- | --- | --- | --- | --- |')
        for name, q in settings:
            bar = float('inf') if q is None else float(np.quantile(pro, 1 - q))
            marked = {c: words[c] or clip.get(c, -1e9) > bar for c in words}
            cells, boots = [], {}
            for want in (True, False):
                for g in ('male', 'female'):
                    clips = [c for c in marked if TRUTH[c] == want and GENDER[c] == g]
                    pt, se, bs, n = person_rate(marked, clips, seed=hash((e, name, want, g)) % 2 ** 32)
                    cells.append(f'{pt:.1f}% ± {se:.1f} ({len(clips)} clips, {n} people)')
                    boots[(want, g)] = (pt, bs)
            print(f'| {name} | ' + ' | '.join(cells) + ' |')
            (m, mb), (w, wb) = boots[(True, 'male')], boots[(True, 'female')]
            se = float(np.std(np.array(wb) - np.array(mb)))
            gate.setdefault(e, []).append((name, w - m, se, w - m > GATE_POINTS and w - m > GATE_Z * se))
        print()
    print(f'Women vs men, correct clips marked (a setting fails above {GATE_POINTS:g} points and {GATE_Z:g} standard '
          f'errors; the app shows marks at every one of them, so a model passes only if none fails):')
    for e, rows in gate.items():
        cells = '; '.join(f'{name} {gap:+.1f} ± {se:.1f}{" FAIL" if fail else ""}' for name, gap, se, fail in rows)
        print(f'  {e}: {"FAIL" if any(r[3] for r in rows) else "pass"} ({cells})')


if __name__ == '__main__':
    mixed = '--mixed' in sys.argv  # allow runs from different checkers side by side
    argv = [a for a in sys.argv[1:] if a != '--mixed']
    if argv[0] == '--frontier':
        frontier(argv[1:], mixed)
    elif argv[0] == '--by-gender':
        by_gender(argv[1:], mixed)
    else:
        table(argv, mixed)
