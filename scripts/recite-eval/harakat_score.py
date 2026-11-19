"""Score the planted harakat bench (runs/bench_harakat.py, data/bench-harakat) with the deployed engine at Words &
harakat, whole takes (Engine.judge on the level's own model, the int8 export the image runs). Run from
scripts/recite-check with LAB / RECITE_HARNESS set to a stage that carries the ear (stage.sh).
  python harakat_score.py OUT.json --ear released|v6|v7 [--jobs N] [--bars JSON]   (--report: only the report)
A planted slip (hsub) is caught when the word gets a mark: counted (a word mark, or a harakat/letter mark that is
clear) or shown (also "not clear"). Controls (same: the same word, same harakat, spliced from elsewhere) and every
other word should get none."""
import argparse
import json
import multiprocessing
import os
import pathlib
import sys
import wave

sys.path.insert(0, '.')
import numpy as np

B = pathlib.Path.home() / 'revisely-mistake-lab/data/bench-harakat/items'
WORD = ('word', 'skipped', 'added')
LPC = pathlib.Path(os.environ.get('LP_CACHE', pathlib.Path.home() / 'revisely-mistake-lab/runs/harakat-lp'))
ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--ear', default='released')
ap.add_argument('--jobs', type=int, default=1)
ap.add_argument('--report', action='store_true')
A = ap.parse_args()
E = None


def init():
    global E
    import engine
    E = engine.Engine(1 if A.jobs > 1 else 2)
    lv = E.released if A.ear == 'released' else E.words_level
    assert lv is not None and lv.name == A.ear, (A.ear, lv and lv.name)
    E.level = lambda st: lv


def one(ip):
    from engine import settings_of
    t = json.loads(ip.read_text())
    with wave.open(str(ip.with_suffix('.wav'))) as f:
        x = np.frombuffer(f.readframes(f.getnframes()), '<i2').astype(np.float32) / 32768
    p = LPC / A.ear / f"{t['sha1']}.npy"
    if p.exists():
        lp = np.load(p)
    else:
        lp = E.level(None).ear.logprobs(x)
        p.parent.mkdir(parents=True, exist_ok=True)
        np.save(p, lp)
    s, a0, a1 = t['sura'], t['ayat'][0], t['ayat'][1]
    lo, hi = E.passage(s, a0, s, a1)
    res = E.judge(lp, lo, hi, settings_of({'letters': '1', 'tajweed': '0'}), v=2, x=x)
    marks = [{k: m.get(k) for k in ('w', 'kind', 'sure', 'detail')} for m in res['marks']]
    return {'id': t['id'], 'reciter': t['reciter'], 'passage': t['passage'], 'condition': t['condition'],
            'range': [lo, hi], 'events': t['events'], 'marks': marks}


def report(rows):
    def counted(m):
        return m['kind'] in WORD or m['sure'] == 'clear'
    print(f'# planted harakat bench, ear {A.ear}: {len(rows)} takes')
    print('| condition | slips | caught (counted) | shown at all | endings caught / shown | inner caught / shown | '
          'controls marked (counted / shown) | other words marked per 100 (counted / shown) |')
    print('| --- | --- | --- | --- | --- | --- | --- | --- |')
    for cond in sorted({r['condition'] for r in rows}):
        rs = [r for r in rows if r['condition'] == cond]
        n = cc = sh = 0
        ends = [0, 0, 0]
        inner = [0, 0, 0]
        ctl = [0, 0, 0]
        other = [0, 0, 0]
        for r in rs:
            by_w = {}
            for m in r['marks']:
                by_w.setdefault(m['w'], []).append(m)
            planted = {}
            for e in r['events']:
                planted[e['words'][0]] = e
            for e in r['events']:
                ms = by_w.get(e['words'][0], [])
                c_, s_ = any(counted(m) for m in ms), bool(ms)
                if e['type'] == 'hsub':
                    n += 1
                    cc += c_
                    sh += s_
                    b = ends if e.get('ending') else inner
                    b[0] += 1
                    b[1] += c_
                    b[2] += s_
                else:
                    ctl[0] += 1
                    ctl[1] += c_
                    ctl[2] += s_
            near = {w + d for w in planted for d in (-1, 0, 1)}
            for w in range(*r['range']):
                if w in near:
                    continue
                ms = by_w.get(w, [])
                other[0] += 1
                other[1] += any(counted(m) for m in ms)
                other[2] += bool(ms)
        pct = lambda a, b: f'{100 * a / max(1, b):.0f}%'
        print(f'| {cond} | {n} | {pct(cc, n)} | {pct(sh, n)} | {pct(ends[1], ends[0])} / {pct(ends[2], ends[0])} '
              f'(n={ends[0]}) | {pct(inner[1], inner[0])} / {pct(inner[2], inner[0])} (n={inner[0]}) | '
              f'{pct(ctl[1], ctl[0])} / {pct(ctl[2], ctl[0])} (n={ctl[0]}) | '
              f'{100 * other[1] / max(1, other[0]):.2f} / {100 * other[2] / max(1, other[0]):.2f} |')


if __name__ == '__main__':
    if A.report:
        report(json.load(open(A.out)))
        sys.exit()
    items = sorted(B.glob('*.json'))
    if A.jobs > 1:
        with multiprocessing.get_context('spawn').Pool(A.jobs, initializer=init) as pool:
            rows = pool.map(one, items, chunksize=1)
    else:
        init()
        rows = [one(ip) for ip in items]
    json.dump(rows, open(A.out, 'w'), ensure_ascii=False)
    report(rows)
